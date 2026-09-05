/**
 * Instagram extraction, logged out.
 *
 * Instagram's public GraphQL endpoint checks three things before it will answer
 * an anonymous caller: a real session cookie, the page's LSD token, and a
 * browser-shaped set of Sec-Fetch-* headers. Miss any one of them and it
 * returns the HTML app shell (or "SecFetch Policy violation") instead of JSON,
 * so this module performs the same handshake a browser does.
 */
import {
  BROWSER_UA,
  ExtractError,
  proxyDownloadUrl,
  sanitizeFilename,
  secondsToClock,
  type FormatOption,
  type MediaInfo,
} from '@/lib/media';
import { attachSizes, fetchWithTimeout } from '@/lib/http';

const APP_ID = '936619743392459';
const DOC_ID = '27130156389949648';
const FRIENDLY_NAME = 'PolarisLoggedOutDesktopWWWPostRootContentQuery';
const REFERER = 'https://www.instagram.com/';

/** Instagram's base64 alphabet, used to turn a shortcode into a media id. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

interface Candidate {
  url?: string;
  width?: number;
  height?: number;
}

interface MediaItem {
  /** 1 = image, 2 = video, 8 = carousel container. */
  media_type?: number;
  original_width?: number;
  original_height?: number;
  code?: string;
  display_uri?: string;
  image_versions2?: { candidates?: Candidate[] };
  video_versions?: Candidate[];
  video_duration?: number;
  has_audio?: boolean;
}

interface PolarisMedia extends MediaItem {
  user?: { username?: string; full_name?: string };
  caption?: { text?: string } | null;
  carousel_media?: MediaItem[];
}
export function instagramShortcode(url: string): string {
  const cleaned = url.split('?')[0].replace(/\/+$/, '');
  const match = cleaned.match(
    /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv|share)\/([A-Za-z0-9_-]+)/
  );
  if (!match?.[1]) {
    throw new ExtractError(
      'Paste a link to a public Instagram post, reel or IGTV video (a /p/, /reel/ or /tv/ link).',
      400
    );
  }
  return match[1];
}

/** Shortcode -> numeric media id (base64 over Instagram's alphabet). */
function shortcodeToMediaId(shortcode: string): string | undefined {
  let id = 0n;
  for (const char of shortcode) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) return undefined;
    id = id * 64n + BigInt(index);
  }
  return id > 0n ? id.toString() : undefined;
}

interface Session {
  cookie: string;
  csrf: string;
  lsd: string;
}

let sessionCache: { at: number; session: Promise<Session> } | undefined;
const SESSION_TTL = 10 * 60_000;

/** Load instagram.com once to collect cookies and the LSD token it embeds. */
async function newSession(): Promise<Session> {
  const response = await fetchWithTimeout(REFERER, {
    timeoutMs: 15_000,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  const setCookie: string[] =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''].filter(Boolean);

  const pairs = setCookie.map((line) => line.split(';')[0].trim()).filter(Boolean);
  const cookie = pairs.join('; ');
  const csrf = pairs.find((p) => p.startsWith('csrftoken='))?.slice('csrftoken='.length) ?? '';

  const html = await response.text();
  let lsd = '';
  const eqmc = html.match(/<script\b[^>]*\bid="__eqmc"[^>]*>([^<]+)<\/script>/)?.[1];
  if (eqmc) {
    try {
      lsd = String(JSON.parse(eqmc).l ?? '');
    } catch {
      /* fall through to the inline token */
    }
  }
  lsd ||= html.match(/\["LSD",\[\],\{"token":"([^"]+)"/)?.[1] ?? '';

  if (!cookie || !lsd) {
    throw new ExtractError(
      'Instagram would not start a session for this server. Wait a minute and try again.',
      503
    );
  }
  return { cookie, csrf, lsd };
}

function session(): Promise<Session> {
  const now = Date.now();
  if (!sessionCache || now - sessionCache.at > SESSION_TTL) {
    const created = newSession().catch((error) => {
      sessionCache = undefined;
      throw error;
    });
    sessionCache = { at: now, session: created };
  }
  return sessionCache.session;
}
/** The header block Instagram's own web app sends on XHRs. */
function apiHeaders(s: Session): Record<string, string> {
  return {
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Cookie: s.cookie,
    Origin: 'https://www.instagram.com',
    'X-IG-App-ID': APP_ID,
    'X-ASBD-ID': '359341',
    'X-IG-WWW-Claim': '0',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'sec-ch-ua': '"Chromium";v="126", "Not;A=Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  };
}

/** Fetch the post payload. Instagram wants the ruling call made first. */
async function fetchMedia(shortcode: string): Promise<PolarisMedia | undefined> {
  const mediaId = shortcodeToMediaId(shortcode);
  if (!mediaId) return undefined;

  const s = await session();
  const headers = apiHeaders(s);

  try {
    await fetchWithTimeout(
      `https://www.instagram.com/api/v1/web/get_ruling_for_content/?content_type=MEDIA&target_id=${mediaId}`,
      { timeoutMs: 15_000, headers: { ...headers, Referer: `${REFERER}p/${shortcode}/` } }
    );
  } catch {
    /* the ruling call is a warm-up; a failure here is not fatal */
  }

  const body = new URLSearchParams({
    lsd: s.lsd,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: FRIENDLY_NAME,
    server_timestamps: 'true',
    variables: JSON.stringify({ media_id: mediaId }),
    doc_id: DOC_ID,
  });

  const response = await fetchWithTimeout('https://www.instagram.com/api/graphql', {
    timeoutMs: 20_000,
    method: 'POST',
    body: body.toString(),
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-Friendly-Name': FRIENDLY_NAME,
      'X-FB-LSD': s.lsd,
      'X-CSRFToken': s.csrf,
      Referer: `${REFERER}p/${shortcode}/`,
    },
  });

  if (!response.ok) return undefined;

  // The endpoint answers with content-type text/javascript, so sniff the body
  // instead: anything that is not JSON means our session went stale.
  const text = await response.text();
  if (!text.trimStart().startsWith('{')) {
    sessionCache = undefined;
    return undefined;
  }

  let json: { data?: { xig_polaris_media?: { if_not_gated_logged_out?: PolarisMedia } } };
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  return json?.data?.xig_polaris_media?.if_not_gated_logged_out ?? undefined;
}
/**
 * Instagram sends candidates without dimensions, so the resize instruction in
 * the URL is what tells them apart: `..._s640x640_...` is a downscaled copy,
 * and the one with no `sNNNxNNN` at all is the full-size original.
 */
function candidateWidth(candidate: Candidate): number {
  if (candidate.width) return candidate.width;
  const resized = candidate.url?.match(/[_/]s(\d+)x\d+/)?.[1];
  return resized ? Number.parseInt(resized, 10) : Number.MAX_SAFE_INTEGER;
}

function bestImage(item: MediaItem): Candidate | undefined {
  const candidates = (item.image_versions2?.candidates ?? []).filter((c) => c.url);
  if (candidates.length) {
    return candidates.sort((a, b) => candidateWidth(b) - candidateWidth(a))[0];
  }
  return item.display_uri ? { url: item.display_uri } : undefined;
}

function bestVideo(item: MediaItem): Candidate | undefined {
  const versions = (item.video_versions ?? []).filter((v) => v.url);
  return versions.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
}

/** Instagram signs an `efg` blob into media URLs describing the encode. */
function efgPayload(url: string): string {
  try {
    const efg = new URL(url).searchParams.get('efg');
    return efg ? Buffer.from(efg, 'base64').toString('utf8') : '';
  } catch {
    return '';
  }
}

/**
 * Reels are stored at full resolution but served as a single progressive MP4 of
 * a lower encode class (the rest of the ladder is DASH-only). The class is in
 * the signed `efg` blob, so scale the original dimensions by it rather than
 * advertising a size the file does not have.
 */
function videoDimensions(item: MediaItem, url: string): string {
  const width = item.original_width;
  const height = item.original_height;
  const tag = efgPayload(url);
  const encoded = Number.parseInt(tag.match(/\.(\d{3,4})\./)?.[1] ?? '0', 10);

  if (!width || !height) return encoded ? `${encoded}p` : 'HD';
  const shortest = Math.min(width, height);
  if (!encoded || encoded >= shortest) return `${width}×${height}`;
  const scale = encoded / shortest;
  return `${Math.round(width * scale)}×${Math.round(height * scale)}`;
}

/** The payload has no duration field, but the encoder's blob carries one. */
function videoSeconds(item: MediaItem): number | undefined {
  if (item.video_duration) return item.video_duration;
  const url = bestVideo(item)?.url;
  if (!url) return undefined;
  const seconds = Number.parseInt(efgPayload(url).match(/"duration_s":(\d+)/)?.[1] ?? '0', 10);
  return seconds || undefined;
}

function itemFormats(item: MediaItem, title: string, index: number, total: number): FormatOption[] {
  const suffix = total > 1 ? `_${index + 1}` : '';
  const prefix = total > 1 ? `Item ${index + 1} · ` : '';
  const video = item.media_type === 2 ? bestVideo(item) : undefined;

  if (video?.url) {
    const dims = videoDimensions(item, video.url);
    return [
      {
        id: `ig-v-${index}`,
        quality: `${prefix}${dims} MP4`,
        type: 'video',
        format: 'mp4',
        url: video.url,
        downloadUrl: proxyDownloadUrl(video.url, sanitizeFilename(`${title}${suffix}`, 'mp4'), REFERER),
      },
    ];
  }

  const image = bestImage(item);
  if (!image?.url) return [];

  const width = image.width ?? item.original_width;
  const height = image.height ?? item.original_height;
  return [
    {
      id: `ig-i-${index}`,
      quality: width && height ? `${prefix}${width}×${height} JPG` : `${prefix}Original`,
      type: 'image',
      format: 'jpg',
      url: image.url,
      downloadUrl: proxyDownloadUrl(image.url, sanitizeFilename(`${title}${suffix}`, 'jpg'), REFERER),
    },
  ];
}

function titleFrom(media: PolarisMedia, shortcode: string): string {
  const caption = media.caption?.text?.trim();
  if (caption) {
    const firstLine = caption.split('\n').find((line) => line.trim().length > 0) ?? '';
    const cleaned = firstLine.trim().slice(0, 90);
    if (cleaned) return cleaned;
  }
  const username = media.user?.username;
  return username ? `instagram_${username}_${shortcode}` : `instagram_${shortcode}`;
}
export async function extractInstagram(rawUrl: string): Promise<MediaInfo> {
  let url = rawUrl.trim();

  // /share/ links are redirects to the canonical post URL.
  if (/instagram\.com\/share\//.test(url)) {
    try {
      const response = await fetchWithTimeout(url, {
        timeoutMs: 12_000,
        headers: { 'User-Agent': BROWSER_UA },
      });
      url = response.url || url;
    } catch {
      /* keep the original link */
    }
  }

  const shortcode = instagramShortcode(url);

  let media: PolarisMedia | undefined;
  for (let attempt = 0; attempt < 2 && !media; attempt += 1) {
    if (attempt) sessionCache = undefined; // retry once with a fresh handshake
    try {
      media = await fetchMedia(shortcode);
    } catch (error) {
      if (attempt) throw error;
    }
  }

  if (!media) {
    throw new ExtractError(
      'Instagram would not return this post. That normally means the account is private, the post was deleted, or Instagram is rate-limiting this server. Public posts and reels work best.'
    );
  }

  const title = titleFrom(media, shortcode);
  const items = media.carousel_media?.length ? media.carousel_media : [media];
  const formats = items.flatMap((item, index) => itemFormats(item, title, index, items.length));

  if (!formats.length) {
    throw new ExtractError('No downloadable media was found in that post.');
  }

  const username = media.user?.username;
  const thumbnail = bestImage(items[0])?.url || media.display_uri || formats[0].url;
  const seconds = videoSeconds(items.find((item) => item.media_type === 2) ?? media);

  return {
    platform: 'instagram',
    title,
    thumbnail,
    duration: seconds ? secondsToClock(seconds) : undefined,
    author: username ? `@${username}` : undefined,
    formats: await attachSizes(formats, REFERER),
  };
}
