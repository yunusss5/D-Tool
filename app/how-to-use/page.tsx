import { Metadata } from 'next';
import { Download, Search, Check, Smartphone, Monitor, ArrowRight, Copy, Image as ImageIcon } from 'lucide-react';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'How to Use - D Tool',
  description: 'Learn how to use D Tool to download videos and images from YouTube, Instagram, and Pinterest.',
};

const steps = [
  {
    number: '01',
    title: 'Copy the Link',
    description: 'Go to YouTube, Instagram, or Pinterest and find the video, reel, or image you want to download. Copy the link from your browser\'s address bar.',
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
                  <span>Pro Tip: {index === 0 ? 'For Instagram Stories, make sure they\'re public' : index === 1 ? 'Our tool works with shortened URLs too' : index === 2 ? 'Higher quality = larger file size' : index === 3 ? 'Downloads happen directly from your browser' : 'You can use D Tool on mobile devices too'}</span>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
                <Monitor className="w-5 h-5 text-youtube" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">YouTube</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                For YouTube Shorts, use the "Share" button to get the direct link. Our tool supports 4K downloads when available.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="w-10 h-10 rounded-xl bg-pink-100 dark:bg-pink-900/20 flex items-center justify-center mb-4">
                <Smartphone className="w-5 h-5 text-instagram" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Instagram</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Works with public posts only. For Stories, make sure they're visible to everyone (not just your followers).
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/20 flex items-center justify-center mb-4">
                <ImageIcon className="w-5 h-5 text-pinterest" />
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Pinterest</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Supports both individual pins and entire boards. For videos, look for the play icon on the pin.
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
