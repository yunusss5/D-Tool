import { useState } from 'react';
import Link from 'next/link';
import { Youtube, Instagram, Image, Music2, Twitter, ChevronDown } from 'lucide-react';

const platforms = [
  {
    name: 'YouTube',
    description: 'Videos, Shorts, MP3 Audio',
    icon: Youtube,
    color: 'text-youtube',
    href: '/youtube-downloader',
  },
  {
    name: 'Instagram',
    description: 'Reels, Posts, Stories',
    icon: Instagram,
    color: 'text-instagram',
    href: '/instagram-downloader',
  },
  {
    name: 'Pinterest',
    description: 'Pins, Images, Videos',
    icon: Image,
    color: 'text-pinterest',
    href: '/pinterest-downloader',
  },
  {
    name: 'TikTok',
    description: 'Videos, Photos, No Watermark',
    icon: Music2,
    color: 'text-tiktok',
    href: '/tiktok-downloader',
  },
  {
    name: 'X (Twitter)',
    description: 'Videos, GIFs, Photos',
    icon: Twitter,
    color: 'text-twitter',
    href: '/x-downloader',
  },
];

export function PlatformCards() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleAccordion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="space-y-3">
          {platforms.map((platform, index) => {
            const isOpen = openIndex === index;
            const Icon = platform.icon;

            return (
              <div
                key={platform.name}
                className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm transition-all"
              >
                <button
                  onClick={() => toggleAccordion(index)}
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
                      <Icon className={`w-6 h-6 ${platform.color}`} />
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {platform.name}
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="p-4 pt-0 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">
                      {platform.description}
                    </p>
                    <Link
                      href={platform.href}
                      className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Visit {platform.name} Downloader
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}