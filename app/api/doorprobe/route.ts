/**
 * Temporary measurement route — delete once the question below is settled.
 *
 * Question: on a host YouTube distrusts, is a visitor identity effectively
 * single-use? The deployed diagnostics showed VISIONOS answering with 23 formats
 * on the first ask and LOGIN_REQUIRED on every ask after it, which is what a
 * burned identity looks like. If that is what is happening, asking four clients
 * in parallel under one shared id wastes three of the four.
 *
 * Statuses, counts and identity *origins* only. No media URLs, no cookie, no
 * visitor value.
 */
import { NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PLAYER = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
const VISITOR = 'https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false';
const ORIGIN = 'https://www.youtube.com';

interface Probe {
  id: number;
  name: string;
  ua: string;
  ctx: Record<string, unknown>;
}

const CLIENTS: Probe[] = [
  {
    id: 101,
    name: 'VISIONOS',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    ctx: {
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
    id: 28,
    name: 'ANDROID_VR',
    ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    ctx: {
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
  {
    id: 5,
    name: 'IOS',
    ua: 'com.google.ios.youtube/21.26.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
    ctx: {
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
  },
  {
    id: 3,
    name: 'ANDROID',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14; en_US; Pixel 8) gzip',
    ctx: {
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
  },
];

/** A visitor id straight from YouTube, or `undefined` when the mint is refused. */
async function mint(): Promise<string | undefined> {
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
    return json.responseContext?.visitorData;
  } catch {
    return undefined;
  }
}

interface Answer {
  client: string;
  status: string;
  formats: number;
  reason?: string;
}

async function ask(client: Probe, videoId: string, visitor: string | undefined): Promise<Answer> {
  const body = {
    videoId,
    context: {
      client: visitor ? { ...client.ctx, visitorData: visitor } : client.ctx,
      user: { lockedSafetyMode: false },
      request: { useSsl: true, internalExperimentFlags: [] },
    },
    playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
    contentCheckOk: true,
    racyCheckOk: true,
  };

  try {
    const response = await fetchWithTimeout(PLAYER, {
      method: 'POST',
      timeoutMs: 20_000,
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': client.ua,
        'X-YouTube-Client-Name': String(client.id),
        'X-YouTube-Client-Version': String(client.ctx.clientVersion),
        Origin: ORIGIN,
        Accept: '*/*',
        ...(visitor ? { 'X-Goog-Visitor-Id': visitor } : {}),
      },
    });
    if (!response.ok) {
      return { client: client.name, status: `HTTP_${response.status}`, formats: 0 };
    }
    const json = (await response.json()) as {
      playabilityStatus?: { status?: string; reason?: string };
      streamingData?: { formats?: unknown[]; adaptiveFormats?: unknown[] };
    };
    const formats =
      (json.streamingData?.formats?.length ?? 0) + (json.streamingData?.adaptiveFormats?.length ?? 0);
    return {
      client: client.name,
      status: json.playabilityStatus?.status ?? 'NO_STATUS',
      formats,
      reason: json.playabilityStatus?.reason?.slice(0, 70),
    };
  } catch (error) {
    return { client: client.name, status: `THREW_${(error as Error).name}`, formats: 0 };
  }
}

const VISIONOS = CLIENTS[0];

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const videoId = params.get('id') || 'dQw4w9WgXcQ';
  const mode = params.get('m') || 'shared';
  const started = Date.now();
  const out: Record<string, unknown> = { mode, videoId, region: process.env.VERCEL_REGION ?? 'local' };

  if (mode === 'mint') {
    // Does this address get real ids at all, and does it keep getting them?
    const mints: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const id = await mint();
      mints.push(id ? `ok/len${id.length}` : 'refused');
    }
    out.mints = mints;
  } else if (mode === 'shared') {
    // Today's behaviour: one identity, four clients at once.
    const visitor = await mint();
    out.visitor = visitor ? 'minted' : 'refused';
    out.answers = await Promise.all(CLIENTS.map((client) => ask(client, videoId, visitor)));
  } else if (mode === 'fresh') {
    // One identity per client, asked one at a time.
    const answers: Answer[] = [];
    for (const client of CLIENTS) {
      const visitor = await mint();
      const answer = await ask(client, videoId, visitor);
      answers.push({ ...answer, client: `${answer.client}${visitor ? '' : '(no-id)'}` });
    }
    out.answers = answers;
  } else if (mode === 'reuse' || mode === 'rotate') {
    // Is one identity good for one ask, or for many? Same client either way.
    const shared = mode === 'reuse' ? await mint() : undefined;
    const answers: Answer[] = [];
    for (let i = 0; i < 6; i += 1) {
      const visitor = mode === 'reuse' ? shared : await mint();
      answers.push({ ...(await ask(VISIONOS, videoId, visitor)), client: `#${i + 1}${visitor ? '' : '(no-id)'}` });
    }
    out.answers = answers;
  } else {
    out.error = 'm must be one of: mint, shared, fresh, reuse, rotate';
  }

  out.ms = Date.now() - started;
  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
