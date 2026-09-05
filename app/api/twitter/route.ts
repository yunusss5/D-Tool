import { createPlatformHandler } from '@/lib/platform-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = createPlatformHandler('twitter');
