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
  return undefined;
}
