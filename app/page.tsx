'use client';

import { useState, useEffect } from 'react';
import { HeroSection } from '@/components/home/HeroSection';
import { FeaturesSection } from '@/components/home/FeaturesSection';
import { PlatformsSection } from '@/components/home/PlatformsSection';
import { DownloadForm } from '@/components/download/DownloadForm';
import { PlatformCards } from '@/components/home/PlatformCards';
import { TestimonialsSection } from '@/components/home/TestimonialsSection';

export default function Home() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <div className="relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-brand-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-4 w-96 h-96 bg-rose-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl" />
      </div>

      <HeroSection />
      <PlatformCards />
      <DownloadForm />
      <FeaturesSection />
      <PlatformsSection />
      <TestimonialsSection />
    </div>
  );
}
