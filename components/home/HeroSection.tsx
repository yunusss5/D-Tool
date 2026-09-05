import { Zap, Shield, Smartphone } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 text-sm font-medium mb-8 animate-fade-in">
          <Zap className="w-4 h-4" />
          <span>100% Free & No Signup Required</span>
        </div>

        {/* Main heading */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 dark:text-white mb-6 animate-slide-up">
          Download Anything,{' '}
          <span className="bg-gradient-to-r from-brand-500 to-rose-500 bg-clip-text text-transparent">
            From Anywhere
          </span>
        </h1>

        {/* Subheading */}
        <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          YouTube, Instagram, Pinterest, TikTok, X — paste a link, pick your format, download
          instantly. No clutter, no signup, no popup spam.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
            <Zap className="w-4 h-4 text-yellow-500" />
            <span>Lightning Fast</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
            <Shield className="w-4 h-4 text-green-500" />
            <span>Safe & Secure</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
            <Smartphone className="w-4 h-4 text-blue-500" />
            <span>Mobile Friendly</span>
          </div>
        </div>
      </div>
    </section>
  );
}
