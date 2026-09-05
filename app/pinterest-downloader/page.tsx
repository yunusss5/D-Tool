import type { Metadata } from 'next';
import { Image as ImageIcon, Film, Maximize2, Download } from 'lucide-react';
import { DownloadForm } from '@/components/download/DownloadForm';

export const metadata: Metadata = {
  title: 'Pinterest Downloader - Save Pins and Video Pins | D Tool',
  description:
    'Download Pinterest pins at original resolution and save video pins as MP4. Works with pinterest.com links and pin.it short links.',
  alternates: { canonical: '/pinterest-downloader' },
};

const highlights = [
  {
    icon: Maximize2,
    title: 'Original resolution',
    body: 'Pins are upgraded from the sized preview Pinterest shows to the full /originals/ file.',
  },
  {
    icon: Film,
    title: 'Video pins as MP4',
    body: 'Idea pins and video pins are offered as a real MP4 rather than an HLS playlist.',
  },
  {
    icon: Download,
    title: 'pin.it links included',
    body: 'Short links are resolved to the underlying pin before the media is looked up.',
  },
];

export default function PinterestDownloaderPage() {
  return (
    <div className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/20 mb-4">
            <ImageIcon className="w-8 h-8 text-pinterest" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Pinterest Downloader
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Save any public pin as a full-resolution image, or pull a video pin down as MP4.
          </p>
        </div>
      </div>

      <DownloadForm
        platform="pinterest"
        heading="Download a Pinterest pin"
        subheading="Paste a pinterest.com/pin/... or pin.it link"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {highlights.map((item) => (
            <div key={item.title} className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-3">
                <item.icon className="w-5 h-5 text-pinterest" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="card p-6 sm:p-8 mt-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Pins, boards and secret boards
          </h2>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Paste the link to a single pin. Board URLs contain dozens of pins with no single file to
              hand back, so open the pin you want and copy that link instead.
            </p>
            <p>
              Secret boards and deleted pins return nothing, because Pinterest will not serve them to
              an anonymous request.
            </p>
            <p>
              Most pins are someone else&apos;s photography or artwork. Keep downloads for personal
              reference and credit the creator if you share them.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
