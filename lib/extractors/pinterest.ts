/**
 * Pinterest extraction.
 *
 * Pinterest's own web app fetches a pin through PinResource. The field set it
 * asks for decides how much comes back: `unauth_react` omits video entirely,
 * while `unauth_react_main_pin` returns the full-resolution image plus every
 * video rendition, including the ones behind idea ("story") pins.
 */
import * as cheerio from 'cheerio';
import {
  ExtractError,
  proxyDownloadUrl,
  sanitizeFilename,
  secondsToClock,
  type FormatOption,
  type MediaInfo,
} from '@/lib/media';
import { attachSizes, resolveRedirect, tryFetchJson, tryFetchText } from '@/lib/http';

const PIN_REFERER = 'https://www.pinterest.com/';

interface PinImage {
  url?: string;
  width?: number;
  height?: number;
}

interface PinVideo extends PinImage {
  /** Milliseconds, not seconds. */
  duration?: number;
  thumbnail?: string;
}

type VideoList = Record<string, PinVideo | undefined>;

interface StoryBlock {
  video?: { video_list?: VideoList } | null;
  image?: { images?: Record<string, PinImage> } | null;
}

interface PinData {
  id?: string;
  title?: string;
  grid_title?: string;
  seo_title?: string;
  description?: string;
  closeup_unified_description?: string;
  images?: Record<string, PinImage>;
  videos?: { video_list?: VideoList } | null;
  story_pin_data?: { pages?: Array<{ blocks?: StoryBlock[] }> } | null;
  carousel_data?: { carousel_slots?: Array<{ images?: Record<string, PinImage> }> } | null;
  embed?: { src?: string; type?: string } | null;
  domain?: string;
  pinner?: { username?: string; full_name?: string } | null;
  closeup_attribution?: { full_name?: string; username?: string } | null;
}
export function pinterestPinId(url: string): string | undefined {
  return url.match(/\/pin\/(?:[^/]*--)?(\d{5,})/)?.[1] ?? url.match(/\/pin\/(\d{5,})/)?.[1];
}

/** i.pinimg.com serves sized derivatives; /originals/ is the full-resolution copy. */
function upgradeToOriginal(url: string): string {
  return url.replace(/\/(?:\d+x\d*)\//, '/originals/');
}

function extOf(url: string): string {
  const ext = url.split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i)?.[1]?.toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext ?? 'jpg';
}

/** Progressive MP4 renditions only — the HLS entries are playlists, not files. */
function playableVideos(list: VideoList | undefined): PinVideo[] {
  if (!list) return [];
  return Object.values(list).filter(
    (v): v is PinVideo => Boolean(v?.url) && !v!.url!.includes('.m3u8')
  );
}

/** Pinterest's own MP4 mirror beats the experimental transcode of the same size. */
function renditionRank(url: string): number {
  if (/\/videos\/mc\/720p\//.test(url)) return 2;
  if (/\/videos\/mc\/expMp4\//.test(url)) return 1;
  return 0;
}

function collectVideos(data: PinData): PinVideo[] {
  const found = playableVideos(data.videos?.video_list);

  for (const page of data.story_pin_data?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      found.push(...playableVideos(block.video?.video_list));
    }
  }

  found.sort((a, b) => {
    const size = (b.height ?? 0) - (a.height ?? 0);
    return size || renditionRank(b.url as string) - renditionRank(a.url as string);
  });

  // One entry per resolution: several keys often point at the same encode.
  const seen = new Set<string>();
  return found.filter((video) => {
    const key = video.width && video.height ? `${video.width}x${video.height}` : (video.url as string);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Largest image in a Pinterest `images` map, preferring the real original. */
function bestImage(images: Record<string, PinImage> | undefined): PinImage | undefined {
  if (!images) return undefined;
  const orig = images.orig ?? images.originals;
  if (orig?.url) return orig;

  const sized = Object.entries(images)
    .filter(([, image]) => image?.url)
    .map(([key, image]) => ({
      ...image,
      width: image.width ?? (Number.parseInt(key, 10) || 0),
    }))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sized[0];
}

function collectImages(data: PinData): PinImage[] {
  const found: PinImage[] = [];
  const main = bestImage(data.images);
  if (main?.url) found.push(main);

  for (const slot of data.carousel_data?.carousel_slots ?? []) {
    const image = bestImage(slot.images);
    if (image?.url) found.push(image);
  }

  for (const page of data.story_pin_data?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      const image = bestImage(block.image?.images);
      if (image?.url) found.push(image);
    }
  }

  const seen = new Set<string>();
  return found.filter((image) => {
    const url = image.url as string;
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}
function titleOf(data: PinData, pinId: string): string {
  const candidates = [
    data.title,
    data.grid_title,
    data.seo_title,
    data.closeup_unified_description,
    data.description,
  ];
  for (const candidate of candidates) {
    const text = candidate?.split('\n')[0]?.trim();
    if (text && text.length > 2) return text.slice(0, 90);
  }
  return `pinterest_${pinId}`;
}

function authorOf(data: PinData): string | undefined {
  const username = data.pinner?.username;
  if (username) return `@${username}`;
  return data.closeup_attribution?.full_name ?? data.pinner?.full_name ?? undefined;
}

function toMediaInfo(data: PinData, pinId: string): MediaInfo | undefined {
  const title = titleOf(data, pinId);
  const videos = collectVideos(data);
  const images = collectImages(data);
  const formats: FormatOption[] = [];

  videos.forEach((video, index) => {
    const label =
      video.width && video.height ? `${video.width}×${video.height} MP4` : 'Video MP4';
    const suffix = videos.length > 1 ? `_${index + 1}` : '';
    formats.push({
      id: `pin-v-${index}`,
      quality: label,
      type: 'video',
      format: 'mp4',
      url: video.url as string,
      downloadUrl: proxyDownloadUrl(
        video.url as string,
        sanitizeFilename(`${title}${suffix}`, 'mp4'),
        PIN_REFERER
      ),
    });
  });

  images.forEach((image, index) => {
    const url = upgradeToOriginal(image.url as string);
    const ext = extOf(url);
    const dims = image.width && image.height ? `${image.width}×${image.height}` : 'Original';
    const suffix = images.length > 1 ? `_${index + 1}` : '';
    formats.push({
      id: `pin-i-${index}`,
      quality: images.length > 1 ? `Image ${index + 1} · ${dims}` : `${dims} ${ext.toUpperCase()}`,
      type: 'image',
      format: ext,
      url,
      downloadUrl: proxyDownloadUrl(url, sanitizeFilename(`${title}${suffix}`, ext), PIN_REFERER),
    });
  });

  if (!formats.length) return undefined;

  const durationMs = videos[0]?.duration;
  return {
    platform: 'pinterest',
    title,
    thumbnail: images[0]?.url || videos[0]?.thumbnail || '',
    duration: durationMs ? secondsToClock(durationMs / 1000) : undefined,
    author: authorOf(data),
    formats,
  };
}
/** Primary path: the same PinResource call Pinterest's web app makes. */
async function viaPinResource(pinId: string): Promise<MediaInfo | undefined> {
  const data = JSON.stringify({
    options: { field_set_key: 'unauth_react_main_pin', id: pinId, noCache: true },
    context: {},
  });
  const endpoint =
    'https://www.pinterest.com/resource/PinResource/get/' +
    `?source_url=${encodeURIComponent(`/pin/${pinId}/`)}&data=${encodeURIComponent(data)}`;

  const json = await tryFetchJson<{ resource_response?: { data?: PinData | null } }>(endpoint, {
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: `https://www.pinterest.com/pin/${pinId}/`,
      'X-Requested-With': 'XMLHttpRequest',
      'X-Pinterest-PWS-Handler': 'www/[username].js',
    },
  });

  const payload = json?.resource_response?.data;
  if (!payload || typeof payload !== 'object') return undefined;
  return toMediaInfo(payload, pinId);
}

/** Fallback: the pin page's embedded JSON, then its Open Graph tags. */
async function viaPinPage(pinUrl: string, pinId: string): Promise<MediaInfo | undefined> {
  const html = await tryFetchText(pinUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml', Referer: PIN_REFERER },
  });
  if (!html) return undefined;

  const $ = cheerio.load(html);

  for (const id of ['__PWS_DATA__', 'initial-state', '__PWS_INITIAL_PROPS__']) {
    const raw = $(`script#${id}`).html();
    if (!raw) continue;
    try {
      const found = findPinData(JSON.parse(raw), pinId);
      if (found) {
        const info = toMediaInfo(found, pinId);
        if (info) return info;
      }
    } catch {
      /* try the next blob */
    }
  }

  const ogImage = $('meta[property="og:image"]').attr('content');
  const ogVideo =
    $('meta[property="og:video:url"]').attr('content') ?? $('meta[property="og:video"]').attr('content');
  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (!ogImage && !ogVideo) return undefined;

  return toMediaInfo(
    {
      title: ogTitle?.replace(/\s*\|\s*Pinterest\s*$/i, '').trim(),
      images: ogImage ? { orig: { url: ogImage } } : undefined,
      videos: ogVideo ? { video_list: { V_OG: { url: ogVideo } } } : undefined,
    },
    pinId
  );
}

/** Walk an arbitrary Pinterest JSON blob looking for the pin's own record. */
function findPinData(value: unknown, pinId: string, depth = 0): PinData | undefined {
  if (depth > 10 || !value || typeof value !== 'object') return undefined;

  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const hasMedia = 'images' in record || 'videos' in record || 'story_pin_data' in record;
    if (hasMedia && (record.id === pinId || typeof record.id === 'string')) {
      return record as PinData;
    }
  }

  for (const entry of Object.values(value as Record<string, unknown>)) {
    const found = findPinData(entry, pinId, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export async function extractPinterest(rawUrl: string): Promise<MediaInfo> {
  let url = rawUrl.trim();

  if (/pin\.it\//.test(url)) {
    url = await resolveRedirect(url);
  }

  const pinId = pinterestPinId(url);
  if (!pinId) {
    throw new ExtractError(
      'Paste a link to a single Pinterest pin (a pinterest.com/pin/... or pin.it link).',
      400
    );
  }

  const canonical = url.includes('/pin/') ? url : `https://www.pinterest.com/pin/${pinId}/`;
  const result = (await viaPinResource(pinId)) ?? (await viaPinPage(canonical, pinId));

  if (!result) {
    throw new ExtractError(
      'Pinterest did not return any media for that pin. Secret boards and deleted pins cannot be downloaded.'
    );
  }

  return { ...result, formats: await attachSizes(result.formats, PIN_REFERER) };
}
