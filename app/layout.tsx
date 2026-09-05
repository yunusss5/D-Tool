import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'D Tool - Download Anything, From Anywhere',
  description: 'Free, fast, and clean multi-platform downloader for YouTube, Instagram, and more. No signup required.',
  keywords: ['video downloader', 'YouTube downloader', 'Instagram downloader', 'MP4 converter', 'MP3 converter'],
  authors: [{ name: 'D Tool' }],
  openGraph: {
    title: 'D Tool - Download Anything, From Anywhere',
    description: 'Free, fast, and clean multi-platform downloader for YouTube, Instagram, and more.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
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
