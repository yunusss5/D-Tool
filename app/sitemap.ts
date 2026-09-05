import type { MetadataRoute } from 'next';

/** Same resolution order as the metadataBase in app/layout.tsx. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

const landing = [
  '/youtube-downloader',
  '/instagram-downloader',
  '/pinterest-downloader',
  '/tiktok-downloader',
  '/x-downloader',
];

const support = ['/how-to-use', '/faq', '/contact'];

const legal = ['/privacy-policy', '/terms-of-service', '/dmca'];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    { url: siteUrl, lastModified, changeFrequency: 'weekly', priority: 1 },
    ...landing.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...support.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...legal.map((path) => ({
      url: `${siteUrl}${path}`,
      lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
