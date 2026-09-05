'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Download, Youtube, Instagram, Image, Loader2, X, Copy, Check, AlertCircle, Music, Film } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FormatOption, MediaInfo, Platform } from '@/lib/media';

const platformIcons = {
  youtube: Youtube,
  instagram: Instagram,
  pinterest: Image,
  unknown: Download,
};

const platformNames = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  pinterest: 'Pinterest',
  unknown: 'Unknown',
};

/**
 * Some extractors already name the container in the quality string
 * ("1080×1920 MP4"), so only append it when it is missing.
 */
function formatLabel(format: FormatOption): string {
  const container = format.format.toUpperCase();
  return format.quality.toUpperCase().includes(container)
    ? format.quality
    : `${format.quality} ${container}`;
}

interface DownloadFormProps {
  /** Restrict the form to a single platform (used by the landing pages). */
  platform?: Exclude<Platform, 'unknown'>;
  heading?: string;
  subheading?: string;
}

export function DownloadForm({ platform: locked, heading, subheading }: DownloadFormProps = {}) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<FormatOption | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [copied, setCopied] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>('unknown');

  const detectPlatform = useCallback((inputUrl: string): Platform => {
    if (!inputUrl) return 'unknown';
    const lowerUrl = inputUrl.toLowerCase();
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) return 'instagram';
    if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) return 'pinterest';
    return 'unknown';
  }, []);

  useEffect(() => {
    setDetectedPlatform(detectPlatform(url));
  }, [url, detectPlatform]);

  const isUrlValid = locked ? detectedPlatform === locked : detectedPlatform !== 'unknown';

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch {
      // Silently fail
    }
  };

  const handleClear = () => {
    setUrl('');
    setMediaInfo(null);
    setSelectedFormat(null);
    setError(null);
    setProgress(0);
    setDownloaded(0);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFetch = async () => {
    if (!isUrlValid) {
      setError(
        locked
          ? `Please enter a valid ${platformNames[locked]} URL`
          : 'Please enter a valid YouTube, Instagram, or Pinterest URL'
      );
      return;
    }

    setIsLoading(true);
    setError(null);
    setMediaInfo(null);
    setSelectedFormat(null);

    try {
      const response = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, platform: locked }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch media information');
      }

      setMediaInfo(data);
      if (data.formats && data.formats.length > 0) {
        setSelectedFormat(data.formats[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const filenameFrom = (response: Response, fallback: string) => {
    const header = response.headers.get('content-disposition') ?? '';
    const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (utf8) {
      try {
        return decodeURIComponent(utf8);
      } catch {
        /* fall back to the ascii name */
      }
    }
    return header.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
  };

  const handleDownload = async () => {
    if (!selectedFormat || !mediaInfo) return;

    // Buffering a multi-gigabyte file in a Blob would exhaust the tab, so large
    // files go straight to the browser's own downloader instead.
    if ((selectedFormat.bytes ?? 0) > 200 * 1024 ** 2) {
      const anchor = document.createElement('a');
      anchor.href = selectedFormat.downloadUrl;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }

    setIsDownloading(true);
    setProgress(0);
    setDownloaded(0);
    setError(null);

    try {
      const response = await fetch(selectedFormat.downloadUrl);

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `Download failed (HTTP ${response.status})`);
      }

      const fallbackName = `${
        mediaInfo.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'download'
      }.${selectedFormat.format}`;
      const filename = filenameFrom(response, fallbackName);

      // Merged YouTube streams have no Content-Length — the server sends an
      // estimate instead, and we fall back to a byte counter if there is none.
      const exact = Number(response.headers.get('content-length') ?? 0);
      const total = exact || Number(response.headers.get('x-media-bytes') ?? 0);

      let blob: Blob;
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value as unknown as BlobPart);
          received += value.byteLength;
          setDownloaded(received);
          if (total > 0) setProgress(Math.min(99, Math.round((received / total) * 100)));
        }
        blob = new Blob(chunks, {
          type: response.headers.get('content-type') ?? 'application/octet-stream',
        });
      } else {
        blob = await response.blob();
      }

      setProgress(100);
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 30_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const PlatformIcon =
    platformIcons[detectedPlatform !== 'unknown' ? detectedPlatform : locked ?? 'unknown'];

  const downloadLabel = progress > 0
    ? `Downloading ${progress}%`
    : downloaded > 0
      ? `Downloading ${(downloaded / 1024 ** 2).toFixed(1)} MB`
      : 'Preparing download...';

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="card p-6 sm:p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {heading ?? 'Start Downloading'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {subheading ?? 'Paste a link and get your media in seconds'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <PlatformIcon className="w-5 h-5 text-gray-400" />
              </div>

              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleFetch()}
                placeholder={
                  locked
                    ? `Paste your ${platformNames[locked]} link here...`
                    : 'Paste YouTube, Instagram, or Pinterest link here...'
                }
                className={cn(
                  'w-full pl-12 pr-24 py-4 rounded-xl',
                  'bg-gray-50 dark:bg-gray-800',
                  'border-2 transition-all duration-200',
                  'text-gray-900 dark:text-white placeholder-gray-400',
                  detectedPlatform === 'youtube' && 'border-red-300 dark:border-red-800',
                  detectedPlatform === 'instagram' && 'border-pink-300 dark:border-pink-800',
                  detectedPlatform === 'pinterest' && 'border-red-300 dark:border-red-800',
                  detectedPlatform === 'unknown' && url && 'border-red-300 dark:border-red-700',
                  detectedPlatform === 'unknown' && !url && 'border-gray-200 dark:border-gray-700'
                )}
              />

              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                {url && (
                  <button
                    onClick={handleClear}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {!url && (
                  <button
                    onClick={handlePaste}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                  >
                    Paste
                  </button>
                )}
              </div>
            </div>

            {url && detectedPlatform !== 'unknown' && (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>Detected:</span>
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  detectedPlatform === 'youtube' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
                  detectedPlatform === 'instagram' && 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
                  detectedPlatform === 'pinterest' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                )}>
                  {platformNames[detectedPlatform]}
                </span>
              </div>
            )}

            <button
              onClick={handleFetch}
              disabled={!isUrlValid || isLoading}
              className={cn(
                'w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2',
                isUrlValid && !isLoading ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-400 cursor-not-allowed'
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Fetching...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Get Media Info</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            </div>
          )}

          {mediaInfo && (
            <div className="mt-8 space-y-6 animate-fade-in">
              <div className="flex gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800">
                {mediaInfo.thumbnail && (
                  <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                    <img
                      src={mediaInfo.thumbnail}
                      alt={mediaInfo.title}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 mb-1">
                    {mediaInfo.title}
                  </h3>
                  {mediaInfo.author && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{mediaInfo.author}</p>
                  )}
                  {mediaInfo.duration && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Duration: {mediaInfo.duration}</p>
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">Select Format</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {mediaInfo.formats.map((format) => (
                    <button
                      key={format.id}
                      onClick={() => setSelectedFormat(format)}
                      className={cn(
                        'p-4 rounded-xl border-2 text-left transition-all',
                        selectedFormat?.id === format.id
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-brand-300'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {format.type === 'audio' ? (
                            <Music className="w-5 h-5 text-gray-400" />
                          ) : format.type === 'image' ? (
                            <Image className="w-5 h-5 text-gray-400" />
                          ) : (
                            <Film className="w-5 h-5 text-gray-400" />
                          )}
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {formatLabel(format)}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {format.noAudio ? 'No audio track' : format.fileSize ?? 'Size unknown'}
                            </p>
                          </div>
                        </div>
                        {selectedFormat?.id === format.id && (
                          <Check className="w-5 h-5 text-brand-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleDownload}
                  disabled={!selectedFormat || isDownloading}
                  className={cn(
                    'w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2',
                    selectedFormat && !isDownloading
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-gray-400 cursor-not-allowed'
                  )}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{downloadLabel}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      <span>Download Now</span>
                    </>
                  )}
                </button>

                {isDownloading && (
                  <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full bg-red-600',
                        progress > 0 ? 'transition-all duration-200' : 'animate-pulse'
                      )}
                      style={{ width: `${Math.max(4, progress)}%` }}
                    />
                  </div>
                )}

                <button
                  onClick={handleClear}
                  className="w-full py-3 rounded-xl font-medium text-gray-600 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  Download another
                </button>
              </div>
            </div>
          )}
        </div>

        {!locked && (
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-2">
              <Youtube className="w-4 h-4 text-youtube" />
              YouTube
            </span>
            <span className="flex items-center gap-2">
              <Instagram className="w-4 h-4 text-instagram" />
              Instagram
            </span>
            <span className="flex items-center gap-2">
              <Image className="w-4 h-4 text-pinterest" />
              Pinterest
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
