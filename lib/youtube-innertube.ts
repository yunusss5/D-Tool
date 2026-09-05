/**
 * YouTube extraction without a local binary.
 *
 * yt-dlp is the best engine when it is installed, but serverless hosts (Vercel,
 * Netlify, Cloudflare) have no Python and no writable install location, so the
 * spawn-based path is simply unavailable there. This module talks to InnerTube —
 * the same private API YouTube's own apps use — over plain `fetch`.
 *
 * Client choice is the whole trick, and it turns on proof-of-origin tokens.
 * `WEB`/`MWEB` refuse an anonymous server outright with "Sign in to confirm
 * you're not a bot". `IOS` still answers, but its media URLs are now token-gated
 * in a way that is invisible until you try to read them: they serve exactly the
 * first 1 MiB and then return 403 forever, at any offset, on a freshly minted
 * URL, for 7 of 10 videos sampled. `VISIONOS` needs neither a proof-of-origin
 * token nor YouTube's player JavaScript, and served whole files for 8 of 8 —
 * so it leads, and the others are only a fallback for the videos it declines
 * (it refuses "made for kids" uploads).
 *
 * A visitor id is not optional here. Without one, VISIONOS answers the first
 * request and then `LOGIN_REQUIRED` for every request after it.
 *
 * The last thing to know is that none of this is decided by the code alone.
 * YouTube scores the *address* the call comes from, and every serverless host is
 * a datacenter address, so a deployment can be challenged where a laptop on a
 * home connection is not. Three things follow, and all three are implemented
 * below: never let one refusal be the final answer (rounds are retried under a
 * fresh identity), never offer a format that cannot actually be read to the end
 * (gated clients are probed past the 1 MiB wall before their formats are used),
 * and give the operator a way out — `YT_VISITOR_DATA`, `YT_COOKIE` and
 * `YT_PROXY`, in increasing order of effort.
 */
import { createHash, randomBytes } from 'node:crypto';
import { ExtractError } from './media';
import { fetchWithTimeout, hasProxy } from './http';
import { webPoToken } from './youtube-potoken';
import type { YtDlpFormat, YtDlpInfo } from './ytdlp';

const ORIGIN = 'https://www.youtube.com';
const PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const VISITOR = 'https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false';

/**
 * A visitor id minted on a network YouTube trusts. Pinning one is the cheapest
 * repair for a challenged host: it carries the history that a freshly minted id
 * on a datacenter address does not.
 */
const PINNED_VISITOR = process.env.YT_VISITOR_DATA?.trim() || undefined;

/**
 * A signed-in cookie header, as copied from a browser. Deployments that Google
 * refuses to trust anonymously work with one, at the cost of tying downloads to
 * that account — so it stays opt-in and is never required.
 */
const COOKIE = process.env.YT_COOKIE?.trim() || undefined;

/**
 * A cookie on its own is ignored: InnerTube wants the SAPISIDHASH signature
 * YouTube's own web client derives from it, or it treats the call as anonymous.
 */
function cookieHeaders(): Record<string, string> {
  if (!COOKIE) return {};
  const headers: Record<string, string> = { Cookie: COOKIE, 'X-Origin': ORIGIN };
  const sapisid = /(?:^|;\s*)(?:__Secure-3PAPISID|SAPISID)=([^;]+)/.exec(COOKIE)?.[1];
  if (sapisid) {
    const at = Math.floor(Date.now() / 1000);
    const digest = createHash('sha1').update(`${at} ${sapisid} ${ORIGIN}`).digest('hex');
    headers.Authorization = `SAPISIDHASH ${at}_${digest}`;
    headers['X-Goog-AuthUser'] = '0';
  }
  return headers;
}

interface ClientProfile {
  /** Numeric id InnerTube expects in X-YouTube-Client-Name. */
  id: number;
  userAgent: string;
  context: Record<string, unknown>;
  /**
   * True when this client's media URLs stop at 1 MiB without a proof-of-origin
   * token. Its formats are still worth having — plenty of audio tracks and short
   * clips fit inside that — but they must never displace an ungated URL for the
   * same itag.
   */
  gated?: boolean;
  /**
   * True when this client is pointless without a proof-of-origin token, so it is
   * only asked once one has been minted. `WEB` is the only such client here: it
   * refuses an anonymous server outright, and answers with a token — which makes
   * it the one door left on a host whose address YouTube distrusts.
   */
  needsPoToken?: boolean;
}

/** Order matters: the first client to offer an itag is the one whose URL is used. */
const CLIENTS: ClientProfile[] = [
  {
    id: 101,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    context: {
      clientName: 'VISIONOS',
      clientVersion: '1.02',
      deviceMake: 'Apple',
      deviceModel: 'RealityDevice17,1',
      osName: 'visionOS',
      osVersion: '26.5.23O471',
      hl: 'en',
      gl: 'US',
      utcOffsetMinutes: 0,
    },
  },
  {
    id: 5,
    userAgent: 'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    context: {
      clientName: 'IOS',
      clientVersion: '21.26.4',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.2.22D82',
      hl: 'en',
      gl: 'US',
      utcOffsetMinutes: 0,
    },
    gated: true,
  },
  {
    id: 28,
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    context: {
      clientName: 'ANDROID_VR',
      clientVersion: '1.62.27',
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      androidSdkVersion: 32,
      osName: 'Android',
      osVersion: '12L',
      hl: 'en',
      gl: 'US',
      utcOffsetMinutes: 0,
    },
  },
  // Last resort for a host the ungated pair refuses to serve. ANDROID answers
  // when VISIONOS is challenged, but it is proof-of-origin gated, so its formats
  // are only used when nothing better covers the itag *and* a probe confirms the
  // URL reads past the 1 MiB wall — see servesWholeFile. (The YouTube TV client,
  // ANDROID_UNPLUGGED, is not here on purpose: it answers "Please sign in" to
  // every anonymous call, so it would only cost a round trip.)
  {
    id: 3,
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US; Pixel 8) gzip',
    context: {
      clientName: 'ANDROID',
      clientVersion: '20.10.38',
      deviceMake: 'Google',
      deviceModel: 'Pixel 8',
      androidSdkVersion: 34,
      osName: 'Android',
      osVersion: '14',
      hl: 'en',
      gl: 'US',
      utcOffsetMinutes: 0,
    },
    gated: true,
  },
  // Asked only once a proof-of-origin token exists, because without one it is the
  // client that refuses an anonymous server most firmly. With one it is the only
  // door that opens on an address YouTube has decided not to trust, so it is worth
  // the extra round trip that minting costs.
  {
    id: 1,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    context: {
      clientName: 'WEB',
      clientVersion: '2.20240726.00.00',
      osName: 'Windows',
      osVersion: '10.0',
      platform: 'DESKTOP',
      hl: 'en',
      gl: 'US',
      utcOffsetMinutes: 0,
    },
    needsPoToken: true,
  },
];

interface InnerTubeFormat {
  itag?: number;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  mimeType?: string;
  bitrate?: number;
  averageBitrate?: number;
  width?: number;
  height?: number;
  fps?: number;
  qualityLabel?: string;
  contentLength?: string;
  approxDurationMs?: string;
  audioSampleRate?: string;
  audioChannels?: number;
  isDrc?: boolean;
  audioTrack?: { id?: string; audioIsDefault?: boolean };
}

interface PlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
    messages?: string[];
    errorScreen?: unknown;
  };
  streamingData?: {
    expiresInSeconds?: string;
    formats?: InnerTubeFormat[];
    adaptiveFormats?: InnerTubeFormat[];
  };
  videoDetails?: {
    videoId?: string;
    title?: string;
    lengthSeconds?: string;
    viewCount?: string;
    author?: string;
    channelId?: string;
    shortDescription?: string;
    isLive?: boolean;
    isLiveContent?: boolean;
    isUpcoming?: boolean;
    thumbnail?: { thumbnails?: Array<{ url?: string; width?: number; height?: number }> };
  };
}

/**
 * Visitor identity.
 *
 * A visitor id makes the call look like a returning app install rather than a
 * brand new one, and without one VISIONOS answers a single request and then
 * `LOGIN_REQUIRED` for everything after it. Three rules follow from how much
 * rests on it:
 *
 * - A failed mint must never be cached. Caching `undefined` for six hours is how
 *   one blocked request at a cold start takes a whole deployment down until the
 *   instance recycles, which is exactly what a challenged host does to itself.
 * - There must always be *some* id. InnerTube accepts a locally generated one —
 *   it simply carries no history — and that is far better than none at all.
 * - It must be replaceable, because reputation attaches to the id as well as to
 *   the address, so a challenged round is worth retrying under a new one.
 */
const VISITOR_TTL = 6 * 60 * 60_000;
let visitorCache: { at: number; value: Promise<string> } | undefined;
let visitorOrigin: 'pinned' | 'minted' | 'generated' = PINNED_VISITOR ? 'pinned' : 'minted';

/** InnerTube's own encoding: protobuf `{ 1: <11-char id>, 5: <unix seconds> }`, base64url. */
function generateVisitorData(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const id = Array.from(randomBytes(11), (byte) => alphabet[byte % alphabet.length]).join('');
  const varint: number[] = [];
  let seconds = Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 600_000);
  while (seconds > 0x7f) {
    varint.push((seconds & 0x7f) | 0x80);
    seconds >>>= 7;
  }
  varint.push(seconds);
  const bytes = [0x0a, 0x0b, ...Buffer.from(id, 'ascii'), 0x28, ...varint];
  return Buffer.from(Uint8Array.from(bytes)).toString('base64url');
}

/** Never rejects: a generated id is the floor, so callers always have one. */
async function mintVisitorData(): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(VISITOR, {
        method: 'POST',
        timeoutMs: 10_000,
        headers: {
          'Content-Type': 'application/json',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': '2.20240726.00.00',
          ...cookieHeaders(),
        },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' } },
        }),
      });
      if (response.ok) {
        const json = (await response.json()) as { responseContext?: { visitorData?: string } };
        if (json.responseContext?.visitorData) {
          visitorOrigin = 'minted';
          return json.responseContext.visitorData;
        }
      }
    } catch {
      /* fall through to the next attempt, then to a generated id */
    }
  }
  visitorOrigin = 'generated';
  return generateVisitorData();
}

function visitorData(): Promise<string> {
  if (PINNED_VISITOR) return Promise.resolve(PINNED_VISITOR);
  const now = Date.now();
  if (!visitorCache || now - visitorCache.at > VISITOR_TTL) {
    visitorCache = { at: now, value: mintVisitorData() };
  }
  return visitorCache.value;
}

/** Drop the current identity so the next call starts a fresh one. */
function rotateVisitor(): void {
  if (!PINNED_VISITOR) visitorCache = undefined;
}

async function callPlayer(
  client: ClientProfile,
  videoId: string,
  poToken?: string
): Promise<PlayerResponse | undefined> {
  const visitor = await visitorData();
  if (client.needsPoToken && !poToken) return undefined;

  const body = {
    videoId,
    context: {
      client: { ...client.context, visitorData: visitor },
      user: { lockedSafetyMode: false },
      request: { useSsl: true, internalExperimentFlags: [] },
    },
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
    contentCheckOk: true,
    racyCheckOk: true,
    ...(poToken ? { serviceIntegrityDimensions: { poToken } } : {}),
  };

  const response = await fetchWithTimeout(PLAYER, {
    method: 'POST',
    timeoutMs: 20_000,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': client.userAgent,
      'X-YouTube-Client-Name': String(client.id),
      'X-YouTube-Client-Version': String(client.context.clientVersion),
      Origin: ORIGIN,
      Accept: '*/*',
      'X-Goog-Visitor-Id': visitor,
      ...cookieHeaders(),
    },
  });

  if (!response.ok) return undefined;
  const text = await response.text();
  if (!text.trimStart().startsWith('{')) return undefined;
  try {
    return JSON.parse(text) as PlayerResponse;
  } catch {
    return undefined;
  }
}

/** `video/mp4; codecs="avc1.640028, mp4a.40.2"` → container + codec list. */
function parseMime(mimeType: string | undefined): { kind: string; container: string; codecs: string[] } {
  const [type = '', ...params] = (mimeType ?? '').split(';');
  const [kind = '', container = ''] = type.trim().split('/');
  const codecList = params.join(';').match(/codecs\s*=\s*"([^"]*)"/i)?.[1] ?? '';
  return {
    kind,
    container,
    codecs: codecList
      .split(',')
      .map((codec) => codec.trim())
      .filter(Boolean),
  };
}

/** yt-dlp's own naming, so downstream ranking code needs no special cases. */
function extensionFor(kind: string, container: string, hasVideo: boolean): string {
  if (container === 'webm') return hasVideo ? 'webm' : 'weba';
  if (container === 'mp4') return hasVideo ? 'mp4' : 'm4a';
  if (container === '3gpp') return '3gp';
  return container || (kind === 'audio' ? 'm4a' : 'mp4');
}

function toYtDlpFormat(source: InnerTubeFormat, progressive: boolean): YtDlpFormat | undefined {
  if (!source.url || !source.itag) return undefined;
  const { kind, container, codecs } = parseMime(source.mimeType);
  const videoCodec = codecs.find((codec) => /^(avc1|av01|vp0?9|vp8|h263|mp4v)/i.test(codec));
  const audioCodec = codecs.find((codec) => /^(mp4a|opus|vorbis|ec-3|ac-3|dtse)/i.test(codec));
  const hasVideo = kind === 'video' || Boolean(videoCodec);
  const hasAudio = progressive ? true : kind === 'audio' || Boolean(audioCodec);
  const bitrateKbps = (source.averageBitrate ?? source.bitrate ?? 0) / 1000;

  return {
    format_id: String(source.itag),
    url: source.url,
    ext: extensionFor(kind, container, hasVideo),
    protocol: 'https',
    vcodec: hasVideo ? videoCodec ?? 'unknown' : 'none',
    acodec: hasAudio ? audioCodec ?? 'unknown' : 'none',
    width: source.width,
    height: source.height,
    fps: source.fps,
    tbr: bitrateKbps || undefined,
    vbr: hasVideo && !hasAudio ? bitrateKbps || undefined : undefined,
    abr: hasAudio && !hasVideo ? bitrateKbps || undefined : undefined,
    filesize: source.contentLength ? Number(source.contentLength) : undefined,
    format_note: source.qualityLabel,
  };
}

/**
 * Collect the usable renditions out of one player response.
 *
 * Two kinds of entry get dropped. Anything whose URL is still wrapped in
 * `signatureCipher` would need YouTube's player JavaScript to be downloaded and
 * interpreted, which is exactly the fragility this module exists to avoid. And
 * audio itags arrive twice — once normally, once with `isDrc` (dynamic range
 * compression) — plus once per dubbed language track; the plain default is the
 * one a viewer expects, so the extras are discarded.
 */
function collectFormats(response: PlayerResponse): YtDlpFormat[] {
  const progressive = response.streamingData?.formats ?? [];
  const adaptive = response.streamingData?.adaptiveFormats ?? [];
  const byItag = new Map<number, YtDlpFormat>();

  for (const [source, isProgressive] of [
    ...progressive.map((f) => [f, true] as const),
    ...adaptive.map((f) => [f, false] as const),
  ]) {
    if (source.isDrc) continue;
    if (source.audioTrack && source.audioTrack.audioIsDefault === false) continue;
    const mapped = toYtDlpFormat(source, isProgressive);
    if (mapped && !byItag.has(source.itag as number)) byItag.set(source.itag as number, mapped);
  }

  return [...byItag.values()];
}

/** Turn a refusal from InnerTube into something a visitor can act on. */
function playabilityError(response: PlayerResponse): { error: ExtractError; fatal: boolean } | undefined {
  const playability = response.playabilityStatus;
  const status = playability?.status ?? '';
  if (!status || status === 'OK') return undefined;
  const reason = `${playability?.reason ?? ''} ${playability?.messages?.join(' ') ?? ''}`.toLowerCase();

  if (reason.includes("not a bot") || reason.includes('sign in to confirm')) {
    return {
      error: new ExtractError('YouTube is challenging this server right now. Wait a minute and try again.', 503),
      fatal: false,
    };
  }
  if (reason.includes('private')) {
    return { error: new ExtractError('That video is private, so it cannot be downloaded.', 403), fatal: true };
  }
  if (reason.includes('age') || status === 'AGE_VERIFICATION_REQUIRED') {
    return {
      error: new ExtractError(
        'That video is age-restricted and needs a signed-in YouTube session, which this tool does not use.',
        403
      ),
      fatal: true,
    };
  }
  if (reason.includes('members-only') || reason.includes('join this channel')) {
    return { error: new ExtractError('That video is members-only, so it cannot be downloaded.', 403), fatal: true };
  }
  if (reason.includes('has not started') || status === 'LIVE_STREAM_OFFLINE') {
    return { error: new ExtractError('That live stream has not started yet.', 404), fatal: true };
  }
  if (reason.includes('unavailable') || reason.includes('removed') || status === 'ERROR') {
    return {
      error: new ExtractError('That video is unavailable — it may have been removed or made private.', 404),
      fatal: true,
    };
  }
  if (reason.includes('not available in your country') || reason.includes('uploader has not made')) {
    return { error: new ExtractError('That video is blocked in this server’s region.', 403), fatal: true };
  }
  return {
    error: new ExtractError(
      playability?.reason?.slice(0, 180) || 'That video cannot be downloaded.',
      status === 'LOGIN_REQUIRED' ? 403 : 422
    ),
    fatal: status !== 'LOGIN_REQUIRED',
  };
}

export interface InnerTubeResult {
  /** Present when at least one client returned playable streams. */
  info?: YtDlpInfo;
  /** Why it failed, ready to show a visitor. */
  error?: ExtractError;
  /** True when retrying with another engine cannot help (private, removed, age-gated). */
  fatal?: boolean;
}

/** googlevideo serves exactly this much of a PO-token-gated URL, then 403s forever. */
const GATED_CAP = 1_048_576;

interface Answer {
  client: ClientProfile;
  response: PlayerResponse;
}

/**
 * Does this URL actually read past the 1 MiB wall?
 *
 * Two bytes over the line is enough to know, so the question is cheap to ask —
 * and asking it is what makes the gated clients usable as a fallback at all. A
 * format that would die a megabyte into the download gets dropped here instead
 * of being offered and failing in front of the visitor. Files that fit inside
 * the cap need no probe: there is no wall in front of them.
 */
async function servesWholeFile(format: YtDlpFormat): Promise<boolean> {
  if (!format.url) return false;
  if (format.filesize && format.filesize <= GATED_CAP) return true;
  try {
    const response = await fetchWithTimeout(format.url, {
      timeoutMs: 8_000,
      headers: { Range: `bytes=${GATED_CAP}-${GATED_CAP + 1}` },
    });
    void response.body?.cancel();
    return response.status === 206;
  } catch {
    return false;
  }
}

/**
 * Ask every client at once, ungated answers first.
 *
 * Running them in parallel costs no extra wall-clock time and buys two things:
 * resilience, because a client being bot-challenged this minute simply
 * contributes nothing, and a progressive (single-file, has-audio) rendition,
 * which `ANDROID_VR` still serves and the others do not. That progressive stream
 * is what keeps the site useful on hosts where ffmpeg is unavailable.
 */
/** Every listed client at once; the ones that threw or answered nothing drop out. */
async function askAll(
  clients: ClientProfile[],
  videoId: string,
  poToken: string | undefined
): Promise<Answer[]> {
  const settled = await Promise.allSettled(
    clients.map((client) => callPlayer(client, videoId, poToken))
  );
  return settled
    .map((entry, index) => ({
      client: clients[index],
      response: entry.status === 'fulfilled' ? entry.value : undefined,
    }))
    .filter((entry): entry is Answer => Boolean(entry.response));
}

async function askClients(videoId: string): Promise<Answer[]> {
  const anonymous = CLIENTS.filter((client) => !client.needsPoToken);
  const answers = await askAll(anonymous, videoId, undefined);

  // Minting a token runs a BotGuard VM, which is the most expensive thing in this
  // file, so it happens only when the anonymous round has nothing to show — on a
  // host YouTube trusts, that is never. When the round *is* empty the address is
  // the likely reason, and a token is the one credential that answers that check
  // without an account, so every client is asked again carrying one.
  const usable = answers.some((entry) => collectFormats(entry.response).length > 0);
  const all = usable
    ? answers
    : await (async () => {
        const token = await webPoToken(await visitorData());
        if (!token) return answers;
        const retried = await askAll(CLIENTS, videoId, token);
        return retried.some((entry) => collectFormats(entry.response).length > 0) ? retried : answers;
      })();

  return [
    ...all.filter((entry) => !entry.client.gated),
    ...all.filter((entry) => entry.client.gated),
  ];
}

/**
 * Merge the answers into one format list, best URL per itag.
 *
 * Where two clients offer the same itag the ungated URL wins outright. A gated
 * client is only reached for itags nothing else covers, and then only if the
 * probe says its URLs read to the end — one probe per client, since the cap is
 * applied to the session rather than to individual renditions.
 */
async function mergeFormats(ranked: Answer[]): Promise<{
  formats: YtDlpFormat[];
  details: PlayerResponse['videoDetails'] | undefined;
}> {
  const formats: YtDlpFormat[] = [];
  const seen = new Set<string>();
  let details: PlayerResponse['videoDetails'] | undefined;

  for (const { client, response } of ranked) {
    const status = response.playabilityStatus?.status;
    if (status && status !== 'OK') continue;
    details ??= response.videoDetails;

    const fresh = collectFormats(response).filter((format) => !seen.has(format.format_id));
    if (!fresh.length) continue;
    if (client.gated) {
      // Probe the largest rendition: the biggest file is the one most likely to
      // be sitting behind the wall, so its answer is the least ambiguous.
      const widest = fresh.reduce((a, b) => ((b.filesize ?? 0) > (a.filesize ?? 0) ? b : a));
      if (!(await servesWholeFile(widest))) continue;
    }
    for (const format of fresh) {
      seen.add(format.format_id);
      formats.push(format);
    }
  }

  return { formats, details };
}

/** One pass over every client under the current visitor identity. */
async function oneRound(videoId: string): Promise<InnerTubeResult> {
  const ranked = await askClients(videoId);
  if (ranked.length === 0) {
    return { error: new ExtractError('YouTube did not answer this server. Please try again.', 502) };
  }

  const { formats, details } = await mergeFormats(ranked);

  if (formats.length === 0) {
    // What each client said, in the server log: on a challenged host this is the
    // only place the difference between "we are being bot-checked" and "this
    // video is genuinely unavailable" can be seen.
    console.warn(
      `[youtube] no usable formats for ${videoId} —`,
      ranked
        .map(
          ({ client, response }) =>
            `${client.context.clientName}=${response.playabilityStatus?.status ?? 'NO_STATUS'}`
        )
        .join(' ')
    );
    const failures = ranked
      .map(({ response }) => playabilityError(response))
      .filter((failure): failure is { error: ExtractError; fatal: boolean } => Boolean(failure));
    // A permanent, specific diagnosis beats a transient one: "members-only" tells
    // the visitor something true where "we are being challenged" would not.
    const chosen = failures.find((failure) => failure.fatal) ?? failures[0];
    return chosen
      ? { error: chosen.error, fatal: chosen.fatal }
      : { error: new ExtractError('No downloadable streams were found for that video.', 422) };
  }

  const thumbnails = details?.thumbnail?.thumbnails ?? [];
  const largest = thumbnails.reduce<{ url?: string; width?: number }>(
    (best, current) => ((current.width ?? 0) > (best.width ?? 0) ? current : best),
    {}
  );
  const duration = Number(details?.lengthSeconds ?? 0);

  return {
    info: {
      id: details?.videoId ?? videoId,
      title: details?.title,
      description: details?.shortDescription,
      thumbnail: largest.url,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
      view_count: details?.viewCount ? Number(details.viewCount) : null,
      uploader: details?.author,
      channel: details?.author,
      uploader_id: details?.channelId,
      extractor: 'youtube:innertube',
      webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
      is_live: details?.isLive === true,
      live_status: details?.isLive ? 'is_live' : details?.isUpcoming ? 'is_upcoming' : 'not_live',
      formats,
    },
  };
}

/**
 * Resolve a video, retrying the whole round under a fresh identity.
 *
 * One refusal is not an answer. YouTube's decision to challenge a caller is made
 * against the pair (address, visitor id), and only one half of that is fixed for
 * a deployment — so when every client comes back empty, dropping the identity and
 * asking again costs about a second and routinely turns a 503 into a download. A
 * verdict that a new identity cannot change (private, removed, members-only,
 * age-gated) is returned immediately instead.
 */
export async function innertubeInfo(videoId: string): Promise<InnerTubeResult> {
  let last: InnerTubeResult = {};

  // Three identities, backing off between them. A challenge arrives in bursts
  // rather than as a steady state, so the second and third ask land after it has
  // often already passed; the delays are what make the extra rounds worth having,
  // and they stay well inside the request budget even when all of them fail.
  for (let round = 0; round < 3; round += 1) {
    if (round > 0) {
      rotateVisitor();
      await new Promise((resolve) => setTimeout(resolve, round === 1 ? 250 : 750));
    }
    last = await oneRound(videoId);
    if (last.info || last.fatal) return last;
  }

  return last;
}

export interface InnerTubeDiagnostics {
  videoId: string;
  /** Where the identity came from: an env pin, YouTube's mint, or generated locally. */
  visitor: 'pinned' | 'minted' | 'generated';
  /** Whether the escape hatches are configured. Never the values themselves. */
  cookie: boolean;
  proxy: boolean;
  clients: Array<{
    client: string;
    status: string;
    reason?: string;
    formats: number;
    gated: boolean;
    /** Whether the largest rendition reads past the 1 MiB proof-of-origin wall. */
    reach?: 'full' | 'capped';
  }>;
  usableFormats: number;
}

/**
 * What this particular host gets back from InnerTube, one line per client.
 *
 * Working locally proves nothing about a deployment, because the address is the
 * variable that matters, so this exists to be called against the deployed URL —
 * it turns "YouTube is challenging this server" into the specific client statuses
 * behind it. Statuses and counts only: no media URLs, no cookie, no identity.
 */
export async function innertubeDiagnostics(videoId: string): Promise<InnerTubeDiagnostics> {
  await visitorData();
  const ranked = await askClients(videoId);

  const clients = await Promise.all(
    ranked.map(async ({ client, response }) => {
      const formats = collectFormats(response);
      const widest = formats.length
        ? formats.reduce((a, b) => ((b.filesize ?? 0) > (a.filesize ?? 0) ? b : a))
        : undefined;
      const reach = widest ? ((await servesWholeFile(widest)) ? 'full' : 'capped') : undefined;
      return {
        client: String(client.context.clientName),
        status: response.playabilityStatus?.status ?? 'NO_STATUS',
        reason: response.playabilityStatus?.reason?.slice(0, 160),
        formats: formats.length,
        gated: Boolean(client.gated),
        reach: reach as 'full' | 'capped' | undefined,
      };
    })
  );

  const { formats } = await mergeFormats(ranked);

  return {
    videoId,
    visitor: visitorOrigin,
    cookie: Boolean(COOKIE),
    proxy: hasProxy(),
    clients,
    usableFormats: formats.length,
  };
}
