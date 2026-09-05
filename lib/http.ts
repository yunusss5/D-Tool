import { BROWSER_UA, formatBytes, type FormatOption } from '@/lib/media';

const DEFAULT_TIMEOUT_MS = 15_000;

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
    return await fetch(url, {
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
