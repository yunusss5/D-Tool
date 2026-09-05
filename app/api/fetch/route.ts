import { NextRequest, NextResponse } from 'next/server';
import { ExtractError, type Platform } from '@/lib/media';
import { extractMedia } from '@/lib/extractors';
import { clientKey, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function POST(request: NextRequest) {
  const limit = rateLimit(`fetch:${clientKey(request)}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { ...CORS, 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  let body: { url?: string; platform?: Platform };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Send a JSON body with a "url" field.' }, {
      status: 400,
      headers: CORS,
    });
  }

  if (!body?.url || typeof body.url !== 'string') {
    return NextResponse.json({ error: 'Paste a link first.' }, { status: 400, headers: CORS });
  }

  try {
    const media = await extractMedia(body.url, body.platform);
    return NextResponse.json(media, { headers: CORS });
  } catch (error) {
    if (error instanceof ExtractError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: CORS });
    }
    console.error('[api/fetch] unexpected failure:', error);
    return NextResponse.json(
      { error: 'Could not read that link. Please check it and try again.' },
      { status: 500, headers: CORS }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
