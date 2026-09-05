import type { Metadata } from 'next';
import { Music2, Droplet, Images, Music } from 'lucide-react';
import { DownloadForm } from '@/components/download/DownloadForm';

export const metadata: Metadata = {
  title: 'TikTok Downloader - Save Videos Without Watermark | D Tool',
  description:
    'Download TikTok videos without the watermark, grab photo slideshows and save the original sound. Works with tiktok.com links and vm.tiktok.com short links.',
  alternates: { canonical: '/tiktok-downloader' },
};

const highlights = [
  {
    icon: Droplet,
    title: 'No watermark',
    body: 'The clean render TikTok serves to its own app is preferred over the stamped copy.',
  },
  {
    icon: Images,
    title: 'Photo slideshows',
    body: 'Photo posts hand back every slide as a separate full-resolution image.',
  },
  {
    icon: Music,
    title: 'Original sound',
    body: 'When the post carries a track, the audio is offered as a standalone MP3.',
  },
];

export default function TikTokDownloaderPage() {
  return (
    <div className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyan-100 dark:bg-cyan-900/20 mb-4">
            <Music2 className="w-8 h-8 text-tiktok" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            TikTok Downloader
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Save any public TikTok as a clean MP4 with no watermark, or pull every slide out of a
            photo post.
          </p>
        </div>
      </div>

      <DownloadForm
        platform="tiktok"
        heading="Download a TikTok"
        subheading="Paste a tiktok.com/@user/video/... or vm.tiktok.com link"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {highlights.map((item) => (
            <div key={item.title} className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/20 flex items-center justify-center mb-3">
                <item.icon className="w-5 h-5 text-tiktok" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="card p-6 sm:p-8 mt-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            What works and what does not
          </h2>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Any public video or photo post works, including short <code>vm.tiktok.com</code> and{' '}
              <code>vt.tiktok.com</code> links. Paste the link to a single post — profile URLs hold
              hundreds of videos with no single file to hand back.
            </p>
            <p>
              Private accounts, friends-only posts and deleted videos return nothing, because TikTok
              will not serve them to an anonymous request.
            </p>
            <p>
              TikTok is unavailable on some networks and in some countries. If the lookup times out
              on every attempt, the block is between the server and TikTok rather than in the link
              you pasted.
            </p>
            <p>
              Downloads are for personal use. The video and its soundtrack still belong to their
              creator, so credit them if you repost.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
