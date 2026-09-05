/**
 * The /api/download route fetches a URL supplied by the client. Without a host
 * allowlist that turns the server into an open proxy and an SSRF vector into
 * anything reachable from the host, so only the CDNs we actually extract from
 * are permitted.
 */

const ALLOWED_HOST_SUFFIXES = [
  // YouTube
  'googlevideo.com',
  'youtube.com',
  'youtu.be',
  'ytimg.com',
  'ggpht.com',
  // Instagram / Meta
  'cdninstagram.com',
  'instagram.com',
  'fbcdn.net',
  // Pinterest
  'pinimg.com',
  'pinterest.com',
  // X (Twitter)
  'twimg.com',
  'twitter.com',
  'x.com',
  // TikTok — the CDN name varies by region and by asset type
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokv.com',
  'tiktokv.us',
  'tiktok.com',
  'muscdn.com',
  'musical.ly',
  'byteoversea.com',
  'ibyteimg.com',
];

export interface UrlCheck {
  ok: boolean;
  reason?: string;
  url?: URL;
}

export function checkProxyTarget(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'Malformed media URL.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'Only http(s) media URLs can be proxied.' };
  }

  const host = url.hostname.toLowerCase();
  const allowed = ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );

  if (!allowed) {
    return { ok: false, reason: 'That media host is not on the allowlist.' };
  }

  return { ok: true, url };
}

/** Referer some CDNs require before they will serve the asset. */
export function refererFor(host: string): string | undefined {
  const h = host.toLowerCase();
  if (h.includes('pinimg') || h.includes('pinterest')) return 'https://www.pinterest.com/';
  if (h.includes('cdninstagram') || h.includes('fbcdn') || h.includes('instagram')) {
    return 'https://www.instagram.com/';
  }
  if (h.includes('googlevideo') || h.includes('ytimg') || h.includes('youtube')) {
    return 'https://www.youtube.com/';
  }
  if (h.includes('tiktok') || h.includes('muscdn') || h.includes('musical') || h.includes('byteoversea')) {
    return 'https://www.tiktok.com/';
  }
  // video.twimg.com and pbs.twimg.com serve without one, and sending a referer
  // they did not expect is the surer way to get a 403.
  return undefined;
}

/**
 * googlevideo will not serve an adaptive stream as one open-ended GET. Measured
 * against a 3.4 MB audio file: a plain GET is throttled to about playback speed
 * (~31 KiB/s, 107 s) and for some videos is refused outright with a 403, while
 * the very same URL returns the whole file in 1.5 s when the request carries a
 * Range header. Hosts listed here are therefore read as a series of ranged
 * windows instead of one continuous stream.
 */
export function needsChunkedRange(host: string): boolean {
  const h = host.toLowerCase();
  return h === 'googlevideo.com' || h.endsWith('.googlevideo.com');
}
