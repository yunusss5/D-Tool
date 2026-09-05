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
 * the download. What the free tier will not do is high resolutions, which is why
 * the menu below stops at 480p; see the comment on `FORMATS`.
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

const KEY = process.env.YT_API_KEY?.trim();

/**
 * Hosts to try, in order. The resolver publishes `p.savenow.to` as its shared API
 * host and answers the same paths on its own site. Measured 2026-09-05: only
 * `video-download-api.com` answers at all — `p.savenow.to` fails to connect from
 * a home connection and from Vercel alike — so the site host goes first and the
 * documented one is kept behind it as a door that may open again. `YT_API_HOST`
 * goes ahead of both when set: an account-specific host from the dashboard knows
 * about the key.
 *
 * Every host gets a submit *and* a poll before the next is tried, because a host
 * that cannot render the requested quality does not refuse — it accepts the job
 * and then sits on `Initialising`, which only polling reveals.
 */
const HOSTS = [process.env.YT_API_HOST?.trim(), 'video-download-api.com', 'p.savenow.to'].filter(
  (host): host is string => Boolean(host)
);

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
 * What we offer, best first — and deliberately short.
 *
 * The resolver accepts far more keys than this (144 through 8k), but accepting a
 * key is not the same as rendering it. Measured 2026-09-05 on single keyless jobs:
 * 360p finished in 31 s and later 117 s, 480p in 39 s, mp3 in 34 s, while **720p
 * returned `1000 Failed` on one run and sat on `Initialising` for 200 s on
 * another**. The tier also throttles under repeated use, so these are the keys
 * measured to complete unaided rather than proof that the rest never can.
 *
 * Since this engine only ever runs when YouTube itself has refused the host, a
 * short menu that delivers beats a long one that times out — and when the direct
 * path works, its own listing offers everything up to 4K.
 *
 * Every key here merges audio in and comes back as one playable file, so this path
 * needs no ffmpeg and never offers a silent video.
 */
const FORMATS: ApiFormat[] = [
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
  /** Which host answered, added by `submit` so polling goes back to the same one. */
  host?: string;
}

interface ProgressResponse {
  success?: number | boolean;
  progress?: number;
  download_url?: string;
  text?: string;
  message?: string;
}

/** What one host had to say, when it did not hand over a file. */
interface Attempt {
  /** The finished file, when this host produced one. */
  url?: string;
  /** Why it did not, in words worth logging. */
  detail?: string;
  /** The job is still running rather than refused: worth another click, not another host. */
  pending?: boolean;
}

/** First 90 characters of a non-JSON body, flattened onto one line. */
const snippet = (body: string) => body.slice(0, 90).replace(/\s+/g, ' ').trim();

/**
 * Submit a job to one host. The key goes first when there is one, but a refusal
 * from the paid tier — an exhausted balance, most likely — is retried anonymously
 * rather than reported, because the free tier serves the same files.
 */
async function submit(
  host: string,
  videoId: string,
  format: string
): Promise<{ job?: SubmitResponse; detail?: string }> {
  const keys = KEY ? [KEY, undefined] : [undefined];
  let refusal: string | undefined;

  for (const key of keys) {
    const url = new URL(`https://${host}/ajax/download.php`);
    url.searchParams.set('format', format);
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set('add_info', '1');
    if (key) url.searchParams.set('apikey', key);

    let payload: SubmitResponse;
    try {
      const response = await fetchWithTimeout(url.toString(), { timeoutMs: 15_000 });
      const body = await response.text();
      try {
        payload = JSON.parse(body) as SubmitResponse;
      } catch {
        // A bot wall or an outage answers with HTML. Say which, because "please
        // try again" is useless to whoever has to fix it. An unreachable host is
        // the other case worth naming, and it comes back as a thrown abort.
        return { detail: `HTTP ${response.status}, ${snippet(body)}` };
      }
    } catch (error) {
      return { detail: error instanceof Error ? error.message : String(error) };
    }

    if (payload.success && (payload.id || payload.url)) return { job: { ...payload, host } };
    refusal = payload.message ?? 'no reason given';
    if (key) console.warn('[youtube-api] the keyed tier refused:', refusal);
  }

  return { detail: refusal };
}

/**
 * Words that mean the job is over and there will be no file. Everything else the
 * status line says ("Initialising", "Downloading", "Converting") is progress.
 */
const DEAD = /fail|error|unavailab|not found|invalid|unsupport|copyright|private|too (long|large)/i;

/**
 * Poll one job to completion. `progress` counts to 1000, not to 100.
 *
 * The deadline is passed in rather than started here, because it belongs to the
 * whole resolve: two hosts polling their own generous windows would blow past the
 * route's 300-second budget, and the visitor is waiting on the first byte the
 * entire time.
 *
 * Returns rather than throws, because a host that cannot finish a job is a reason
 * to ask the next one — not yet a reason to fail the download.
 */
async function awaitJob(
  job: SubmitResponse,
  deadline: number,
  signal?: AbortSignal
): Promise<Attempt> {
  if (job.url) return { url: job.url };
  // Poll the host that accepted the job, not the first one on the list: the
  // resolver's own `progress_url` already points there, and the fallback has to
  // agree with it or a job accepted by the second host would be polled on the
  // first, which does not know it.
  const progressUrl =
    job.progress_url || `https://${job.host ?? HOSTS[0]}/api/progress?id=${job.id ?? ''}`;
  let text: string | undefined;

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new ExtractError('The download was cancelled.', 499);
    await new Promise((resume) => setTimeout(resume, 1_500));

    let payload: ProgressResponse | undefined;
    try {
      const response = await fetchWithTimeout(progressUrl, { timeoutMs: 15_000 });
      payload = (await response.json()) as ProgressResponse;
    } catch {
      continue;
    }

    text = payload.text ?? text;
    if (payload.download_url) return { url: payload.download_url };
    // A finished job and a hopeless one are both reported as `progress: 1000`, so
    // the number cannot tell them apart — only the absence of a URL and the word
    // in `text` can. The free tier reports `Failed` for 720p and above within
    // seconds of accepting the job, and waiting out the deadline for that is four
    // minutes spent learning nothing.
    if (DEAD.test(text ?? '')) return { detail: text };
    if (payload.success === 0 && payload.progress === 0) return { detail: text ?? 'job stopped' };
  }

  return { detail: text ?? 'still running at the deadline', pending: true };
}

/**
 * Turn a format id from a listing back into a finished file URL. Called at click
 * time, so the job runs while the visitor is already waiting on the download.
 *
 * Each host gets a submit *and* a poll before the next one is tried, because the
 * two failures look nothing alike and only the second is common: an unreachable
 * host is refused in a second, while a host that cannot render the requested
 * quality accepts the job and then either reports `Failed` or sits on
 * `Initialising` until the clock runs out. Both hosts share one budget so two
 * attempts still fit inside the route's 300 seconds.
 */
export async function apiResolve(
  videoId: string,
  formatId: string,
  signal?: AbortSignal
): Promise<{ url: string; ext: string }> {
  const key = formatId.startsWith(API_PREFIX) ? formatId.slice(API_PREFIX.length) : formatId;
  const format = byKey.get(key);
  if (!format) throw new ExtractError('That format is no longer offered for this video.', 400);

  // 150 seconds, not the route's whole 300. A healthy free tier finishes 360p or
  // 480p in 31–39 s and was once seen taking 117 s, so a longer wait buys almost
  // nothing — while a throttled tier sits on `Initialising` forever, and every
  // extra second of that is a visitor watching a spinner for an error.
  const deadline = Date.now() + 150_000;
  const notes: string[] = [];
  let pending = false;

  for (const [index, host] of HOSTS.entries()) {
    const { job, detail } = await submit(host, videoId, format.key);
    if (!job) {
      notes.push(`${host}: ${detail ?? 'did not accept the job'}`);
      continue;
    }
    // The last host may use what is left; earlier ones leave enough behind for the
    // next submit. Skewed towards the first host on purpose: a stalling host is the
    // common failure and the alternates are spare doors, not equals.
    const isLast = index === HOSTS.length - 1;
    const attempt = await awaitJob(job, isLast ? deadline : deadline - 25_000, signal);
    if (attempt.url) return { url: attempt.url, ext: format.ext };
    pending ||= Boolean(attempt.pending);
    notes.push(`${host}: ${attempt.detail ?? 'no reason given'}`);
  }

  console.warn('[youtube-api] no host prepared this file:', notes.join(' | ') || 'no host tried');
  if (pending) {
    // Deliberately not "click again and it will be quick": a second submit for the
    // same video and format was measured starting over from `Initialising`, so the
    // resolver keeps nothing. The free tier is rate-limited per address, so this is
    // most often "too many jobs from this server lately" rather than a bad video.
    throw new ExtractError(
      'The backup resolver is busy — its free tier is rate-limited and this job never started. Try again shortly, or pick a lower quality.',
      504
    );
  }
  throw new ExtractError(
    `The YouTube resolver could not prepare this file. Try a lower quality${
      notes.length ? ` (${notes.join('; ')})` : ''
    }.`,
    502
  );
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

/**
 * Can *this* host reach the resolver at all?
 *
 * Every candidate host is asked, with a nonsense job id on purpose: the progress
 * endpoint needs no key and starts no work, so the answer distinguishes the three
 * cases that matter — JSON back means reachable, HTML back means a bot wall in
 * front of it, and a thrown error means the network never got there. Reported by
 * `GET /api/youtube` alongside what InnerTube says, because when both are refused
 * it is the address they have in common.
 */
export async function apiDiagnostics(): Promise<Record<string, unknown>> {
  const hosts = await Promise.all(
    HOSTS.map(async (host) => {
      const started = Date.now();
      try {
        const response = await fetchWithTimeout(`https://${host}/api/progress?id=reachability`, {
          timeoutMs: 15_000,
        });
        const body = await response.text();
        let answered = 'text';
        try {
          JSON.parse(body);
          answered = 'json';
        } catch {
          if (/^\s*</.test(body)) answered = 'html';
        }
        return {
          host,
          status: response.status,
          answered,
          body: body.slice(0, 90).replace(/\s+/g, ' ').trim(),
          ms: Date.now() - started,
        };
      } catch (error) {
        return {
          host,
          error: error instanceof Error ? error.message : String(error),
          ms: Date.now() - started,
        };
      }
    })
  );
  return { keyed: Boolean(KEY), hosts };
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
