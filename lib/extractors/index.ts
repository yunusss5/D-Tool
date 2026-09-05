import { detectPlatform, ExtractError, type MediaInfo, type Platform } from '@/lib/media';
import { extractYouTube } from '@/lib/extractors/youtube';
import { extractInstagram } from '@/lib/extractors/instagram';
import { extractPinterest } from '@/lib/extractors/pinterest';
import { extractTikTok } from '@/lib/extractors/tiktok';
import { extractTwitter } from '@/lib/extractors/twitter';

export { extractYouTube, extractInstagram, extractPinterest, extractTikTok, extractTwitter };

const SUPPORTED: Record<Exclude<Platform, 'unknown'>, (url: string) => Promise<MediaInfo>> = {
  youtube: extractYouTube,
  instagram: extractInstagram,
  pinterest: extractPinterest,
  tiktok: extractTikTok,
  twitter: extractTwitter,
};

const PLATFORM_NAMES: Record<Exclude<Platform, 'unknown'>, string> = {
  youtube: 'a YouTube',
  instagram: 'an Instagram',
  pinterest: 'a Pinterest',
  tiktok: 'a TikTok',
  twitter: 'an X (Twitter)',
};

/** Normalise loose user input into something URL-shaped. */
export function normalizeInput(input: string): string {
  const trimmed = (input || '').trim().replace(/^["'<]+|["'>]+$/g, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

export async function extractMedia(rawInput: string, expected?: Platform): Promise<MediaInfo> {
  const url = normalizeInput(rawInput);
  if (!url) throw new ExtractError('Paste a link first.', 400);

  if (url.length > 2048) throw new ExtractError('That link is too long to be valid.', 400);

  const platform = detectPlatform(url);
  if (platform === 'unknown') {
    throw new ExtractError(
      'Only YouTube, Instagram, Pinterest, TikTok and X (Twitter) links are supported right now.',
      400
    );
  }
  if (expected && expected !== 'unknown' && platform !== expected) {
    throw new ExtractError(`That is not ${PLATFORM_NAMES[expected]} link.`, 400);
  }

  return SUPPORTED[platform](url);
}
