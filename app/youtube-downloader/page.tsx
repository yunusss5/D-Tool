import type { Metadata } from 'next';
import { Youtube, Film, Music, ShieldCheck } from 'lucide-react';
import { DownloadForm } from '@/components/download/DownloadForm';

export const metadata: Metadata = {
  title: 'YouTube Downloader - Save Videos in MP4 or Audio | D Tool',
  description:
    'Download YouTube videos as MP4 or pull the audio track out on its own. Paste a link, pick a quality, done. No signup, no popup ads.',
  alternates: { canonical: '/youtube-downloader' },
};

const highlights = [
  {
    icon: Film,
    title: 'Every quality YouTube offers',
    body: 'Everything from 144p to 4K, whatever the upload actually contains, each one a single MP4 with sound.',
  },
  {
    icon: Music,
    title: 'Audio-only downloads',
    body: 'Grab the m4a or webm audio track directly, at the highest bitrate the upload contains.',
  },
  {
    icon: ShieldCheck,
    title: 'Streamed through this server',
    body: 'Files come to you over one connection. No redirect chains and no third-party mirror sites.',
  },
];

export default function YouTubeDownloaderPage() {
  return (
    <div className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/20 mb-4">
            <Youtube className="w-8 h-8 text-youtube" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            YouTube Downloader
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Paste any public YouTube link to save the video as MP4 or keep just the audio.
          </p>
        </div>
      </div>

      <DownloadForm
        platform="youtube"
        heading="Download a YouTube video"
        subheading="Works with regular videos, Shorts and live replays"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {highlights.map((item) => (
            <div key={item.title} className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-3">
                <item.icon className="w-5 h-5 text-youtube" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="card p-6 sm:p-8 mt-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            About the quality options
          </h2>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p>
              YouTube stores anything above 720p as two separate streams: one video-only and one
              audio-only. This tool joins them back together while the file downloads, so every
              option in the list is one playable MP4 with sound — there is nothing to combine
              afterwards. The quality list is built from the streams that particular upload has, so
              an old or low-resolution video will show fewer options than a recent one.
            </p>
            <p>
              Private, members-only and age-restricted uploads cannot be fetched, because they need a
              signed-in YouTube session that this tool deliberately does not hold.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
