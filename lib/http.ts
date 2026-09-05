import { BROWSER_UA, formatBytes, type FormatOption } from '@/lib/media';

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Optional egress proxy for YouTube's own hosts.
 *
 * YouTube scores IP reputation, and every serverless host is a datacenter
 * address, so the same code that sails through from a home connection gets
 * bot-challenged from Vercel. Pointing `YT_PROXY` at any HTTP(S) proxy moves the
 * handshake — and the media reads, since a signed URL can be tied to the address
 * that asked for it — off the host's own address. It is the only fix for a
 * challenged host that needs no YouTube account.
 *
 * The third-party resolver (`savenow.to`, see lib/youtube-api.ts) is on the list
 * for the same reason: it is the fallback for a distrusted address, so it is no
 * use if it distrusts that address too.
 */
const PROXY_HOSTS =
  /(^|\.)(youtube\.com|youtubei\.googleapis\.com|googlevideo\.com|savenow\.to|video-download-api\.com)$/i;

type ProxiedFetch = { call: typeof globalThis.fetch; dispatcher: unknown };
let proxyAgent: Promise<ProxiedFetch | null> | undefined;

function proxyFor(url: string): Promise<ProxiedFetch | null> | null {
  const target = process.env.YT_PROXY?.trim();
  if (!target) return null;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (!PROXY_HOSTS.test(host)) return null;

  // undici's own fetch, not the global one: the agent and the client have to come
  // from the same copy of undici for the dispatcher to be understood.
  proxyAgent ??= import('undici')
    .then((undici) => ({
      call: undici.fetch as unknown as typeof globalThis.fetch,
      dispatcher: new undici.ProxyAgent(target),
    }))
    .catch((error) => {
      console.warn('[http] YT_PROXY is set but no proxy agent could be built:', error);
      return null;
    });
  return proxyAgent;
}

/** True when a proxy is configured, for the diagnostics endpoint to report. */
export const hasProxy = (): boolean => Boolean(process.env.YT_PROXY?.trim());

/**
 * `fetch`, routed through `YT_PROXY` when one is set and the target is a
 * YouTube-owned host. Everything else goes out directly, unchanged.
 */
export async function mediaFetch(url: string, init?: RequestInit): Promise<Response> {
  const via = proxyFor(url);
  const proxied = via ? await via : null;
  if (!proxied) return fetch(url, init);
  return proxied.call(url, { ...init, dispatcher: proxied.dispatcher } as RequestInit);
}

export interface FetchOptions {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  timeoutMs?: number;
  redirect?: RequestRedirect;
}

/** fetch() with an abort timeout so a hung CDN cannot pin a request open. */
export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await mediaFetch(url, {
      method: options.method ?? 'GET',
      body: options.body,
      redirect: options.redirect ?? 'follow',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9',
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** GET a page as text, returning undefined instead of throwing. */
export async function tryFetchText(url: string, options: FetchOptions = {}): Promise<string | undefined> {
  try {
    const response = await fetchWithTimeout(url, options);
    if (!response.ok) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}

/** GET a JSON document, returning undefined instead of throwing. */
export async function tryFetchJson<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T | undefined> {
  const text = await tryFetchText(url, options);
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/** Follow redirects to learn the canonical URL of a short link. */
export async function resolveRedirect(url: string): Promise<string> {
  try {
    const response = await fetchWithTimeout(url, { redirect: 'follow', timeoutMs: 10_000 });
    return response.url || url;
  } catch {
    return url;
  }
}

/**
 * Ask a CDN how large a file is. Instagram and Pinterest never state a size in
 * their payloads, so the only honest number comes from the file itself. Some
 * hosts refuse HEAD, hence the single-byte Range fallback.
 */
export async function contentLength(url: string, referer?: string): Promise<number | undefined> {
  const headers = referer ? { Referer: referer, Origin: new URL(referer).origin } : undefined;

  try {
    const head = await fetchWithTimeout(url, { method: 'HEAD', timeoutMs: 8_000, headers });
    const length = Number(head.headers.get('content-length') ?? 0);
    if (head.ok && length > 0) return length;
  } catch {
    /* fall through to the Range probe */
  }

  try {
    const probe = await fetchWithTimeout(url, {
      timeoutMs: 8_000,
      headers: { ...headers, Range: 'bytes=0-0' },
    });
    // "bytes 0-0/12345" — the total is what we are after.
    const total = Number(probe.headers.get('content-range')?.split('/')[1] ?? 0);
    void probe.body?.cancel();
    return total > 0 ? total : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fill in `bytes`/`fileSize` for formats that point straight at a CDN file, all
 * in parallel. A host that will not answer simply leaves the size blank.
 */
export async function attachSizes(
  formats: FormatOption[],
  referer?: string
): Promise<FormatOption[]> {
  const sizes = await Promise.all(
    formats.map((format) => (format.url ? contentLength(format.url, referer) : undefined))
  );
  return formats.map((format, index) => {
    const bytes = sizes[index];
    return bytes ? { ...format, bytes, fileSize: formatBytes(bytes) } : format;
  });
}
