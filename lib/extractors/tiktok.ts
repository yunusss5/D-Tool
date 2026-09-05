/**
 * TikTok extraction.
 *
 * Three sources, tried in order of how clean their output is:
 *
 *  1. The mobile app's `/aweme/v1/feed/` endpoint. When it answers it is the best
 *     of the three — watermark-free URLs, an exact byte length per rendition, no
 *     cookies involved — but TikTok gates it by IP reputation and region.
 *  2. The web page's own hydration blob, which every browser receives. Same
 *     renditions, except the CDN then expects a tiktok.com referer (the download
 *     proxy sends one).
 *  3. yt-dlp, if the host happens to have it.
 *
 * Note for anyone testing this from a network where TikTok is blocked — India,
 * for instance — the first two layers cannot succeed: the ISP answers every
 * tiktok.com request with a placeholder page and truncates the API hosts to an
 * empty body. That is not a bug in this file, and the error message says so.
 */
import {
  ExtractError,
  formatBytes,
  proxyDownloadUrl,
  sanitizeFilename,
  secondsToClock,
  type FormatOption,
  type MediaInfo,
} from '@/lib/media';
import { attachSizes, resolveRedirect, tryFetchText } from '@/lib/http';
import { dumpInfo, resolveYtDlp, type YtDlpInfo } from '@/lib/ytdlp';

const TIKTOK_REFERER = 'https://www.tiktok.com/';

const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const APP_UA =
  'com.zhiliaoapp.musically/2023009040 (Linux; U; Android 13; en_US; Pixel 7; Build/TQ3A.230805.001; Cronet/58.0.2991.0)';

/** Hosts that front the same app API; the healthy one varies by region. */
const APP_HOSTS = [
  'api22-normal-c-useast2a.tiktokv.com',
  'api16-normal-c-useast1a.tiktokv.com',
  'api.tiktokv.com',
];

/** One normalised record, whichever source produced it. */
interface TikTokMedia {
  id: string;
  desc?: string;
  author?: string;
  durationSec?: number;
  cover?: string;
  music?: string;
  videos: Array<{ url: string; width?: number; height?: number; bytes?: number; gear?: string }>;
  images: string[];
}

export function tiktokId(url: string): string | undefined {
  return (
    url.match(/\/(?:video|photo)\/(\d{6,})/)?.[1] ??
    url.match(/\/v\/(\d{6,})/)?.[1] ??
    url.match(/[?&]item_id=(\d{6,})/)?.[1] ??
    url.match(/^(\d{6,})$/)?.[1]
  );
}

const SHORT_LINK = /(?:vm|vt)\.tiktok\.com\/|tiktok\.com\/t\//;

/** Deduplicate renditions and put the largest first. */
function rankVideos(videos: TikTokMedia['videos']): TikTokMedia['videos'] {
  const seen = new Set<string>();
  return videos
    .filter((video) => {
      if (!video.url || seen.has(video.url)) return false;
      seen.add(video.url);
      return true;
    })
    .sort((a, b) => {
      const pixels = (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0);
      return pixels || (b.bytes ?? 0) - (a.bytes ?? 0);
    });
}

/* ------------------------------- app API ------------------------------- */

interface AppAddr {
  url_list?: string[];
  data_size?: number;
  width?: number;
  height?: number;
}

interface AppAweme {
  aweme_id?: string;
  desc?: string;
  author?: { unique_id?: string; nickname?: string };
  music?: { play_url?: AppAddr };
  video?: {
    duration?: number;
    play_addr?: AppAddr;
    download_addr?: AppAddr;
    cover?: AppAddr;
    origin_cover?: AppAddr;
    bit_rate?: Array<{ gear_name?: string; bit_rate?: number; play_addr?: AppAddr }>;
  };
  image_post_info?: { images?: Array<{ display_image?: AppAddr; owner_watermark_image?: AppAddr }> };
}

const first = (addr: AppAddr | undefined): string | undefined =>
  addr?.url_list?.find((url) => typeof url === 'string' && url.startsWith('http'));

function fromApp(aweme: AppAweme, id: string): TikTokMedia | undefined {
  const video = aweme.video;
  const videos: TikTokMedia['videos'] = [];

  // `play_addr` is the clean copy; `download_addr` is the one with the watermark
  // burned in, so it is only worth offering when nothing else came back.
  const play = first(video?.play_addr);
  if (play) {
    videos.push({
      url: play,
      width: video?.play_addr?.width,
      height: video?.play_addr?.height,
      bytes: video?.play_addr?.data_size,
    });
  }

  for (const rendition of video?.bit_rate ?? []) {
    const url = first(rendition.play_addr);
    if (!url) continue;
    videos.push({
      url,
      width: rendition.play_addr?.width,
      height: rendition.play_addr?.height,
      bytes: rendition.play_addr?.data_size,
      gear: rendition.gear_name,
    });
  }

  if (!videos.length) {
    const fallback = first(video?.download_addr);
    if (fallback) videos.push({ url: fallback, bytes: video?.download_addr?.data_size });
  }

  const images = (aweme.image_post_info?.images ?? [])
    .map((image) => first(image.display_image) ?? first(image.owner_watermark_image))
    .filter((url): url is string => Boolean(url));

  if (!videos.length && !images.length) return undefined;

  return {
    id: aweme.aweme_id || id,
    desc: aweme.desc,
    author: aweme.author?.unique_id ?? aweme.author?.nickname,
    durationSec: video?.duration ? Math.round(video.duration / 1000) : undefined,
    cover: first(video?.origin_cover) ?? first(video?.cover),
    music: first(aweme.music?.play_url),
    videos: rankVideos(videos),
    images,
  };
}

function appQuery(id: string): string {
  return new URLSearchParams({
    aweme_id: id,
    version_code: '300904',
    version_name: '30.9.4',
    app_name: 'musical_ly',
    channel: 'googleplay',
    device_platform: 'android',
    device_type: 'Pixel 7',
    os_version: '13',
    iid: '7318518857994389254',
    device_id: '7318518857994389254',
    aid: '1233',
    region: 'US',
    carrier_region: 'US',
    sys_region: 'US',
    app_language: 'en',
    language: 'en',
  }).toString();
}

/**
 * Ask every regional host at once and take the first real answer. A host that is
 * throttling this IP replies with an empty body, so "answered" has to mean
 * "returned an aweme", not "returned 200".
 */
async function viaAppApi(id: string): Promise<TikTokMedia | undefined> {
  const query = appQuery(id);
  const attempts = APP_HOSTS.flatMap((host) => [
    `https://${host}/aweme/v1/feed/?${query}`,
    `https://${host}/aweme/v1/aweme/detail/?${query}`,
  ]);

  const responses = await Promise.all(
    attempts.map((url) =>
      tryFetchText(url, {
        timeoutMs: 8_000,
        headers: { 'User-Agent': APP_UA, Accept: 'application/json' },
      })
    )
  );

  for (const text of responses) {
    if (!text || !text.trimStart().startsWith('{')) continue;
    try {
      const json = JSON.parse(text) as { aweme_list?: AppAweme[]; aweme_detail?: AppAweme };
      const aweme = json.aweme_detail ?? json.aweme_list?.find((entry) => entry?.aweme_id === id) ?? json.aweme_list?.[0];
      if (!aweme) continue;
      const media = fromApp(aweme, id);
      if (media) return media;
    } catch {
      /* try the next host */
    }
  }
  return undefined;
}

/* ------------------------------ web page ------------------------------- */

interface WebAddr {
  DataSize?: number;
  Width?: number;
  Height?: number;
  UrlList?: string[];
}

interface WebItem {
  id?: string;
  desc?: string;
  author?: { uniqueId?: string; nickname?: string };
  music?: { playUrl?: string };
  video?: {
    duration?: number;
    playAddr?: string;
    downloadAddr?: string;
    cover?: string;
    originCover?: string;
    width?: number;
    height?: number;
    bitrateInfo?: Array<{ GearName?: string; Bitrate?: number; PlayAddr?: WebAddr }>;
  };
  imagePost?: { images?: Array<{ imageURL?: { urlList?: string[] } }> };
}

function fromWeb(item: WebItem, id: string): TikTokMedia | undefined {
  const video = item.video;
  const videos: TikTokMedia['videos'] = [];

  if (video?.playAddr) {
    videos.push({ url: video.playAddr, width: video.width, height: video.height });
  }
  for (const rendition of video?.bitrateInfo ?? []) {
    const url = rendition.PlayAddr?.UrlList?.find((entry) => entry?.startsWith('http'));
    if (!url) continue;
    videos.push({
      url,
      width: rendition.PlayAddr?.Width,
      height: rendition.PlayAddr?.Height,
      bytes: rendition.PlayAddr?.DataSize,
      gear: rendition.GearName,
    });
  }
  if (!videos.length && video?.downloadAddr) videos.push({ url: video.downloadAddr });

  const images = (item.imagePost?.images ?? [])
    .map((image) => image.imageURL?.urlList?.find((entry) => entry?.startsWith('http')))
    .filter((url): url is string => Boolean(url));

  if (!videos.length && !images.length) return undefined;

  return {
    id: item.id || id,
    desc: item.desc,
    author: item.author?.uniqueId ?? item.author?.nickname,
    // Unlike the app API, the web payload states duration in whole seconds.
    durationSec: video?.duration || undefined,
    cover: video?.originCover ?? video?.cover,
    music: item.music?.playUrl,
    videos: rankVideos(videos),
    images,
  };
}

/** Depth-first hunt for the item record inside an arbitrary hydration blob. */
function findItem(value: unknown, depth = 0): WebItem | undefined {
  if (!value || typeof value !== 'object' || depth > 12) return undefined;

  if (!Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const video = record.video as Record<string, unknown> | undefined;
    if (typeof record.id === 'string' && (video?.playAddr || video?.bitrateInfo || record.imagePost)) {
      return record as WebItem;
    }
  }

  for (const entry of Object.values(value as Record<string, unknown>)) {
    const found = findItem(entry, depth + 1);
    if (found) return found;
  }
  return undefined;
}

async function viaWebPage(pageUrl: string, id: string): Promise<TikTokMedia | undefined> {
  const html = await tryFetchText(pageUrl, {
    timeoutMs: 15_000,
    headers: {
      'User-Agent': WEB_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: TIKTOK_REFERER,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    },
  });
  if (!html) return undefined;

  const blobs = [
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
    /<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/,
  ]
    .map((pattern) => html.match(pattern)?.[1])
    .filter((raw): raw is string => Boolean(raw));

  for (const raw of blobs) {
    try {
      const found = findItem(JSON.parse(raw));
      if (found) {
        const media = fromWeb(found, id);
        if (media) return media;
      }
    } catch {
      /* try the next blob */
    }
  }
  return undefined;
}

/* -------------------------------- yt-dlp -------------------------------- */

function fromYtDlp(info: YtDlpInfo, id: string): TikTokMedia | undefined {
  const videos: TikTokMedia['videos'] = (info.formats ?? [])
    .filter((format) => format.url?.startsWith('http') && format.vcodec && format.vcodec !== 'none')
    .map((format) => ({
      url: format.url as string,
      width: format.width ?? undefined,
      height: format.height ?? undefined,
      bytes: format.filesize ?? format.filesize_approx ?? undefined,
      gear: format.format_note,
    }));

  if (!videos.length && info.url?.startsWith('http')) videos.push({ url: info.url });
  if (!videos.length) return undefined;

  return {
    id: info.id || id,
    desc: info.title ?? info.description,
    author: info.uploader ?? info.channel,
    durationSec: info.duration ? Math.round(info.duration) : undefined,
    cover: info.thumbnail,
    videos: rankVideos(videos),
    images: [],
  };
}

/* ------------------------------ assembly ------------------------------- */

function extensionOf(url: string, fallback: string): string {
  const ext = url.split('?')[0].match(/\.(mp4|webm|mov|jpe?g|png|webp|mp3|m4a)$/i)?.[1]?.toLowerCase();
  if (!ext) return fallback;
  return ext === 'jpeg' ? 'jpg' : ext;
}

function videoQuality(video: TikTokMedia['videos'][number]): string {
  if (video.height) return `${video.height}p`;
  const gear = video.gear?.match(/(\d{3,4})/)?.[1];
  return gear ? `${gear}p` : 'Video';
}

function toMediaInfo(media: TikTokMedia): MediaInfo {
  const title = media.desc?.split('\n')[0]?.trim().slice(0, 90) || `tiktok_${media.id}`;
  const formats: FormatOption[] = [];
  const seen = new Set<string>();

  media.videos.forEach((video, index) => {
    const label = videoQuality(video);
    if (seen.has(label)) return;
    seen.add(label);
    const ext = extensionOf(video.url, 'mp4');
    formats.push({
      id: `tt-v-${index}`,
      quality: `${label} · no watermark`,
      type: 'video',
      format: ext,
      fileSize: video.bytes ? formatBytes(video.bytes) : undefined,
      bytes: video.bytes,
      url: video.url,
      downloadUrl: proxyDownloadUrl(video.url, sanitizeFilename(title, ext), TIKTOK_REFERER),
    });
  });

  media.images.forEach((image, index) => {
    const ext = extensionOf(image, 'jpg');
    const suffix = media.images.length > 1 ? `_${index + 1}` : '';
    formats.push({
      id: `tt-i-${index}`,
      quality: media.images.length > 1 ? `Photo ${index + 1}` : `Photo ${ext.toUpperCase()}`,
      type: 'image',
      format: ext,
      url: image,
      downloadUrl: proxyDownloadUrl(image, sanitizeFilename(`${title}${suffix}`, ext), TIKTOK_REFERER),
    });
  });

  if (media.music) {
    const ext = extensionOf(media.music, 'mp3');
    formats.push({
      id: 'tt-audio',
      quality: 'Original sound',
      type: 'audio',
      format: ext,
      url: media.music,
      downloadUrl: proxyDownloadUrl(media.music, sanitizeFilename(title, ext), TIKTOK_REFERER),
    });
  }

  return {
    platform: 'tiktok',
    title,
    thumbnail: media.cover || '',
    duration: media.durationSec ? secondsToClock(media.durationSec) : undefined,
    author: media.author ? `@${media.author}` : undefined,
    formats,
  };
}

export async function extractTikTok(rawUrl: string): Promise<MediaInfo> {
  let url = rawUrl.trim();
  if (SHORT_LINK.test(url)) url = await resolveRedirect(url);

  const id = tiktokId(url);
  if (!id) {
    throw new ExtractError(
      'Paste a link to a single TikTok video or photo post (a tiktok.com/@user/video/… or vm.tiktok.com link).',
      400
    );
  }

  const pageUrl = url.includes('/video/') || url.includes('/photo/') ? url : `https://www.tiktok.com/@i/video/${id}`;

  let media = await viaAppApi(id);
  media ??= await viaWebPage(pageUrl, id);

  if (!media && (await resolveYtDlp())) {
    try {
      media = fromYtDlp(await dumpInfo(pageUrl), id);
    } catch {
      /* fall through to the shared message below */
    }
  }

  if (!media) {
    throw new ExtractError(
      'TikTok did not answer this server. Private and deleted posts cannot be downloaded, and TikTok blocks some networks and regions outright.',
      502
    );
  }

  const info = toMediaInfo(media);
  if (!info.formats.length) {
    throw new ExtractError('That TikTok post has no video or photo to download.', 422);
  }

  const needsSizes = info.formats.some((format) => !format.bytes);
  return needsSizes ? { ...info, formats: await attachSizes(info.formats, TIKTOK_REFERER) } : info;
}
