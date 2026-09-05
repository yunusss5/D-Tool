import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { BROWSER_UA, ExtractError, formatBytes, sanitizeFilename } from '@/lib/media';
import { checkProxyTarget, refererFor } from '@/lib/allowed-hosts';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { youtubeInfo } from '@/lib/extractors/youtube';
import { muxToStdout, type YtDlpFormat } from '@/lib/ytdlp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function extOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

/** RFC 5987 disposition so emoji/CJK titles survive the round trip. */
function disposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** yt-dlp format ids: "137", "140", "616", "137-drc". */
const FORMAT_ID = /^[0-9a-zA-Z_+-]{1,24}$/;

function byteSize(f: YtDlpFormat, durationSec: number): number {
  if (f.filesize && f.filesize > 0) return f.filesize;
  if (f.filesize_approx && f.filesize_approx > 0) return f.filesize_approx;
  const rate = f.tbr ?? f.vbr ?? f.abr;
  return rate && durationSec ? Math.round((rate * 1000 * durationSec) / 8) : 0;
}

/**
 * YouTube: re-resolve the requested format ids, then either stream the single
 * file straight through or mux video + audio on the fly.
 */
async function streamYouTube(
  request: NextRequest,
  videoId: string,
  videoFormatId: string,
  audioFormatId: string | null,
  filename: string
) {
  if (!VIDEO_ID.test(videoId)) return errorResponse('Bad video id.', 400);
  if (!FORMAT_ID.test(videoFormatId)) return errorResponse('Bad video format.', 400);
  if (audioFormatId && !FORMAT_ID.test(audioFormatId)) {
    return errorResponse('Bad audio format.', 400);
  }

  const info = await youtubeInfo(videoId);
  const formats = info.formats ?? [];
  const duration = Math.round(info.duration ?? 0);
  const expired = 'That quality is no longer available. Fetch the video details again.';

  const video = formats.find((f) => f.format_id === videoFormatId);
  if (!video?.url) return errorResponse(expired, 409);

  // One file: hand it to the CDN proxy so Range requests and resume still work.
  if (!audioFormatId) {
    return streamCdn(request, video.url, filename);
  }

  const audio = formats.find((f) => f.format_id === audioFormatId);
  if (!audio?.url) return errorResponse(expired, 409);

  const container = filename.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';
  const muxer = await muxToStdout(video.url, audio.url, container);

  request.signal.addEventListener('abort', () => muxer.kill());
  muxer.done.catch((error) => {
    console.error('[api/download] ffmpeg mux failed:', error);
    muxer.kill();
  });

  const estimate = byteSize(video, duration) + byteSize(audio, duration);
  const headers = new Headers({
    'Content-Type': MIME_BY_EXT[extOf(filename)] ?? 'video/mp4',
    'Content-Disposition': disposition(filename),
    'Cache-Control': 'no-store',
  });
  // The muxed length isn't known up front, so the UI gets an estimate instead.
  if (estimate) {
    headers.set('X-Media-Bytes', String(estimate));
    headers.set('X-Media-Size', formatBytes(estimate) ?? 'unknown');
  }

  return new NextResponse(Readable.toWeb(muxer.stdout as Readable) as ReadableStream<Uint8Array>, {
    status: 200,
    headers,
  });
}

/** Instagram / Pinterest: stream the CDN asset through with a valid Referer. */
async function streamCdn(request: NextRequest, target: string, filename: string, referer?: string) {
  const check = checkProxyTarget(target);
  if (!check.ok || !check.url) {
    return errorResponse(check.reason ?? 'Media URL rejected.', 400);
  }

  const range = request.headers.get('range');
  const upstream = await fetch(check.url.toString(), {
    redirect: 'follow',
    cache: 'no-store',
    signal: request.signal,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: '*/*',
      Referer: referer ?? refererFor(check.url.hostname) ?? '',
      ...(range ? { Range: range } : {}),
    },
  });

  if (!upstream.ok && upstream.status !== 206) {
    return errorResponse(
      `The media host refused the download (HTTP ${upstream.status}). The link may have expired — fetch the info again.`,
      502
    );
  }

  const headers = new Headers({
    'Content-Type':
      MIME_BY_EXT[extOf(filename)] ??
      upstream.headers.get('content-type') ??
      'application/octet-stream',
    'Content-Disposition': disposition(filename),
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  });

  for (const header of ['content-length', 'content-range']) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function GET(request: NextRequest) {
  const limit = rateLimit(`download:${clientKey(request)}`, 40, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many downloads. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const params = request.nextUrl.searchParams;
  const rawName = params.get('filename') || 'download';
  const filename = sanitizeFilename(
    rawName.replace(/\.[a-z0-9]{1,5}$/i, ''),
    extOf(rawName) || 'bin'
  );

  try {
    if (params.get('src') === 'yt') {
      const videoId = params.get('id') ?? '';
      const video = params.get('v') ?? '';
      if (!videoId || !video) {
        return errorResponse('Missing YouTube id or format.', 400);
      }
      return await streamYouTube(request, videoId, video, params.get('a'), filename);
    }

    const target = params.get('url');
    if (!target) return errorResponse('Nothing to download: no url supplied.', 400);
    return await streamCdn(request, target, filename, params.get('ref') ?? undefined);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return new NextResponse(null, { status: 499 });
    }
    if (error instanceof ExtractError) {
      return errorResponse(error.message, error.status);
    }
    console.error('[api/download] failed:', error);
    return errorResponse('The download could not be completed. Please try again.', 500);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range',
    },
  });
}
