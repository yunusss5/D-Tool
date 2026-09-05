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
 */
import { ExtractError } from './media';
import { fetchWithTimeout } from './http';
import type { YtDlpFormat, YtDlpInfo } from './ytdlp';

const PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const VISITOR = 'https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false';

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
 * A visitor identity makes the call look like a returning app install rather
 * than a brand new one, which keeps YouTube from challenging it as quickly.
 * One token is enough for the life of the process.
 */
let visitorCache: { at: number; value: Promise<string | undefined> } | undefined;
const VISITOR_TTL = 6 * 60 * 60_000;

function visitorData(): Promise<string | undefined> {
  const now = Date.now();
  if (!visitorCache || now - visitorCache.at > VISITOR_TTL) {
    const value = (async () => {
      try {
        const response = await fetchWithTimeout(VISITOR, {
          method: 'POST',
          timeoutMs: 10_000,
          headers: {
            'Content-Type': 'application/json',
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': '2.20240726.00.00',
          },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' } },
          }),
        });
        if (!response.ok) return undefined;
        const json = (await response.json()) as { responseContext?: { visitorData?: string } };
        return json.responseContext?.visitorData || undefined;
      } catch {
        return undefined;
      }
    })().catch(() => undefined);
    visitorCache = { at: now, value };
  }
  return visitorCache.value;
}

async function callPlayer(client: ClientProfile, videoId: string): Promise<PlayerResponse | undefined> {
  const visitor = await visitorData();
  const body = {
    videoId,
    context: {
      client: { ...client.context, ...(visitor ? { visitorData: visitor } : {}) },
      user: { lockedSafetyMode: false },
      request: { useSsl: true, internalExperimentFlags: [] },
    },
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
    contentCheckOk: true,
    racyCheckOk: true,
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
      Origin: 'https://www.youtube.com',
      Accept: '*/*',
      ...(visitor ? { 'X-Goog-Visitor-Id': visitor } : {}),
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

/**
 * Ask every client at once and keep the best answer.
 *
 * Running them in parallel costs no extra wall-clock time and buys two things:
 * resilience, because a client that is being bot-challenged this minute simply
 * contributes nothing, and a progressive (single-file, has-audio) rendition,
 * which `ANDROID_VR` still serves and the others do not. That progressive stream
 * is what keeps the site useful on hosts where ffmpeg is unavailable.
 *
 * Where two clients offer the same itag, the ungated URL wins — a gated one
 * would download its first megabyte and then fail, which is worse than not
 * offering the format at all.
 */
export async function innertubeInfo(videoId: string): Promise<InnerTubeResult> {
  const settled = await Promise.allSettled(CLIENTS.map((client) => callPlayer(client, videoId)));
  const answers = settled
    .map((entry, index) => ({
      client: CLIENTS[index],
      response: entry.status === 'fulfilled' ? entry.value : undefined,
    }))
    .filter((entry): entry is { client: ClientProfile; response: PlayerResponse } =>
      Boolean(entry.response)
    );

  if (answers.length === 0) {
    return { error: new ExtractError('YouTube did not answer this server. Please try again.', 502) };
  }

  const ranked = [
    ...answers.filter((entry) => !entry.client.gated),
    ...answers.filter((entry) => entry.client.gated),
  ];

  const formats: YtDlpFormat[] = [];
  const seen = new Set<string>();
  let details: PlayerResponse['videoDetails'] | undefined;

  for (const { response } of ranked) {
    if (response.playabilityStatus?.status && response.playabilityStatus.status !== 'OK') continue;
    details ??= response.videoDetails;
    for (const format of collectFormats(response)) {
      if (seen.has(format.format_id)) continue;
      seen.add(format.format_id);
      formats.push(format);
    }
  }

  if (formats.length === 0) {
    for (const { response } of ranked) {
      const failure = playabilityError(response);
      if (failure) return { error: failure.error, fatal: failure.fatal };
    }
    return { error: new ExtractError('No downloadable streams were found for that video.', 422) };
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
