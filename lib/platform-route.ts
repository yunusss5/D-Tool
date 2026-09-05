import { NextRequest, NextResponse } from 'next/server';
import { ExtractError, type Platform } from '@/lib/media';
import { extractMedia } from '@/lib/extractors';
import { clientKey, rateLimit } from '@/lib/rate-limit';

/**
 * The per-platform endpoints (/api/youtube, /api/instagram, /api/pinterest) are
 * thin aliases over the same extractors /api/fetch uses, so every entry point
 * returns an identical MediaInfo payload.
 */
export function createPlatformHandler(platform: Exclude<Platform, 'unknown'>) {
  return async function POST(request: NextRequest) {
    const limit = rateLimit(`${platform}:${clientKey(request)}`, 20, 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${limit.retryAfterSeconds}s.` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    let url: unknown;
    try {
      ({ url } = await request.json());
    } catch {
      return NextResponse.json({ error: 'Send a JSON body with a "url" field.' }, { status: 400 });
    }

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Paste a link first.' }, { status: 400 });
    }

    try {
      return NextResponse.json(await extractMedia(url, platform));
    } catch (error) {
      if (error instanceof ExtractError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      console.error(`[api/${platform}] unexpected failure:`, error);
      return NextResponse.json(
        { error: 'Could not read that link. Please check it and try again.' },
        { status: 500 }
      );
    }
  };
}
