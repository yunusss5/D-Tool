/**
 * Shared media types + helpers used by every extractor and API route.
 */

export type Platform = 'youtube' | 'instagram' | 'pinterest' | 'unknown';
export type MediaKind = 'video' | 'audio' | 'image';

export interface FormatOption {
  /** Stable key used by the UI for selection. */
  id: string;
  /** Human label: "1080p60", "128kbps", "Original". */
  quality: string;
  type: MediaKind;
  /** Container extension without the dot: mp4 / m4a / webm / jpg. */
  format: string;
  fileSize?: string;
  /** Same size as a number, when known, so the UI can pick a download strategy. */
  bytes?: number;
  /** True for adaptive YouTube streams that carry no audio track. */
  noAudio?: boolean;
  /** Upstream CDN URL. Empty for YouTube (resolved at download time). */
  url: string;
  /** Same-origin URL that streams the file with Content-Disposition. */
  downloadUrl: string;
}

export interface MediaInfo {
  platform: Platform;
  title: string;
  thumbnail: string;
  duration?: string;
  author?: string;
  views?: string;
  formats: FormatOption[];
}

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** Thrown by extractors when the failure is the user's input, not a bug. */
export class ExtractError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = 'ExtractError';
    this.status = status;
  }
}

export function detectPlatform(input: string): Platform {
  if (!input) return 'unknown';
  const url = input.trim().toLowerCase();
  if (/youtube\.com|youtu\.be|youtube-nocookie\.com|y2u\.be/.test(url)) return 'youtube';
  if (/instagram\.com|instagr\.am|ddinstagram\.com/.test(url)) return 'instagram';
  if (/pinterest\.[a-z.]+|pin\.it/.test(url)) return 'pinterest';
  return 'unknown';
}

export function formatViews(views: number): string | undefined {
  if (!Number.isFinite(views) || views <= 0) return undefined;
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B`;
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return String(views);
}

export function formatBytes(bytes?: number | string | null): string | undefined {
  const n = typeof bytes === 'string' ? Number.parseInt(bytes, 10) : bytes;
  if (!n || !Number.isFinite(n) || n <= 0) return undefined;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function secondsToClock(totalSeconds: number): string | undefined {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return undefined;
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => v.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Windows-safe download filename. The unicode class keeps letters, digits,
 * spaces, dot, underscore and hyphen, which already excludes every character
 * NTFS rejects.
 */
export function sanitizeFilename(title: string, ext: string): string {
  const base = (title || 'download')
    .replace(/[^\p{L}\p{N}\s._-]/gu, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '')
    .slice(0, 110);
  const safeExt = (ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${base || 'download'}.${safeExt}`;
}

/** Build the same-origin proxy URL for a third-party CDN asset. */
export function proxyDownloadUrl(mediaUrl: string, filename: string, referer?: string): string {
  const params = new URLSearchParams({ url: mediaUrl, filename });
  if (referer) params.set('ref', referer);
  return `/api/download?${params.toString()}`;
}

/**
 * Build the same-origin URL that streams a YouTube download.
 *
 * Only format ids travel to the browser — the signed googlevideo URLs are
 * resolved again when the visitor clicks, so a stale tab still downloads.
 * Passing `audio` asks the server to mux the two streams together.
 */
export function youtubeDownloadUrl(
  videoId: string,
  filename: string,
  video: string,
  audio?: string
): string {
  const params = new URLSearchParams({ src: 'yt', id: videoId, v: video, filename });
  if (audio) params.set('a', audio);
  return `/api/download?${params.toString()}`;
}

/** Pull the first regex capture group out of a blob of HTML/JSON text. */
export function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/** Turn a JSON-escaped URL into a usable one. */
export function unescapeUrl(raw: string): string {
  return raw
    .replace(/\\u0026/gi, '&')
    .replace(/\\u003d/gi, '=')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}
