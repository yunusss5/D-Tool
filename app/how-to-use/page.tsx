import { Metadata } from 'next';
import {
  Download,
  Search,
  Smartphone,
  Monitor,
  ArrowRight,
  Copy,
  Image as ImageIcon,
  Music2,
  Twitter,
} from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How to Use - D Tool',
  description:
    'Learn how to use D Tool to download videos and images from YouTube, Instagram, Pinterest, TikTok and X (Twitter).',
};

const steps = [
  {
    number: '01',
    title: 'Copy the Link',
    description:
      'Open YouTube, Instagram, Pinterest, TikTok or X and find the video, reel, pin or photo you want. Copy the link from the address bar or the app\'s Share sheet.',
    icon: Copy,
  },
  {
    number: '02',
    title: 'Paste the URL',
    description: 'Return to D Tool and paste the link into the input box. We\'ll automatically detect which platform you\'re using.',
    icon: Search,
  },
  {
    number: '03',
    title: 'Choose Format',
    description: 'Select your preferred format and quality. We offer multiple options for each platform to suit your needs.',
    icon: Download,
  },
  {
    number: '04',
    title: 'Download Instantly',
    description: 'Click the download button and your file will start downloading immediately. No waiting, no redirects.',
    icon: Download,
  },
  {
    number: '05',
    title: 'Repeat as Needed',
    description: 'Use the "Download Another" button to quickly start a new download without reloading the page.',
    icon: ArrowRight,
  },
];

export default function HowToUsePage() {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-brand mb-4">
            <Smartphone className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            How to Use D Tool
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Follow these simple steps to download content from your favorite platforms
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-12 mb-16">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col md:flex-row items-start gap-6">
              <div className="flex-shrink-0 w-16 h-16 rounded-2xl gradient-brand flex items-center justify-center text-white text-2xl font-bold">
                {step.number}
              </div>
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  {step.title}
                </h2>
                <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
                  {step.description}
                </p>
                <div className="flex items-center text-brand-500">
                  <step.icon className="w-5 h-5 mr-2" />
                  <span>Pro Tip: {index === 0 ? 'Public posts only — private accounts and deleted posts cannot be fetched' : index === 1 ? 'Short links work too: youtu.be, pin.it, vm.tiktok.com and t.co' : index === 2 ? 'Higher quality = larger file size' : index === 3 ? 'Downloads happen directly from your browser' : 'You can use D Tool on mobile devices too'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Platform Specifics */}
        <div className="card p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Platform-Specific Tips
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
                <Monitor className="w-5 h-5 text-youtube" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">YouTube</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Shorts, youtu.be links and full watch URLs all work. Heights above 1080p are stored
                without sound, so those options are merged back with the audio for you.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center mb-4">
                <Smartphone className="w-5 h-5 text-instagram" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Instagram</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Reels, single posts and carousels from public accounts. Every slide of a carousel is
                offered separately.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
                <ImageIcon className="w-5 h-5 text-pinterest" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Pinterest</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Paste a single pin, not a board — a board holds dozens of pins with no one file to
                hand back. Images come down at original resolution.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/20 flex items-center justify-center mb-4">
                <Music2 className="w-5 h-5 text-tiktok" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">TikTok</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Videos come without the watermark whenever TikTok serves a clean render. Photo posts
                hand back every slide, plus the original sound as MP3.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/20 flex items-center justify-center mb-4">
                <Twitter className="w-5 h-5 text-twitter" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">X (Twitter)</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Copy the link of the exact post holding the media — a thread is a chain of separate
                posts. Old twitter.com and t.co links are resolved automatically.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Ready to get started?</p>
          <Link href="/" className="btn-primary inline-flex items-center gap-2">
            <Download className="w-5 h-5" />
            Start Downloading
          </Link>
        </div>
      </div>
    </div>
  );
}
