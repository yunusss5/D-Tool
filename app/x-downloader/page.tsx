import type { Metadata } from 'next';
import { Twitter, Film, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import { DownloadForm } from '@/components/download/DownloadForm';

export const metadata: Metadata = {
  title: 'X (Twitter) Video Downloader - Save Videos and GIFs | D Tool',
  description:
    'Download videos, GIFs and full-resolution photos from X (Twitter). Works with x.com, twitter.com and t.co links, no login required.',
  alternates: { canonical: '/x-downloader' },
};

const highlights = [
  {
    icon: Film,
    title: 'Every quality',
    body: 'All MP4 renditions X publishes are listed, from the smallest mobile copy up to the original.',
  },
  {
    icon: ImageIcon,
    title: 'Photos at full size',
    body: 'Images are upgraded from the sized preview in the timeline to the original upload.',
  },
  {
    icon: ShieldCheck,
    title: 'No login, no API key',
    body: 'Nothing is posted from your account, and no token is ever asked for.',
  },
];

export default function XDownloaderPage() {
  return (
    <div className="min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-100 dark:bg-sky-900/20 mb-4">
            <Twitter className="w-8 h-8 text-twitter" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            X (Twitter) Downloader
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Save a video, GIF or photo from any public post on X, at the best quality the post
            carries.
          </p>
        </div>
      </div>

      <DownloadForm
        platform="twitter"
        heading="Download from X (Twitter)"
        subheading="Paste an x.com/user/status/... , twitter.com or t.co link"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {highlights.map((item) => (
            <div key={item.title} className="card p-6">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/20 flex items-center justify-center mb-3">
                <item.icon className="w-5 h-5 text-twitter" />
              </div>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="card p-6 sm:p-8 mt-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            Posts, threads and protected accounts
          </h2>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Paste the link to the single post that holds the media. Old <code>twitter.com</code>{' '}
              links and shortened <code>t.co</code> links both work — they are resolved before the
              lookup runs.
            </p>
            <p>
              A thread is a chain of separate posts, so copy the link of the specific post you want
              rather than the first one.
            </p>
            <p>
              Protected accounts and deleted posts return nothing. X does not serve them to an
              anonymous request, and there is no way around that without your credentials, which this
              tool never asks for.
            </p>
            <p>
              Keep downloads for personal use and credit the original poster if you share the file
              elsewhere.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
