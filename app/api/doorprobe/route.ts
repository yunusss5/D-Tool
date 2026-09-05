/**
 * Temporary measurement route — delete once the question below is settled.
 *
 * Settled already, by the identity probes this replaced: rotating the visitor id
 * per request changes nothing from bom1 (22 consecutive `LOGIN_REQUIRED / Sign in
 * to confirm you're not a bot`, minted ids, 4/4 mints succeeding). And the browser
 * cannot take over the handshake: InnerTube answers 403 to any request carrying a
 * foreign `Origin`, which is the one header a browser will not let you forge.
 *
 * So the only remaining lever is somebody else's address. This sweeps the public
 * resolver networks — Invidious, Piped, cobalt — from the deployed function, using
 * each project's own live instance list rather than a list that rots in this file,
 * and reports which of them can still hand back a YouTube stream URL.
 *
 * Hosts and counts only; no stream URLs in the output.
 */
import { NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface Trial {
  host: string;
  code: string;
  streams?: number;
  note?: string;
}

async function json<T>(url: string, timeoutMs = 12_000): Promise<T | undefined> {
  try {
    const response = await fetchWithTimeout(url, { timeoutMs, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

/** Run `work` over `items` with a small concurrency cap so a sweep fits the budget. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await work(items[index]);
    }
  });
  await Promise.all(runners);
  return out;
}

async function attempt(host: string, run: () => Promise<Trial>): Promise<Trial> {
  try {
    return await run();
  } catch (error) {
    return { host, code: `THREW_${(error as Error).name}` };
  }
}

/* ------------------------------- Invidious ------------------------------ */

interface InvidiousEntry {
  0: string;
  1: { type?: string; uri?: string; api?: boolean | null };
}

async function invidious(videoId: string): Promise<Trial[]> {
  const list = await json<InvidiousEntry[]>('https://api.invidious.io/instances.json');
  if (!list) return [{ host: 'api.invidious.io', code: 'INSTANCE_LIST_UNREACHABLE' }];

  const uris = list
    .filter((entry) => entry[1]?.type === 'https' && entry[1]?.api !== false && entry[1]?.uri)
    .map((entry) => entry[1].uri as string)
    .slice(0, 24);
  if (!uris.length) return [{ host: 'api.invidious.io', code: 'NO_API_INSTANCES_LISTED' }];

  return pool(uris, 8, (uri) =>
    attempt(uri, async () => {
      const response = await fetchWithTimeout(`${uri}/api/v1/videos/${videoId}`, {
        timeoutMs: 12_000,
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!response.ok) return { host: uri, code: `HTTP_${response.status}` };
      const body = (await response.json()) as {
        formatStreams?: unknown[];
        adaptiveFormats?: unknown[];
        error?: string;
      };
      const streams = (body.formatStreams?.length ?? 0) + (body.adaptiveFormats?.length ?? 0);
      return { host: uri, code: 'OK', streams, note: body.error?.slice(0, 60) };
    })
  );
}

/* --------------------------------- Piped -------------------------------- */

async function piped(videoId: string): Promise<Trial[]> {
  const list =
    (await json<Array<{ name?: string; api_url?: string }>>('https://piped-instances.kavin.rocks/')) ??
    (await json<Array<{ name?: string; api_url?: string }>>('https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md'));
  const apis = (list ?? [])
    .map((entry) => entry.api_url)
    .filter((url): url is string => Boolean(url?.startsWith('http')))
    .slice(0, 20);
  if (!apis.length) return [{ host: 'piped-instances.kavin.rocks', code: 'INSTANCE_LIST_UNREACHABLE' }];

  return pool(apis, 8, (api) =>
    attempt(api, async () => {
      const response = await fetchWithTimeout(`${api}/streams/${videoId}`, {
        timeoutMs: 12_000,
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!response.ok) return { host: api, code: `HTTP_${response.status}` };
      const body = (await response.json()) as {
        videoStreams?: unknown[];
        audioStreams?: unknown[];
        error?: string;
        message?: string;
      };
      const streams = (body.videoStreams?.length ?? 0) + (body.audioStreams?.length ?? 0);
      return { host: api, code: 'OK', streams, note: (body.error ?? body.message)?.slice(0, 60) };
    })
  );
}

/* --------------------------------- cobalt -------------------------------- */

async function cobalt(videoId: string): Promise<Trial[]> {
  const list = await json<Array<{ api?: string; protocol?: string; version?: string }>>(
    'https://instances.cobalt.best/api/instances.json'
  );
  const apis = (list ?? [])
    .map((entry) => (entry.api ? `${entry.protocol === 'http' ? 'http' : 'https'}://${entry.api}` : undefined))
    .filter((url): url is string => Boolean(url))
    .slice(0, 20);
  if (!apis.length) return [{ host: 'instances.cobalt.best', code: 'INSTANCE_LIST_UNREACHABLE' }];

  return pool(apis, 8, (api) =>
    attempt(api, async () => {
      const response = await fetchWithTimeout(api, {
        method: 'POST',
        timeoutMs: 15_000,
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          videoQuality: '1080',
          filenameStyle: 'basic',
        }),
      });
      const text = await response.text();
      if (!text.trimStart().startsWith('{')) {
        return { host: api, code: `HTTP_${response.status}`, note: text.slice(0, 50) };
      }
      const body = JSON.parse(text) as {
        status?: string;
        url?: string;
        error?: { code?: string };
      };
      return {
        host: api,
        code: `HTTP_${response.status}`,
        streams: body.url ? 1 : 0,
        note: `${body.status ?? '-'}${body.error?.code ? ` ${body.error.code}` : ''}`.slice(0, 60),
      };
    })
  );
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const videoId = params.get('id') || 'dQw4w9WgXcQ';
  const mode = params.get('m') || 'invidious';
  const started = Date.now();

  const trials =
    mode === 'invidious'
      ? await invidious(videoId)
      : mode === 'piped'
        ? await piped(videoId)
        : mode === 'cobalt'
          ? await cobalt(videoId)
          : undefined;

  if (!trials) {
    return NextResponse.json({ error: 'm must be one of: invidious, piped, cobalt' }, { status: 400 });
  }

  return NextResponse.json(
    {
      mode,
      videoId,
      region: process.env.VERCEL_REGION ?? 'local',
      ms: Date.now() - started,
      working: trials.filter((trial) => (trial.streams ?? 0) > 0).map((trial) => trial.host),
      trials,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
