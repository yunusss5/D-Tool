'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTheme } from '@/components/providers/ThemeProvider';
import { Sun, Moon, Monitor, Download, Menu, X } from 'lucide-react';

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'YouTube', href: '/youtube-downloader' },
  { name: 'Instagram', href: '/instagram-downloader' },
  { name: 'Pinterest', href: '/pinterest-downloader' },
  { name: 'TikTok', href: '/tiktok-downloader' },
  { name: 'X', href: '/x-downloader' },
  { name: 'How to Use', href: '/how-to-use' },
  { name: 'FAQ', href: '/faq' },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  const themeIcon = {
    light: <Sun className="w-5 h-5" />,
    dark: <Moon className="w-5 h-5" />,
    system: <Monitor className="w-5 h-5" />,
  }[theme];

  const cycleTheme = () => {
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <header className="sticky top-0 z-50 glass border-b border-gray-200 dark:border-gray-800">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 gradient-brand rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-glow transition-shadow">
              <Download className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text">
              D Tool
            </span>
          </Link>

          {/* Desktop Navigation — eight links need lg to sit on one row */}
          <div className="hidden lg:flex items-center gap-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={cycleTheme}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle theme"
            >
              {themeIcon}
            </button>

            {/* Mobile menu button */}
            <button
              className="lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-gray-200 dark:border-gray-800 animate-fade-in">
            <div className="flex flex-col gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
