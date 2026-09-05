import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

const inter = Inter({ subsets: ['latin'] });

/**
 * Canonical URLs on the landing pages are relative, so they need a base. Vercel
 * exposes the deployment host at build time; fall back to localhost in dev.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'D Tool - Download Anything, From Anywhere',
  description:
    'Free, fast, and clean multi-platform downloader for YouTube, Instagram, Pinterest, TikTok and X (Twitter). No signup required.',
  keywords: [
    'video downloader',
    'YouTube downloader',
    'Instagram downloader',
    'Pinterest downloader',
    'TikTok downloader',
    'Twitter video downloader',
    'MP4 converter',
    'MP3 converter',
  ],
  authors: [{ name: 'D Tool' }],
  openGraph: {
    title: 'D Tool - Download Anything, From Anywhere',
    description:
      'Free, fast, and clean multi-platform downloader for YouTube, Instagram, Pinterest, TikTok and X (Twitter).',
    type: 'website',
  },
};

/**
 * Runs synchronously before the first paint so a dark-mode visitor never sees a
 * white flash while ThemeProvider's effects are still pending.
 */
const themeBootstrap = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <ThemeProvider>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-grow">
              {children}
            </main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
