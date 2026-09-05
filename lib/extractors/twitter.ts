/**
 * X (Twitter) extraction.
 *
 * X's own embed widget reads posts through `cdn.syndication.twimg.com`, a public
 * endpoint that needs no account, no bearer token and no cookies. It returns the
 * full media manifest — every MP4 rendition of a video, the original-resolution
 * copy of every photo — which is exactly what a downloader needs and nothing
 * more. The GraphQL API behind x.com, by contrast, requires a guest token that
 * is rate-limited per IP within minutes.
 */
import {
  ExtractError,
  proxyDownloadUrl,
  sanitizeFilename,
  secondsToClock,
  type FormatOption,
  type MediaInfo,
} from '@/lib/media';
import { attachSizes, fetchWithTimeout, resolveRedirect } from '@/lib/http';

const TWEET_RESULT = 'https://cdn.syndication.twimg.com/tweet-result';

interface Variant {
  content_type?: string;
  bitrate?: number;
  url?: string;
}

interface TweetMedia {
  type?: string;
  media_url_https?: string;
  original_info?: { width?: number; height?: number };
  video_info?: { duration_millis?: number; variants?: Variant[] };
}

interface TweetResult {
  id_str?: string;
  text?: string;
  user?: { screen_name?: string; name?: string; profile_image_url_https?: string };
  mediaDetails?: TweetMedia[];
  tombstone?: { text?: { text?: string } };
  __typename?: string;
}

export function tweetId(input: string): string {
  const trimmed = input.trim();
  if (/^\d{5,25}$/.test(trimmed)) return trimmed;

  const match =
    trimmed.match(/(?:twitter|x)\.com\/[^/]+\/status(?:es)?\/(\d{5,25})/) ??
    trimmed.match(/(?:twitter|x)\.com\/i\/(?:web\/)?status\/(\d{5,25})/) ??
    trimmed.match(/\/status(?:es)?\/(\d{5,25})/);
  if (match?.[1]) return match[1];

  throw new ExtractError('Paste a link to a single X post (an x.com/…/status/… link).', 400);
}

/**
 * The widget derives its `token` from the post id rather than being issued one.
 * The endpoint barely checks it, but sending the shape it expects keeps the
 * request indistinguishable from an ordinary embed.
 */
function embedToken(id: string): string {
  const value = (Number(id) / 1e15) * Math.PI;
  return value.toString(36).replace(/(0+|\.)/g, '') || 'a';
}

async function fetchTweet(id: string, token: string): Promise<{ tweet?: TweetResult; status: number }> {
  const url = `${TWEET_RESULT}?id=${id}&token=${token}&lang=en`;
  const response = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: { Accept: 'application/json', Referer: 'https://platform.twitter.com/' },
  });

  if (!response.ok) return { status: response.status };
  const text = await response.text();
  if (!text.trimStart().startsWith('{')) return { status: 502 };
  try {
    return { tweet: JSON.parse(text) as TweetResult, status: 200 };
  } catch {
    return { status: 502 };
  }
}

/** Resolution baked into the rendition path: `/vid/avc1/1280x720/xyz.mp4`. */
function dimensionsOf(url: string): { width: number; height: number } | undefined {
  const match = url.match(/\/(\d{2,4})x(\d{2,4})\//);
  if (!match) return undefined;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function videoLabel(variant: Variant): string {
  const size = variant.url ? dimensionsOf(variant.url) : undefined;
  if (size?.height) return `${size.height}p`;
  const kbps = Math.round((variant.bitrate ?? 0) / 1000);
  return kbps ? `${kbps}kbps` : 'Video';
}

/**
 * Progressive MP4 only, best first. The `application/x-mpegURL` entry is an HLS
 * playlist: useful to a player, useless as a saved file.
 */
function playableVariants(media: TweetMedia): Variant[] {
  const variants = (media.video_info?.variants ?? []).filter(
    (variant) => variant.url && variant.content_type === 'video/mp4'
  );

  variants.sort((a, b) => {
    const height = (dimensionsOf(b.url as string)?.height ?? 0) - (dimensionsOf(a.url as string)?.height ?? 0);
    return height || (b.bitrate ?? 0) - (a.bitrate ?? 0);
  });

  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = videoLabel(variant);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** `…/media/Abc123.jpg` → the untouched upload rather than a resized preview. */
function originalPhoto(url: string): { url: string; ext: string } {
  const clean = url.split('?')[0];
  const ext = clean.match(/\.(jpg|jpeg|png|webp|gif)$/i)?.[1]?.toLowerCase() ?? 'jpg';
  const base = clean.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
  return { url: `${base}?format=${ext === 'jpeg' ? 'jpg' : ext}&name=orig`, ext: ext === 'jpeg' ? 'jpg' : ext };
}

function titleOf(tweet: TweetResult, id: string): string {
  const text = (tweet.text ?? '')
    .replace(/https?:\/\/t\.co\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > 2) return text.slice(0, 90);
  const handle = tweet.user?.screen_name;
  return handle ? `${handle}_${id}` : `x_${id}`;
}

function buildFormats(tweet: TweetResult, title: string): FormatOption[] {
  const media = tweet.mediaDetails ?? [];
  const videos = media.filter((item) => item.type === 'video' || item.type === 'animated_gif');
  const photos = media.filter((item) => item.type === 'photo');
  const formats: FormatOption[] = [];

  videos.forEach((item, index) => {
    const prefix = videos.length > 1 ? `Video ${index + 1} · ` : '';
    const suffix = videos.length > 1 ? `_${index + 1}` : '';
    const isGif = item.type === 'animated_gif';

    playableVariants(item).forEach((variant, rank) => {
      formats.push({
        id: `x-v-${index}-${rank}`,
        quality: `${prefix}${videoLabel(variant)}${isGif ? ' GIF' : ''}`,
        type: 'video',
        format: 'mp4',
        url: variant.url as string,
        downloadUrl: proxyDownloadUrl(variant.url as string, sanitizeFilename(`${title}${suffix}`, 'mp4')),
      });
    });
  });

  photos.forEach((item, index) => {
    if (!item.media_url_https) return;
    const { url, ext } = originalPhoto(item.media_url_https);
    const size = item.original_info;
    const dims = size?.width && size?.height ? `${size.width}×${size.height}` : 'Original';
    const suffix = photos.length > 1 ? `_${index + 1}` : '';
    formats.push({
      id: `x-i-${index}`,
      quality: photos.length > 1 ? `Photo ${index + 1} · ${dims}` : `${dims} ${ext.toUpperCase()}`,
      type: 'image',
      format: ext,
      url,
      downloadUrl: proxyDownloadUrl(url, sanitizeFilename(`${title}${suffix}`, ext)),
    });
  });

  return formats;
}

export async function extractTwitter(rawUrl: string): Promise<MediaInfo> {
  let url = rawUrl.trim();
  if (/\/\/t\.co\//.test(url)) url = await resolveRedirect(url);

  const id = tweetId(url);

  // A 404 here is usually a genuinely missing post, but the endpoint also
  // rejects a token it dislikes the same way, so the plain form gets one try.
  let result = await fetchTweet(id, embedToken(id));
  if (!result.tweet && result.status === 404) result = await fetchTweet(id, 'a');

  if (!result.tweet) {
    if (result.status === 404 || result.status === 403) {
      throw new ExtractError(
        'That post could not be read. Deleted posts and protected accounts cannot be downloaded.',
        404
      );
    }
    if (result.status === 429) {
      throw new ExtractError('X is rate-limiting this server. Try again in a minute.', 429);
    }
    throw new ExtractError('X did not return that post. Please try again.', 502);
  }

  const tweet = result.tweet;
  if (tweet.tombstone || tweet.__typename === 'TweetTombstone') {
    throw new ExtractError(
      tweet.tombstone?.text?.text?.slice(0, 160) ||
        'X is withholding that post, so it cannot be downloaded.',
      403
    );
  }

  const title = titleOf(tweet, id);
  const formats = buildFormats(tweet, title);
  if (!formats.length) {
    throw new ExtractError('That post has no photo or video attached to download.', 422);
  }

  const firstVideo = (tweet.mediaDetails ?? []).find((item) => item.video_info?.duration_millis);
  const durationMs = firstVideo?.video_info?.duration_millis;

  return {
    platform: 'twitter',
    title,
    thumbnail: tweet.mediaDetails?.[0]?.media_url_https || tweet.user?.profile_image_url_https || '',
    duration: durationMs ? secondsToClock(durationMs / 1000) : undefined,
    author: tweet.user?.screen_name ? `@${tweet.user.screen_name}` : tweet.user?.name,
    formats: await attachSizes(formats),
  };
}
