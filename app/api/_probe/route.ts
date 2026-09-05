/**
 * TEMPORARY diagnostic. Answers one question that cannot be answered locally:
 * which InnerTube front door, identity and client combination this *deployment's*
 * address is allowed to use. Delete once the answer is known.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UA_WEB =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const UA_VR = 'com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12; GB) gzip';
const UA_VISION = 'com.google.ios.youtubevisionos/0.1 (RealityDevice14,1; U; CPU visionOS 1.3 like Mac OS X)';

/** Minted on a residential connection, hardcoded to see whether provenance matters. */
const RESIDENTIAL = 'CgtSbFJhNEpIV0tzVSjvvfDUBjIKCgJJThIEGgAgDw%3D%3D';

const KEY_WEB = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const KEY_ANDROID = 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w';

const VISIONOS = {
  clientName: 'VISIONOS',
  clientVersion: '0.1',
  deviceMake: 'Apple',
  deviceModel: 'RealityDevice14,1',
  osName: 'visionOS',
  osVersion: '1.3.21O771',
  hl: 'en',
  gl: 'US',
};
const ANDROID_VR = {
  clientName: 'ANDROID_VR',
  clientVersion: '1.61.48',
  deviceMake: 'Oculus',
  deviceModel: 'Quest 3',
  osName: 'Android',
  osVersion: '12',
  androidSdkVersion: 32,
  hl: 'en',
  gl: 'US',
};
const ANDROID = {
  clientName: 'ANDROID',
  clientVersion: '19.44.38',
  androidSdkVersion: 30,
  osName: 'Android',
  osVersion: '11',
  hl: 'en',
  gl: 'US',
};
const TVHTML5 = {
  clientName: 'TVHTML5',
  clientVersion: '7.20250101.10.00',
  clientScreen: 'WATCH',
  hl: 'en',
  gl: 'US',
};

const IDS: Record<string, number> = { VISIONOS: 101, ANDROID_VR: 28, ANDROID: 3, TVHTML5: 7 };

async function mint(): Promise<string | undefined> {
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA_WEB },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20240726.00.00', hl: 'en', gl: 'US' } },
      }),
    });
    const j = (await r.json()) as { responseContext?: { visitorData?: string } };
    return j?.responseContext?.visitorData;
  } catch {
    return undefined;
  }
}

interface Row {
  label: string;
  http: number | string;
  status: string;
  reason?: string;
  formats: number;
  plain: number;
  cipher: number;
}

async function probe(
  label: string,
  host: 'www' | 'api',
  client: Record<string, unknown>,
  visitor: string | undefined,
  ua: string,
  key?: string,
  videoId = 'aqz-KE-bpKQ'
): Promise<Row> {
  const base =
    host === 'www'
      ? 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false'
      : `https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false${key ? `&key=${key}` : ''}`;
  const name = String(client.clientName);
  try {
    const r = await fetch(base, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': ua,
        'X-YouTube-Client-Name': String(IDS[name] ?? 1),
        'X-YouTube-Client-Version': String(client.clientVersion),
        Origin: 'https://www.youtube.com',
        Accept: '*/*',
        ...(visitor ? { 'X-Goog-Visitor-Id': visitor } : {}),
      },
      body: JSON.stringify({
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
        context: {
          client: { ...client, ...(visitor ? { visitorData: visitor } : {}) },
          user: { lockedSafetyMode: false },
          request: { useSsl: true, internalExperimentFlags: [] },
        },
        playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } },
      }),
    });
    const text = await r.text();
    const j = text.trimStart().startsWith('{') ? JSON.parse(text) : {};
    const f = [...(j?.streamingData?.formats ?? []), ...(j?.streamingData?.adaptiveFormats ?? [])];
    return {
      label,
      http: r.status,
      status: String(j?.playabilityStatus?.status ?? '-'),
      reason: j?.playabilityStatus?.reason ?? j?.error?.message,
      formats: f.length,
      plain: f.filter((x: { url?: string }) => x.url).length,
      cipher: f.filter((x: { url?: string; signatureCipher?: string }) => !x.url && x.signatureCipher).length,
    };
  } catch (error) {
    return {
      label,
      http: 'threw',
      status: error instanceof Error ? error.message.slice(0, 80) : 'error',
      formats: 0,
      plain: 0,
      cipher: 0,
    };
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || 'aqz-KE-bpKQ';
  const minted = await mint();

  const rows = await Promise.all([
    probe('www+VISIONOS+minted', 'www', VISIONOS, minted, UA_VISION, undefined, id),
    probe('www+VISIONOS+residential', 'www', VISIONOS, RESIDENTIAL, UA_VISION, undefined, id),
    probe('www+VISIONOS+none', 'www', VISIONOS, undefined, UA_VISION, undefined, id),
    probe('api+VISIONOS+minted', 'api', VISIONOS, minted, UA_VISION, KEY_WEB, id),
    probe('api+VISIONOS+residential', 'api', VISIONOS, RESIDENTIAL, UA_VISION, KEY_WEB, id),
    probe('www+ANDROID_VR+residential', 'www', ANDROID_VR, RESIDENTIAL, UA_VR, undefined, id),
    probe('api+ANDROID_VR+minted', 'api', ANDROID_VR, minted, UA_VR, KEY_ANDROID, id),
    probe('api+ANDROID+minted', 'api', ANDROID, minted, UA_VR, KEY_ANDROID, id),
    probe('www+TVHTML5+minted', 'www', TVHTML5, minted, UA_WEB, undefined, id),
  ]);

  return NextResponse.json(
    { id, region: process.env.VERCEL_REGION ?? 'local', mint: minted ? 'ok' : 'refused', rows },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
