/**
 * TEMPORARY diagnostic: what each platform's upstream returns from *this*
 * deployment's address, as opposed to a developer laptop. Delete once read.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WEB_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const APP_UA =
  'com.zhiliaoapp.musically/2023009040 (Linux; U; Android 13; en_US; Pixel 7; Build/TQ3A.230805.001; Cronet/58.0.2991.0)';

interface Row {
  label: string;
  http: number | string;
  bytes: number;
  marker: string;
}

async function look(
  label: string,
  url: string,
  headers: Record<string, string>,
  markers: Array<[string, string]>
): Promise<Row> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);
  try {
    const r = await fetch(url, { cache: 'no-store', redirect: 'follow', headers, signal: ac.signal });
    const text = await r.text();
    const hit = markers.filter(([, needle]) => text.includes(needle)).map(([name]) => name);
    return {
      label,
      http: r.status,
      bytes: text.length,
      marker: hit.length ? hit.join(',') : text.slice(0, 60).replace(/\s+/g, ' '),
    };
  } catch (error) {
    return {
      label,
      http: 'threw',
      bytes: 0,
      marker: error instanceof Error ? `${error.name}: ${error.message.slice(0, 60)}` : 'error',
    };
  } finally {
    clearTimeout(timer);
  }
}

const APP_QUERY = new URLSearchParams({
  aweme_id: '7676560717960465678',
  version_code: '300904',
  version_name: '30.9.4',
  app_name: 'musical_ly',
  channel: 'googleplay',
  device_platform: 'android',
  device_type: 'Pixel 7',
  os_version: '13',
  iid: '7318518857994389254',
  device_id: '7318518857994389254',
  aid: '1233',
  region: 'US',
  app_language: 'en',
  language: 'en',
}).toString();

export async function GET(request: NextRequest) {
  const tweet = request.nextUrl.searchParams.get('tweet') || '20';
  const igCode = request.nextUrl.searchParams.get('ig') || 'C8YQ0000000';

  const rows = await Promise.all([
    look(
      'tiktok app api22',
      `https://api22-normal-c-useast2a.tiktokv.com/aweme/v1/feed/?${APP_QUERY}`,
      { 'User-Agent': APP_UA, Accept: 'application/json' },
      [
        ['aweme_list', '"aweme_list"'],
        ['play_addr', '"play_addr"'],
        ['captcha', 'verify'],
      ]
    ),
    look(
      'tiktok app api16',
      `https://api16-normal-c-useast1a.tiktokv.com/aweme/v1/feed/?${APP_QUERY}`,
      { 'User-Agent': APP_UA, Accept: 'application/json' },
      [
        ['aweme_list', '"aweme_list"'],
        ['play_addr', '"play_addr"'],
      ]
    ),
    look(
      'tiktok web page',
      'https://www.tiktok.com/@nasa/video/7676560717960465678',
      {
        'User-Agent': WEB_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.tiktok.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
      [
        ['rehydration blob', '__UNIVERSAL_DATA_FOR_REHYDRATION__'],
        ['playAddr', '"playAddr"'],
        ['captcha wall', 'captcha'],
      ]
    ),
    look(
      'x syndication',
      `https://cdn.syndication.twimg.com/tweet-result?id=${tweet}&token=a&lang=en`,
      { Accept: 'application/json', Referer: 'https://platform.twitter.com/', 'User-Agent': WEB_UA },
      [
        ['tweet json', '"__typename"'],
        ['video', 'video_info'],
      ]
    ),
    look(
      'instagram page',
      `https://www.instagram.com/p/${igCode}/`,
      {
        'User-Agent': WEB_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      [
        ['lsd token', '"LSD",[],{"token"'],
        ['login wall', 'loginForm'],
        ['csrf', 'csrf_token'],
      ]
    ),
  ]);

  return NextResponse.json(
    { region: process.env.VERCEL_REGION ?? 'local', rows },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
