/**
 * Proof-of-origin tokens.
 *
 * YouTube's web player proves it is a real browser by running a BotGuard VM and
 * minting a proof-of-origin ("PO") token from the result. The clients this app
 * prefers — VISIONOS, ANDROID_VR — need no such token, which is exactly why they
 * lead. But a token is not only about the client: when the *address* is
 * distrusted, every anonymous client answers `LOGIN_REQUIRED / Sign in to confirm
 * you're not a bot`, and a PO token is the one credential that speaks to that
 * check without a Google account behind it.
 *
 * `bgutils-js` is BotGuard's VM reimplemented in JavaScript; jsdom supplies the
 * browser globals the VM reaches for. Both are loaded lazily, so a host that is
 * never challenged never pays for either.
 *
 * Everything here fails soft. A token is an improvement on an anonymous call, not
 * a prerequisite for one, so every path returns `undefined` rather than throwing.
 */
import { mediaFetch } from './http';

/** The key YouTube's own web player uses to open a challenge. */
const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';

/** Floor and ceiling for how long a minted token is reused. */
const MIN_TTL = 60_000;
const MAX_TTL = 6 * 60 * 60_000;

interface Cached {
  at: number;
  ttl: number;
  identifier: string;
  value: Promise<string | undefined>;
}

let cache: Cached | undefined;

/**
 * BotGuard's interpreter is evaluated in this process's global scope, so the
 * browser globals it reaches for have to be *on* that scope. Only names it
 * actually looks up are copied, only if they are missing or writable, and only
 * once per process.
 */
const DOM_GLOBALS = [
  'window',
  'document',
  'location',
  'history',
  'screen',
  'HTMLElement',
  'Element',
  'Node',
  'Event',
  'CustomEvent',
  'XMLHttpRequest',
  'MutationObserver',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'matchMedia',
  'localStorage',
  'sessionStorage',
] as const;

let domReady: Promise<void> | undefined;

async function installBrowserGlobals(): Promise<void> {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://www.youtube.com/',
    referrer: 'https://www.youtube.com/',
    pretendToBeVisual: true,
  });

  const scope = globalThis as unknown as Record<string, unknown>;
  const source = dom.window as unknown as Record<string, unknown>;
  for (const name of DOM_GLOBALS) {
    if (!(name in source)) continue;
    try {
      Object.defineProperty(scope, name, {
        value: source[name],
        writable: true,
        configurable: true,
      });
    } catch {
      /* a read-only global already there is fine — the VM only needs one of each */
    }
  }
}

/** A `typeof fetch` for bgutils, so `YT_PROXY` covers the attestation calls too. */
const fetchFunction = ((input: unknown, init?: RequestInit) =>
  mediaFetch(String(input), init)) as unknown as typeof fetch;

async function mint(identifier: string): Promise<{ token?: string; ttl: number }> {
  const [{ BotGuardClient, getChallenge }, { WebPoMinter }, { buildURL, getHeaders }] = await Promise.all([
    import('bgutils-js/botguard'),
    import('bgutils-js/webpo'),
    import('bgutils-js/utils'),
  ]);

  domReady ??= installBrowserGlobals();
  await domReady;

  const challenge = await getChallenge({ requestKey: REQUEST_KEY, fetchFunction });
  const script = challenge.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  if (!script || !challenge.globalName) return { ttl: MIN_TTL };

  // The interpreter registers itself under `globalName` on the global scope.
  new Function(script)();

  const client = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });

  const webPoSignalOutput: Array<((buffer: Uint8Array) => Promise<(binding: Uint8Array) => Promise<Uint8Array | undefined>>) | undefined> = [];
  const botguardResponse = await client.snapshot({ webPoSignalOutput });

  const response = await fetchFunction(buildURL('GenerateIT', false), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify([REQUEST_KEY, botguardResponse]),
  });
  if (!response.ok) return { ttl: MIN_TTL };

  const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] =
    (await response.json()) as [string?, number?, number?, string?];
  if (!integrityToken) return { ttl: MIN_TTL };

  const minter = await WebPoMinter.create(
    { integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken },
    webPoSignalOutput
  );

  const token = await minter.mintAsWebsafeString(identifier);
  // Refresh well before YouTube's own estimate expires; it is only an estimate.
  const ttl = estimatedTtlSecs ? Math.round(estimatedTtlSecs * 1000 * 0.8) : MIN_TTL;
  return { token, ttl: Math.min(Math.max(ttl, MIN_TTL), MAX_TTL) };
}

/**
 * A PO token bound to `identifier` (the visitor id), cached until it is stale.
 *
 * A failed mint is cached for a minute and no longer: BotGuard is the expensive
 * part of a challenged request, and hammering it on every call would turn one
 * refusal into a slow deployment. One minute is short enough that a transient
 * failure heals on its own.
 */
export function webPoToken(identifier: string): Promise<string | undefined> {
  const now = Date.now();
  if (cache && cache.identifier === identifier && now - cache.at < cache.ttl) return cache.value;

  const entry: Cached = {
    at: now,
    ttl: MIN_TTL,
    identifier,
    value: mint(identifier)
      .then(({ token, ttl }) => {
        entry.ttl = token ? ttl : MIN_TTL;
        return token;
      })
      .catch((error) => {
        console.warn('[youtube] proof-of-origin mint failed:', (error as Error).message);
        return undefined;
      }),
  };
  cache = entry;
  return entry.value;
}

/**
 * A "cold start" token: the placeholder YouTube's player sends before BotGuard
 * has finished. It needs no VM and no network, so it is worth trying when the
 * real mint is refused — YouTube accepts it for a while, then stops.
 */
export async function coldStartPoToken(identifier: string): Promise<string | undefined> {
  try {
    const { createColdStartToken } = await import('bgutils-js/webpo');
    return createColdStartToken(identifier);
  } catch {
    return undefined;
  }
}
