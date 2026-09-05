'use client';

import Link from 'next/link';
import { Youtube, Instagram, Image } from 'lucide-react';

const platforms = [
  {
    name: 'YouTube',
    description: 'Videos, Shorts, MP3 Audio',
    icon: Youtube,
    color: 'hover:text-youtube',
    href: '/youtube-downloader',
    gradient: 'from-red-500/10 to-red-500/5',
    borderColor: 'hover:border-youtube/30',
  },
  {
    name: 'Instagram',
    description: 'Reels, Posts, Stories',
    icon: Instagram,
    color: 'hover:text-instagram',
    href: '/instagram-downloader',
    gradient: 'from-pink-500/10 to-pink-500/5',
    borderColor: 'hover:border-instagram/30',
  },
  {
    name: 'Pinterest',
    description: 'Pins, Images, Videos',
    icon: Image,
    color: 'hover:text-pinterest',
    href: '/pinterest-downloader',
    gradient: 'from-red-600/10 to-red-600/5',
    borderColor: 'hover:border-pinterest/30',
  },
];

export function PlatformCards() {
  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {platforms.map((platform) => (
            <Link
              key={platform.name}
              href={platform.href}
              className={`group relative p-6 rounded-2xl bg-gradient-to-br ${platform.gradient} border border-transparent ${platform.borderColor} transition-all duration-300 hover:shadow-lg hover:scale-[1.02]`}
            >
              <div className="flex flex-col items-center text-center gap-3">
                <div className={`p-3 rounded-xl bg-gray-100 dark:bg-gray-800 transition-transform group-hover:scale-110`}>
                  <platform.icon className={`w-8 h-8 text-gray-600 dark:text-gray-400 ${platform.color}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{platform.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{platform.description}</p>
                </div>
              </div>
              {/* Hover arrow */}
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
