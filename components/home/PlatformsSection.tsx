import { Check, Youtube, Instagram, Image } from 'lucide-react';

const platforms = [
  {
    name: 'YouTube',
    icon: Youtube,
    color: 'text-youtube',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    features: [
      'Video downloads (MP4)',
      'Audio extraction (MP3)',
      '4K/1080p quality options',
      'Shorts support',
      'Thumbnail extraction',
    ],
  },
  {
    name: 'Instagram',
    icon: Instagram,
    color: 'text-instagram',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20',
    features: [
      'Reels downloads',
      'Post/carousel downloads',
      'Story downloads',
      'IGTV support',
      'High quality output',
    ],
  },
  {
    name: 'Pinterest',
    icon: Image,
    color: 'text-pinterest',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    features: [
      'Pin downloads',
      'Board saving',
      'Video pins support',
      'Image format options',
      'Multiple pin sizes',
    ],
  },
];

export function PlatformsSection() {
  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Supported Platforms
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            We support the most popular platforms and keep our downloaders updated.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {platforms.map((platform) => (
            <div
              key={platform.name}
              className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden"
            >
              {/* Header */}
              <div className={`${platform.bgColor} p-6`}>
                <div className="flex items-center gap-3">
                  <platform.icon className={`w-8 h-8 ${platform.color}`} />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{platform.name}</h3>
                </div>
              </div>

              {/* Features */}
              <div className="p-6">
                <ul className="space-y-3">
                  {platform.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className={`w-5 h-5 ${platform.color} flex-shrink-0 mt-0.5`} />
                      <span className="text-gray-700 dark:text-gray-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
