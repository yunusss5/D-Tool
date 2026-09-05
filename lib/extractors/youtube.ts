/**
 * YouTube extraction.
 *
 * Everything worth downloading on YouTube is now an adaptive stream: video and
 * audio arrive as separate files. We list the useful pairings here and let
 * /api/download re-resolve them at click time (googlevideo URLs are signed and
 * expire, so we never hand them to the browser).
 *
 * Three engines sit behind this. InnerTube (plain `fetch`, no binaries) is tried
 * first: it works on serverless hosts, answers in a fraction of a second, and
 * reports an exact byte length per format. yt-dlp is the fallback for the cases
 * a private API cannot cover, and it only exists on machines where someone
 * installed it. Both label formats by itag, so a lookup served by one engine and
 * a download served by the other still agree on what "137" means. The third is
 * the third-party resolver in `youtube-api.ts`, reached only when the first two
 * fail in a way that says YouTube refused this *address* — its format ids carry
 * an `api-` prefix precisely so they can never be confused with an itag.
 */
import {
  ExtractError,
  formatBytes,
  formatViews,
  sanitizeFilename,
  secondsToClock,
  youtubeDownloadUrl,
  type FormatOption,
  type MediaInfo,
} from '@/lib/media';
import { dumpInfo, resolveFfmpeg, resolveYtDlp, type YtDlpFormat, type YtDlpInfo } from '@/lib/ytdlp';
import { innertubeInfo } from '@/lib/youtube-innertube';
import { apiYouTubeInfo } from '@/lib/youtube-api';

/** Heights we offer, best first. Anything YouTube has outside this list is ignored. */
const TARGET_HEIGHTS = [2160, 1440, 1080, 720, 480, 360, 240, 144];

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(url: string): string {
  const trimmed = url.trim();
  if (ID_PATTERN.test(trimmed)) return trimmed;

  const patterns = [
    /(?:youtube\.com|youtube-nocookie\.com)\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  throw new ExtractError('That does not look like a YouTube video link.', 400);
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

interface CacheEntry {
  at: number;
  info: Promise<YtDlpInfo>;
}

/**
 * A lookup costs a round trip, and a visitor triggers two: one to list formats,
 * one when they click. Signed URLs stay valid for hours, so a short cache is
 * safe and makes the second hit instant.
 */
const infoCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60_000;

/**
 * The last answer that resolved for a video, kept well past `CACHE_TTL` purely as
 * a safety net.
 *
 * YouTube challenges a datacenter address in bursts rather than steadily, so on a
 * host it distrusts the request *after* a success is often the one that gets
 * refused — which would otherwise break the click on a listing that had just
 * loaded. googlevideo signatures outlive this window by hours, so replaying the
 * last good answer is strictly better than failing a download that would have
 * worked. Fresh resolution is still attempted every single time; this is only
 * consulted when that attempt fails.
 */
const lastGood = new Map<string, { at: number; info: YtDlpInfo }>();
const STALE_TTL = 90 * 60_000;
/** Ceiling on the safety net, so a busy server cannot grow it without bound. */
const STALE_MAX = 256;

/**
 * InnerTube first, yt-dlp second. A refusal that no engine can work around
 * (private, removed, age-gated) is reported straight away rather than spending
 * seconds on a fallback that will land on the same wall.
 */
async function resolveInfo(videoId: string): Promise<YtDlpInfo> {
  const attempt = await innertubeInfo(videoId);
  if (attempt.info) return attempt.info;
  if (attempt.fatal && attempt.error) throw attempt.error;

  if (await resolveYtDlp()) {
    try {
      return await dumpInfo(watchUrl(videoId));
    } catch (error) {
      // Prefer InnerTube's diagnosis; yt-dlp's own failure is the better
      // message only when InnerTube had nothing specific to say.
      throw attempt.error ?? error;
    }
  }

  throw (
    attempt.error ??
    new ExtractError('YouTube did not return anything downloadable for that link. Please try again.', 502)
  );
}

/** Resolve for real, and remember the answer as the fallback for this video. */
async function resolveAndRemember(videoId: string): Promise<YtDlpInfo> {
  const info = await resolveInfo(videoId);
  if (lastGood.size >= STALE_MAX) {
    const oldest = [...lastGood.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) lastGood.delete(oldest[0]);
  }
  lastGood.set(videoId, { at: Date.now(), info });
  return info;
}

export function youtubeInfo(videoId: string, options?: { refresh?: boolean }): Promise<YtDlpInfo> {
  const now = Date.now();
  for (const [key, entry] of infoCache) {
    if (now - entry.at > CACHE_TTL) infoCache.delete(key);
  }
  for (const [key, entry] of lastGood) {
    if (now - entry.at > STALE_TTL) lastGood.delete(key);
  }

  // `refresh` exists for one caller: the download proxy, when googlevideo starts
  // refusing a URL mid-transfer. A new signature is the only repair for that, so
  // the cached copy has to be thrown away rather than handed back.
  if (options?.refresh) infoCache.delete(videoId);

  const cached = infoCache.get(videoId);
  if (cached) return cached.info;

  const info = resolveAndRemember(videoId).catch((error) => {
    infoCache.delete(videoId);
    // A refusal now does not invalidate the URLs we already hold, so fall back to
    // them. Never for a refresh, though: that caller is asking precisely because
    // the answer it has stopped working, and handing the same one back would
    // defeat the repair it is attempting.
    const good = options?.refresh ? undefined : lastGood.get(videoId);
    if (good && Date.now() - good.at <= STALE_TTL) return good.info;
    throw error;
  });
  infoCache.set(videoId, { at: now, info });
  return info;
}

const isVideoOnly = (f: YtDlpFormat) => f.vcodec !== 'none' && !!f.vcodec && f.acodec === 'none';
const isAudioOnly = (f: YtDlpFormat) => f.acodec !== 'none' && !!f.acodec && f.vcodec === 'none';
const isProgressive = (f: YtDlpFormat) =>
  !!f.vcodec && f.vcodec !== 'none' && !!f.acodec && f.acodec !== 'none';

/** Plain HTTPS only — HLS/DASH manifest entries can't be streamed as a file. */
const isDirect = (f: YtDlpFormat) =>
  !!f.url && (!f.protocol || f.protocol === 'https' || f.protocol === 'http');

function byteSize(f: YtDlpFormat, durationSec: number): number | undefined {
  if (f.filesize && f.filesize > 0) return f.filesize;
  if (f.filesize_approx && f.filesize_approx > 0) return f.filesize_approx;
  const rate = f.tbr ?? f.vbr ?? f.abr;
  if (rate && durationSec) return Math.round((rate * 1000 * durationSec) / 8);
  return undefined;
}

/** Prefer H.264 — it plays everywhere. AV1/VP9 only when nothing else exists. */
function codecRank(vcodec = ''): number {
  if (vcodec.startsWith('avc1') || vcodec.startsWith('h264')) return 3;
  if (vcodec.startsWith('av01')) return 2;
  if (vcodec.startsWith('vp9') || vcodec.startsWith('vp09')) return 1;
  return 0;
}

function bestVideoAt(formats: YtDlpFormat[], height: number): YtDlpFormat | undefined {
  return formats
    .filter((f) => f.height === height)
    .sort((a, b) => {
      const container = Number(b.ext === 'mp4') - Number(a.ext === 'mp4');
      if (container) return container;
      const codec = codecRank(b.vcodec ?? '') - codecRank(a.vcodec ?? '');
      if (codec) return codec;
      return (b.tbr ?? 0) - (a.tbr ?? 0);
    })[0];
}

function bestAudio(formats: YtDlpFormat[], ext: 'm4a' | 'webm'): YtDlpFormat | undefined {
  const wanted = formats.filter((f) => (ext === 'm4a' ? f.ext === 'm4a' : f.ext === 'webm'));
  const pool = wanted.length ? wanted : formats;
  return pool.sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0];
}

function qualityLabel(f: YtDlpFormat): string {
  const height = f.height ?? 0;
  const fps = f.fps && f.fps >= 50 ? Math.round(f.fps) : 0;
  const base = `${height}p${fps ? fps : ''}`;
  if (height >= 2160) return `${base} (4K)`;
  if (height >= 1440) return `${base} (2K)`;
  return base;
}

async function buildFormats(info: YtDlpInfo, videoId: string, title: string): Promise<FormatOption[]> {
  const all = (info.formats ?? []).filter(isDirect);
  const duration = Math.round(info.duration ?? 0);

  const videoOnly = all.filter(isVideoOnly);
  const audioOnly = all.filter(isAudioOnly);
  const progressive = all.filter(isProgressive);

  const canMerge = Boolean(await resolveFfmpeg());
  const m4a = bestAudio(audioOnly, 'm4a');
  const webmAudio = bestAudio(audioOnly, 'webm');

  const options: FormatOption[] = [];
  const seen = new Set<string>();

  for (const height of TARGET_HEIGHTS) {
    const video = bestVideoAt(videoOnly, height);
    const progressiveMatch = progressive.find((f) => f.height === height);

    // A progressive stream already carries audio, so it needs no muxing at all.
    if (progressiveMatch && (!video || !canMerge)) {
      const label = qualityLabel(progressiveMatch);
      if (seen.has(label)) continue;
      seen.add(label);
      const ext = progressiveMatch.ext === 'webm' ? 'webm' : 'mp4';
      const size = byteSize(progressiveMatch, duration);
      options.push({
        id: `yt-${progressiveMatch.format_id}`,
        quality: label,
        type: 'video',
        format: ext,
        fileSize: formatBytes(size),
        bytes: size,
        url: '',
        downloadUrl: youtubeDownloadUrl(
          videoId,
          sanitizeFilename(title, ext),
          progressiveMatch.format_id
        ),
      });
      continue;
    }

    if (!video) continue;

    const label = qualityLabel(video);
    if (seen.has(label)) continue;

    const useWebm = video.ext === 'webm';
    const audio = useWebm ? webmAudio ?? m4a : m4a ?? webmAudio;
    const ext = useWebm && audio?.ext === 'webm' ? 'webm' : 'mp4';

    if (canMerge && audio) {
      seen.add(label);
      const size = (byteSize(video, duration) ?? 0) + (byteSize(audio, duration) ?? 0);
      options.push({
        id: `yt-${video.format_id}-${audio.format_id}`,
        quality: label,
        type: 'video',
        format: ext,
        fileSize: size ? formatBytes(size) : undefined,
        bytes: size || undefined,
        url: '',
        downloadUrl: youtubeDownloadUrl(
          videoId,
          sanitizeFilename(title, ext),
          video.format_id,
          audio.format_id
        ),
      });
      continue;
    }

    // No ffmpeg: the honest option is a silent video file, clearly labelled.
    seen.add(label);
    options.push({
      id: `yt-${video.format_id}`,
      quality: label,
      type: 'video',
      format: video.ext === 'webm' ? 'webm' : 'mp4',
      noAudio: true,
      fileSize: formatBytes(byteSize(video, duration) ?? 0) || undefined,
      bytes: byteSize(video, duration),
      url: '',
      downloadUrl: youtubeDownloadUrl(
        videoId,
        sanitizeFilename(`${title} (video only)`, video.ext === 'webm' ? 'webm' : 'mp4'),
        video.format_id
      ),
    });
  }

  // Audio-only downloads, best of each container.
  for (const audio of [m4a, webmAudio]) {
    if (!audio) continue;
    const ext = audio.ext === 'webm' ? 'webm' : 'm4a';
    const kbps = Math.round(audio.abr ?? audio.tbr ?? 0);
    const label = kbps ? `${kbps}kbps` : 'Audio';
    if (seen.has(`a-${label}`)) continue;
    seen.add(`a-${label}`);
    options.push({
      id: `yt-audio-${audio.format_id}`,
      quality: label,
      type: 'audio',
      format: ext,
      fileSize: formatBytes(byteSize(audio, duration) ?? 0) || undefined,
      bytes: byteSize(audio, duration),
      url: '',
      downloadUrl: youtubeDownloadUrl(videoId, sanitizeFilename(title, ext), audio.format_id),
    });
  }

  return options;
}

export async function extractYouTube(url: string): Promise<MediaInfo> {
  const videoId = youtubeVideoId(url);

  let info: YtDlpInfo;
  try {
    info = await youtubeInfo(videoId);
  } catch (error) {
    // A challenge, a timeout or an empty answer means YouTube would not talk to
    // *this address* — which the resolver in youtube-api.ts does not share. A
    // verdict about the video itself (private, removed, members-only) travels
    // with the video, so there is nothing to gain by asking somebody else.
    const transport =
      error instanceof ExtractError && (error.status === 502 || error.status === 503 || error.status === 504);
    if (!transport) throw error;
    try {
      return await apiYouTubeInfo(videoId);
    } catch (fallback) {
      console.warn('[youtube] the resolver could not stand in either:', fallback);
      throw error;
    }
  }

  if (info.is_live || info.live_status === 'is_live') {
    throw new ExtractError(
      'That is a live stream. Wait until the broadcast ends, then download the recording.',
      400
    );
  }

  const title = info.title?.trim() || 'YouTube video';
  const formats = await buildFormats(info, videoId, title);

  if (!formats.length) {
    throw new ExtractError('No downloadable stream was offered for this video.', 502);
  }

  return {
    platform: 'youtube',
    title,
    thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: info.duration ? secondsToClock(Math.round(info.duration)) : undefined,
    author: info.channel || info.uploader || undefined,
    views: info.view_count ? formatViews(info.view_count) : undefined,
    formats,
  };
}
