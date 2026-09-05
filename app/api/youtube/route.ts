import { NextRequest, NextResponse } from 'next/server';
import { createPlatformHandler } from '@/lib/platform-route';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { innertubeDiagnostics } from '@/lib/youtube-innertube';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = createPlatformHandler('youtube');

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * `GET /api/youtube?id=<videoId>` — what InnerTube tells *this* host.
 *
 * YouTube decides whether to challenge a caller partly on the address it comes
 * from, so a deployment can fail where a laptop succeeds and the code is not the
 * difference. This reports the playability status each client returned and
 * whether its URLs read past the proof-of-origin wall, which is what turns
 * "YouTube is challenging this server" into something actionable. It exposes
 * statuses and counts only — no media URLs, no cookie, no visitor id.
 */
export async function GET(request: NextRequest) {
  const limit = rateLimit(`youtube-status:${clientKey(request)}`, 6, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
    );
  }

  const id = request.nextUrl.searchParams.get('id') ?? 'dQw4w9WgXcQ';
  if (!VIDEO_ID.test(id)) {
    return NextResponse.json({ error: 'Pass an 11-character YouTube video id.' }, { status: 400 });
  }

  return NextResponse.json(await innertubeDiagnostics(id), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
