import type { MetadataRoute } from 'next';

/** Same resolution order as the metadataBase in app/layout.tsx. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Nothing under /api is a page, and crawling it would burn rate limit.
      disallow: '/api/',
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
