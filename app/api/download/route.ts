import { NextRequest, NextResponse } from 'next/server';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { BROWSER_UA, ExtractError, formatBytes, sanitizeFilename } from '@/lib/media';
import { checkProxyTarget, needsChunkedRange, refererFor } from '@/lib/allowed-hosts';
import { mediaFetch } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { youtubeInfo } from '@/lib/extractors/youtube';
import { API_PREFIX, apiResolve } from '@/lib/youtube-api';
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
  // The resolver lets the proxy mint a new signature if googlevideo sours on the
  // one we started with, which it sometimes does part-way through a large file.
  if (!audioFormatId) {
    return streamCdn(request, video.url, filename, undefined, async () => {
      const fresh = await youtubeInfo(videoId, { refresh: true });
      return (fresh.formats ?? []).find((f) => f.format_id === videoFormatId)?.url;
    });
  }

  const audio = formats.find((f) => f.format_id === audioFormatId);
  if (!audio?.url) return errorResponse(expired, 409);

  /** A fresh signature for one format, for when googlevideo sours on a URL. */
  const resolver =
    (formatId: string, initial: string): UrlResolver =>
    async (attempt) => {
      if (attempt === 0) return initial;
      const fresh = await youtubeInfo(videoId, { refresh: true });
      const url = (fresh.formats ?? []).find((f) => f.format_id === formatId)?.url;
      return url && checkProxyTarget(url).ok ? url : initial;
    };

  const container = filename.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4';

  // ffmpeg has to seek the audio track to interleave it, so that side is fetched
  // to /tmp up front. It is the small stream — a 130 kbps track is a few MB — and
  // it comes down in a second or two through the ranged reader.
  const audioFile = await readToTemp(
    resolver(audioFormatId, audio.url),
    mediaHeaders(audio.url),
    request.signal,
    audio.ext === 'webm' ? 'weba' : 'm4a'
  );
  const cleanup = () => unlink(audioFile).catch(() => {});

  let muxer;
  try {
    const videoStream = await openMedia(
      resolver(videoFormatId, video.url),
      mediaHeaders(video.url),
      request.signal
    );
    muxer = await muxToStdout(videoStream, audioFile, container);
  } catch (error) {
    await cleanup();
    throw error;
  }

  request.signal.addEventListener('abort', () => {
    muxer.kill();
    void cleanup();
  });
  muxer.done.then(cleanup, (error) => {
    console.error('[api/download] ffmpeg mux failed:', error);
    muxer.kill();
    void cleanup();
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

/**
 * Window sizing. googlevideo hands each connection a fast burst and then paces it
 * at about playback speed, so the file has to be pulled as a series of ranged
 * windows that each ride a fresh burst: 26 MB took 110 s as one read and 8.8 s in
 * 4 MiB windows. How large a window an edge will serve is not uniform — some
 * videos answer 8 MiB happily, others refuse anything over ~1 MiB — so the reader
 * starts optimistic and shrinks when it is refused.
 */
const MAX_WINDOW = 4 * 1024 * 1024;
const MIN_WINDOW = 256 * 1024;
/** Shrink twice, then try a new signature twice, then give up on the window. */
const WINDOW_ATTEMPTS = 5;

/**
 * Hands back a usable URL for the asset. `attempt` is 0 for the first try and
 * increases when the host refused the previous one, which is the signal to mint
 * a new signature rather than replay the stale one.
 */
type UrlResolver = (attempt: number) => Promise<string | undefined>;

interface ChunkedRead {
  body: ReadableStream<Uint8Array>;
  total: number;
  contentType: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read an asset as a chain of ranged requests, exposed as one continuous stream.
 *
 * Each window is only fetched when the consumer asks for more bytes, so memory
 * stays flat and an aborted download stops the upstream reads. A refused or
 * broken window is retried — smaller first, then against a newly signed URL —
 * and always resumes from the exact byte reached, so nothing is enqueued twice
 * and the output stays byte-exact.
 *
 * Returns null when the very first window was not served, in which case the
 * caller falls back to a plain read and reports whatever the host says.
 */
async function chunkedRead(
  resolve: UrlResolver,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<ChunkedRead | null> {
  let url: string | undefined;
  let window = MAX_WINDOW;
  let total = 0;

  /** Fetch the window starting at `from`, shrinking or re-signing on refusal. */
  const open = async (from: number): Promise<Response | null> => {
    for (let attempt = 0; attempt < WINDOW_ATTEMPTS; attempt += 1) {
      if (signal.aborted) return null;
      if (!url) {
        url = await resolve(attempt).catch(() => undefined);
        if (!url) return null;
      }

      const to = total ? Math.min(total - 1, from + window - 1) : from + window - 1;
      try {
        const response = await mediaFetch(url, {
          redirect: 'follow',
          cache: 'no-store',
          signal,
          headers: { ...headers, Range: `bytes=${from}-${to}` },
        });
        if (response.status === 206 && response.body) return response;
        await response.body?.cancel().catch(() => {});
      } catch (error) {
        if (signal.aborted) return null;
        if (error instanceof Error && error.name === 'AbortError') return null;
      }

      // A refusal is one of two things: a window wider than this video's edge
      // will serve, or a signature it no longer likes. Shrinking is free, so try
      // that first and only pay for a new signature once the window is minimal.
      if (window > MIN_WINDOW) window = Math.max(MIN_WINDOW, Math.floor(window / 4));
      else url = (await resolve(attempt).catch(() => undefined)) ?? url;
      await sleep(200 * (attempt + 1));
    }
    return null;
  };

  const first = await open(0);
  if (!first?.body) return null;

  total = Number(/\/(\d+)\s*$/.exec(first.headers.get('content-range') ?? '')?.[1] ?? 0);
  if (!total) {
    await first.body.cancel().catch(() => {});
    return null;
  }

  let reader = first.body.getReader();
  let offset = 0;

  /** Continue from `offset`; false means the host gave up on us. */
  const reopen = async (): Promise<boolean> => {
    const next = await open(offset);
    if (!next?.body) return false;
    reader = next.body.getReader();
    return true;
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch (error) {
          // The window died mid-flight. Everything enqueued so far is still
          // valid, so pick the same file up again at the byte we reached.
          if (signal.aborted || offset >= total || !(await reopen())) {
            controller.error(error);
            return;
          }
          continue;
        }
        if (!done && value) {
          offset += value.byteLength;
          controller.enqueue(value);
          return;
        }
        if (offset >= total) {
          controller.close();
          return;
        }
        if (!(await reopen())) {
          // A cancelled request lands here too, and blaming the host for that
          // would put a wrong explanation in the log for every abandoned tab.
          controller.error(
            signal.aborted
              ? Object.assign(new Error('The download was cancelled.'), { name: 'AbortError' })
              : new Error(
                  `The media host stopped serving the file after ${offset} of ${total} bytes.`
                )
          );
          return;
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return { body, total, contentType: first.headers.get('content-type') };
}

/**
 * Headers a CDN expects: a browser agent plus whatever Referer it insists on.
 *
 * When no Referer applies the header is left off entirely rather than sent empty.
 * That distinction matters: `video.twimg.com` serves the file with no Referer, with
 * `https://x.com/`, or with any other value, and answers 403 to `Referer:` with an
 * empty value.
 */
function mediaHeaders(url: string, referer?: string): Record<string, string> {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    /* no host to match a referer against */
  }
  const value = referer ?? refererFor(host);
  return { 'User-Agent': BROWSER_UA, Accept: '*/*', ...(value ? { Referer: value } : {}) };
}

/** One media asset as a Node stream, ranged-window read where the host needs it. */
async function openMedia(
  resolve: UrlResolver,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Readable> {
  const url = await resolve(0);
  if (!url) throw new ExtractError('That quality is no longer available. Fetch the video again.', 409);

  if (needsChunkedRange(new URL(url).hostname)) {
    const chunked = await chunkedRead(resolve, headers, signal);
    if (chunked) return Readable.fromWeb(chunked.body as WebStream<Uint8Array>);
  }

  const upstream = await mediaFetch(url, { redirect: 'follow', cache: 'no-store', signal, headers });
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => {});
    throw new ExtractError(
      `The media host refused the download (HTTP ${upstream.status}). The link may have expired — fetch the info again.`,
      502
    );
  }
  return Readable.fromWeb(upstream.body as WebStream<Uint8Array>);
}

/** Same, but landed in the temp directory so the consumer can seek it. */
async function readToTemp(
  resolve: UrlResolver,
  headers: Record<string, string>,
  signal: AbortSignal,
  ext: string
): Promise<string> {
  const file = join(tmpdir(), `dt-${randomUUID()}.${ext}`);
  try {
    await pipeline(await openMedia(resolve, headers, signal), createWriteStream(file));
  } catch (error) {
    await unlink(file).catch(() => {});
    throw error;
  }
  return file;
}

/** Instagram / Pinterest / YouTube: stream the CDN asset through with a valid Referer. */
async function streamCdn(
  request: NextRequest,
  target: string,
  filename: string,
  referer?: string,
  resolve?: UrlResolver
) {
  const check = checkProxyTarget(target);
  if (!check.ok || !check.url) {
    return errorResponse(check.reason ?? 'Media URL rejected.', 400);
  }

  const range = request.headers.get('range');
  const baseHeaders = mediaHeaders(check.url.toString(), referer);

  // Whole-file download from a host that refuses unranged reads: walk it in
  // ranged windows instead. A client-supplied Range is passed straight through,
  // since that request is already ranged and therefore already at full speed.
  if (!range && needsChunkedRange(check.url.hostname)) {
    const initial = check.url.toString();
    const chunked = await chunkedRead(
      async (attempt) => {
        if (attempt === 0 || !resolve) return initial;
        const fresh = await resolve(attempt);
        // A re-resolved URL is still client-influenced input, so it goes through
        // the same allowlist as the original.
        return fresh && checkProxyTarget(fresh).ok ? fresh : initial;
      },
      baseHeaders,
      request.signal
    );
    if (chunked) {
      return new NextResponse(chunked.body, {
        status: 200,
        headers: new Headers({
          'Content-Type':
            MIME_BY_EXT[extOf(filename)] ?? chunked.contentType ?? 'application/octet-stream',
          'Content-Disposition': disposition(filename),
          'Content-Length': String(chunked.total),
          'Cache-Control': 'no-store',
          'Accept-Ranges': 'bytes',
        }),
      });
    }
  }

  const upstream = await mediaFetch(check.url.toString(), {
    redirect: 'follow',
    cache: 'no-store',
    signal: request.signal,
    headers: {
      ...baseHeaders,
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

// ======================== VERCEL-FRIENDLY HANDLER ========================

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
    // ---------- YouTube ----------
    if (params.get('src') === 'yt') {
      const videoId = params.get('id') ?? '';
      const video = params.get('v') ?? '';

      if (!videoId || !video) {
        return errorResponse('Missing YouTube id or format.', 400);
      }

      // ---- VERCEL DETECTION ----
      const isVercel = process.env.VERCEL === '1';

      // If the format is from the API resolver (api-*), resolve and redirect
      if (video.startsWith(API_PREFIX)) {
        const resolved = await apiResolve(videoId, video, request.signal);
        // Redirect directly to the CDN URL to avoid proxying through Vercel
        return new NextResponse(null, {
          status: 302,
          headers: {
            Location: resolved.url,
            // Optionally set Content-Disposition (browsers may ignore on redirect)
            // but we keep it for informational purposes
            'Content-Disposition': disposition(filename),
          },
        });
      }

      // On Vercel, we do NOT support formats that require ffmpeg/merging
      if (isVercel) {
        return errorResponse(
          'This format is not available on Vercel. Please choose one of the listed formats (e.g., 480p, 360p, Audio).',
          400
        );
      }

      // Local development: use the existing streaming/muxing logic
      return await streamYouTube(request, videoId, video, params.get('a'), filename);
    }

    // ---------- Other platforms (Instagram, Pinterest, etc.) ----------
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