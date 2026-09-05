'use client';

import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const faqs = [
  {
    question: 'Is D Tool really free to use?',
    answer: 'Yes. There is no account, no fee and no download limit beyond a short-term rate limit that keeps the server responsive. There are no ads, no popups and no redirect chains.',
  },
  {
    question: 'What platforms are supported?',
    answer: 'YouTube (videos and Shorts from 144p to 4K, plus audio-only), Instagram (reels, posts and carousels), Pinterest (pins, video pins and Idea pins), TikTok (videos without the watermark, photo slideshows and the original sound) and X / Twitter (videos, GIFs and photos).',
  },
  {
    question: 'Is it safe to use D Tool?',
    answer: 'You are never asked to log in, and no credentials are involved anywhere in the process. Our server fetches the media and streams it straight through to your browser — nothing is written to disk and no history of what you downloaded is kept. The only thing held in memory is a per-IP request counter used for rate limiting.',
  },
  {
    question: 'What quality options are available?',
    answer: 'For YouTube, every height the video was published at, from 144p up to 4K, plus audio-only M4A or WebM. For the other platforms, every rendition the platform itself publishes is listed — highest first. Where the platform states an exact size, it is shown next to the option instead of a guess.',
  },
  {
    question: 'Can I download private content?',
    answer: 'No. D Tool only reaches content that is public and viewable without logging in. Private accounts, friends-only posts, secret boards and deleted posts return a plain error rather than a file.',
  },
  {
    question: 'How fast are the downloads?',
    answer: 'The file is streamed through as it arrives, with no queue and no re-encoding, so the speed is essentially your own connection. The one exception is a YouTube option above 1080p, where the video and audio tracks are merged on the fly and the file starts a moment later.',
  },
  {
    question: 'Do you support batch downloads?',
    answer: 'One post at a time. A carousel, a photo slideshow or a multi-image pin does list every item separately, so you can save each one without pasting the link again.',
  },
  {
    question: 'Why does a download sometimes fail?',
    answer: 'These platforms change their internal endpoints without notice, and each one also refuses anonymous requests for private or deleted media. If a link that should be public fails, wait a moment and try again — the error message will say what actually went wrong rather than a generic failure.',
  },
  {
    question: 'Why does TikTok return nothing on my network?',
    answer: 'TikTok is blocked outright in some countries and on some networks, including India. When that is the case the request never reaches TikTok, so no downloader can succeed from there — the block sits between the server and TikTok, not in the link you pasted.',
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900/50">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-brand mb-4">
            <HelpCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Find answers to common questions about using D Tool
          </p>
        </div>

        {/* FAQ List */}
        <div className="space-y-4 mb-12">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="card overflow-hidden border border-gray-100 dark:border-gray-800 rounded-xl"
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full p-5 flex items-center justify-between text-left"
                aria-expanded={openIndex === index}
              >
                <span className="font-medium text-gray-900 dark:text-white">
                  {faq.question}
                </span>
                {openIndex === index ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>
              {openIndex === index && (
                <div className="px-5 pb-5 pt-0">
                  <p className="text-gray-600 dark:text-gray-400">
                    {faq.answer}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Still have questions?
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Can&apos;t find the answer you&apos;re looking for? Reach out to our support team.
          </p>
          <a
            href="/contact"
            className="btn-primary inline-flex items-center gap-2"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
