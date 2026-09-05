import type { Metadata } from 'next';
import { Instagram, Film, Image as ImageIcon, Layers } from 'lucide-react';
import { DownloadForm } from '@/components/download/DownloadForm';

export const metadata: Metadata = {
  title: 'Instagram Downloader - Reels, Posts and IGTV | D Tool',
  description:
    'Download Instagram reels, photo posts, carousels and IGTV videos in their original quality. Paste the link and save the file - no login required.',
  alternates: { canonical: '/instagram-downloader' },
};

const highlights = [
  {
    icon: Film,
    title: 'Reels and IGTV',
    body: 'Saves the original MP4 that Instagram serves, not a re-encoded screen capture.',
  },
  {
    icon: ImageIcon,
    title: 'Full-resolution photos',
    body: 'Photo posts come down at the display resolution Instagram stores, not a thumbnail.',
  },
  {
    icon: Layers,
    title: 'Carousels, item by item',
    body: 'Multi-photo posts list every slide separately so you can pick exactly what you need.',
  },
];

export default function InstagramDownloaderPage() {
  return (
    <div className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-pink-100 dark:bg-pink-900/20 mb-4">
            <Instagram className="w-8 h-8 text-instagram" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Instagram Downloader
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Save reels, posts, carousels and IGTV videos from public Instagram accounts.
          </p>
        </div>
      </div>

      <DownloadForm
        platform="instagram"
        heading="Download Instagram media"
        subheading="Paste a /reel/, /p/ or /tv/ link from a public account"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {highlights.map((item) => (
            <div key={item.title} className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center mb-3">
                <item.icon className="w-5 h-5 text-instagram" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="card p-6 sm:p-8 mt-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            What will not work, and why
          </h2>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Private accounts, close-friends stories and anything behind a follow request need your
              Instagram credentials. This tool never asks for them, so that content is out of reach
              by design.
            </p>
            <p>
              Instagram also rate-limits servers that request a lot of media in a short window. If a
              link fails, wait a minute and try again before assuming the post is gone.
            </p>
            <p>
              Download other people&apos;s work for personal use only, and get permission before you
              republish it.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
