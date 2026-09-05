'use client';

import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const faqs = [
  {
    question: 'Is D Tool really free to use?',
    answer: 'Yes! D Tool is completely free to use with no hidden fees. You can download as many videos and images as you want without creating an account or paying anything.',
  },
  {
    question: 'What platforms are supported?',
    answer: 'Currently, D Tool supports YouTube (videos, shorts, and audio extraction), Instagram (reels, posts, stories, and IGTV), and Pinterest (pins and images). We\'re working on adding more platforms.',
  },
  {
    question: 'Is it safe to use D Tool?',
    answer: 'Absolutely! We don\'t store any of your data or personal information. All processing happens in your browser, and we don\'t log any download requests. Our service is ad-supported but completely transparent about how we operate.',
  },
  {
    question: 'What video quality options are available?',
    answer: 'For YouTube, we offer multiple resolutions from 144p up to 4K for videos, and 128kbps to 320kbps for audio. Instagram supports HD quality for reels and posts. Pinterest offers original quality downloads for pins and images.',
  },
  {
    question: 'Can I download private content?',
    answer: 'No. D Tool only works with public content that is accessible without authentication. Attempting to download private content will result in an error.',
  },
  {
    question: 'How fast are the downloads?',
    answer: 'Our servers are optimized for speed, and most downloads start within 2-3 seconds. Actual speed depends on your internet connection and the file size.',
  },
  {
    question: 'Do you support batch downloads?',
    answer: 'Currently, D Tool supports single file downloads. Batch download functionality is planned for our premium tier which will be available later this year.',
  },
  {
    question: 'Why does the Instagram downloader sometimes fail?',
    answer: 'Instagram frequently changes its platform structure, which can temporarily break our downloader. Our team monitors these changes and updates the service within 24 hours of any disruption.',
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
