/**
 * YouTube through a third-party resolver, for hosts YouTube itself refuses.
 *
 * Everything in `youtube-innertube.ts` talks to YouTube directly, and on a
 * datacenter address that is measured to fail no matter what the code does — see
 * CLAUDE.md, "Deploying to a datacenter". The resolver behind this module runs on
 * addresses Google does trust and hands back a finished file, which is the one
 * thing a blocked deployment cannot produce for itself.
 *
 * It is a job API rather than a format list: submit a URL plus one of its format
 * keys, poll until the job finishes, then stream the file it prepared. Two
 * consequences shape the code below. Byte sizes cannot be known before the job
 * runs, so the options this module offers carry no size — better an honest blank
 * than a guess. And audio is merged upstream, so this path needs no ffmpeg and
 * never offers a silent video file.
 *
 * `YT_API_KEY` is optional. The resolver also answers without one, on a free tier
 * that is slower and rate-limited, so a key buys reliability rather than access —
 * and a key whose balance has run out falls back to that tier instead of failing
 * the download.
 *
 * This is the second upstream in this codebase that belongs to somebody else (the
 * first is tikwm.com, for TikTok). If YouTube downloads break on a deployment that
 * relies on it, check whether the resolver is still up before anything else.
 */
import {
  ExtractError,
  sanitizeFilename,
  youtubeDownloadUrl,
  type FormatOption,
  type MediaInfo,
} from './media';
import { fetchWithTimeout } from './http';

const HOST = process.env.YT_API_HOST?.trim() || 'p.savenow.to';
const KEY = process.env.YT_API_KEY?.trim();

/** Prefix that marks a format id as belonging to this engine, not to InnerTube. */
export const API_PREFIX = 'api-';

interface ApiFormat {
  /** The resolver's own format key. */
  key: string;
  label: string;
  ext: string;
  kind: 'video' | 'audio';
}

/**
 * What we offer, best first. The resolver accepts more keys than this (144, 240,
 * 8k); these are the ones worth a menu entry, since every one of them merges
 * audio in and comes back as a single playable file.
 */
const FORMATS: ApiFormat[] = [
  { key: 'mp44k', label: '2160p (4K)', ext: 'mp4', kind: 'video' },
  { key: '1440', label: '1440p (2K)', ext: 'mp4', kind: 'video' },
  { key: '1080', label: '1080p', ext: 'mp4', kind: 'video' },
  { key: '720', label: '720p', ext: 'mp4', kind: 'video' },
  { key: '480', label: '480p', ext: 'mp4', kind: 'video' },
  { key: '360', label: '360p', ext: 'mp4', kind: 'video' },
  { key: 'm4a', label: 'Audio', ext: 'm4a', kind: 'audio' },
  { key: 'mp3', label: 'MP3', ext: 'mp3', kind: 'audio' },
];

const byKey = new Map(FORMATS.map((format) => [format.key, format]));

interface SubmitResponse {
  success?: boolean;
  /** Yes, spelled like that — it is how the resolver reports a refusal. */
  successfull?: boolean;
  message?: string;
  id?: string;
  url?: string | null;
  progress_url?: string;
  title?: string;
  thumbnail_url?: string;
  info?: { title?: string; image?: string };
  additional_info?: {
    title?: string;
    duration?: number;
    views?: string;
    channel?: { name?: string };
  };
}

interface ProgressResponse {
  success?: number | boolean;
  progress?: number;
  download_url?: string;
  text?: string;
  message?: string;
}

/**
 * Submit a job. The key goes first when there is one, but a refusal from the paid
 * tier — an exhausted balance, most likely — is retried anonymously rather than
 * reported, because the free tier serves the same files.
 */
async function submit(videoId: string, format: string): Promise<SubmitResponse> {
  const attempts = KEY ? [KEY, undefined] : [undefined];
  let last: SubmitResponse | undefined;
  /** Kept so a resolver that answers something other than JSON can be diagnosed. */
  let transport: string | undefined;

  for (const key of attempts) {
    const url = new URL(`https://${HOST}/ajax/download.php`);
    url.searchParams.set('format', format);
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set('add_info', '1');
    if (key) url.searchParams.set('apikey', key);

    let payload: SubmitResponse | undefined;
    try {
      const response = await fetchWithTimeout(url.toString(), { timeoutMs: 30_000 });
      const body = await response.text();
      try {
        payload = JSON.parse(body) as SubmitResponse;
      } catch {
        // A bot wall or an outage answers with HTML. Say which, because "please
        // try again" is useless to whoever has to fix it.
        transport = `HTTP ${response.status}, ${body.slice(0, 120).replace(/\s+/g, ' ').trim()}`;
        continue;
      }
    } catch (error) {
      transport = error instanceof Error ? error.message : String(error);
      continue;
    }

    last = payload;
    if (payload.success && (payload.id || payload.url)) return payload;
    if (key) {
      console.warn('[youtube-api] the keyed tier refused:', payload.message ?? 'no reason given');
    }
  }

  if (transport) console.warn('[youtube-api] the resolver did not answer JSON:', transport);
  throw new ExtractError(
    last?.message
      ? `The YouTube resolver refused this video: ${last.message}`
      : `The YouTube resolver did not accept this video${transport ? ` (${transport})` : ''}.`,
    502
  );
}

/** Poll a job to completion. `progress` counts to 1000, not to 100. */
async function awaitJob(job: SubmitResponse, signal?: AbortSignal): Promise<string> {
  if (job.url) return job.url;
  const progressUrl = job.progress_url || `https://${HOST}/api/progress?id=${job.id ?? ''}`;
  const deadline = Date.now() + 150_000;
  let text: string | undefined;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new ExtractError('The download was cancelled.', 499);
    await new Promise((resume) => setTimeout(resume, 1_500));

    let payload: ProgressResponse | undefined;
    try {
      const response = await fetchWithTimeout(progressUrl, { timeoutMs: 20_000 });
      payload = (await response.json()) as ProgressResponse;
    } catch {
      continue;
    }

    text = payload.text ?? text;
    if (payload.download_url) return payload.download_url;
    // The resolver reports failure by flipping `success` off with no URL to show.
    if (payload.success === 0 && payload.progress === 0 && text) break;
  }

  throw new ExtractError(
    text && !/prepar|download|convert|process|start/i.test(text)
      ? `The YouTube resolver could not prepare this video: ${text}`
      : 'The YouTube resolver is taking too long on this video. Please try again.',
    504
  );
}

/**
 * Turn a format id from a listing back into a finished file URL. Called at click
 * time, so the job runs while the visitor is already waiting on the download.
 */
export async function apiResolve(
  videoId: string,
  formatId: string,
  signal?: AbortSignal
): Promise<{ url: string; ext: string }> {
  const key = formatId.startsWith(API_PREFIX) ? formatId.slice(API_PREFIX.length) : formatId;
  const format = byKey.get(key);
  if (!format) throw new ExtractError('That format is no longer offered for this video.', 400);
  const job = await submit(videoId, format.key);
  return { url: await awaitJob(job, signal), ext: format.ext };
}

interface OEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

/**
 * Title, channel and thumbnail without touching the API that blocks us. oEmbed is
 * public, unauthenticated and answers from a datacenter address, which is exactly
 * why it is worth the extra round trip: the resolver only reports metadata
 * alongside a job, and starting one just to print a title would be wasteful.
 * It carries no duration, so listings on this path show none.
 */
async function oembed(videoId: string): Promise<OEmbed | undefined> {
  try {
    const response = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`,
      { timeoutMs: 10_000 }
    );
    if (!response.ok) return undefined;
    return (await response.json()) as OEmbed;
  } catch {
    return undefined;
  }
}

/** A listing built entirely from the resolver's fixed menu. */
export async function apiYouTubeInfo(videoId: string): Promise<MediaInfo> {
  const meta = await oembed(videoId);
  const title = meta?.title?.trim() || 'YouTube video';

  const formats: FormatOption[] = FORMATS.map((format) => ({
    id: `${API_PREFIX}${format.key}`,
    quality: format.label,
    type: format.kind,
    format: format.ext,
    url: '',
    downloadUrl: youtubeDownloadUrl(
      videoId,
      sanitizeFilename(title, format.ext),
      `${API_PREFIX}${format.key}`
    ),
  }));

  return {
    platform: 'youtube',
    title,
    thumbnail: meta?.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    author: meta?.author_name || undefined,
    formats,
  };
}
