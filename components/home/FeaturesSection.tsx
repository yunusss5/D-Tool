import { Zap, Shield, Smartphone, Download, Ban, Clock, FileType, Globe } from 'lucide-react';

const features = [
  {
    icon: Zap,
    title: 'Lightning Fast',
    description: 'Optimized servers ensure your downloads start in seconds, not minutes.',
  },
  {
    icon: Shield,
    title: 'Safe & Secure',
    description: 'No malware, no ads, no tracking. Your privacy is our priority.',
  },
  {
    icon: Smartphone,
    title: 'Mobile Friendly',
    description: 'Works perfectly on any device — phone, tablet, or desktop.',
  },
  {
    icon: Download,
    title: 'Multiple Formats',
    description: 'Download in MP4, MP3, or original quality — your choice.',
  },
  {
    icon: Ban,
    title: 'No Signup',
    description: 'Start downloading immediately. No account, no email, no hassle.',
  },
  {
    icon: Clock,
    title: 'Always Available',
    description: '24/7 service with 99.9% uptime. Download anytime you want.',
  },
  {
    icon: FileType,
    title: 'HD Quality',
    description: 'Preserve the original quality of your media files.',
  },
  {
    icon: Globe,
    title: 'Global Access',
    description: 'Available worldwide. No geographic restrictions.',
  },
];

export function FeaturesSection() {
  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Why Choose D Tool?
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            We built the downloader we wished existed — fast, clean, and actually enjoyable to use.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="group p-6 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:border-brand-500/30 transition-all duration-300 hover:shadow-lg"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="w-12 h-12 rounded-xl gradient-brand flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
