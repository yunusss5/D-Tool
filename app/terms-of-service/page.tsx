import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - D Tool',
  description: 'Terms of Service for D Tool - The multi-platform downloader.',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Terms of Service
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            Last updated: September 2024
          </p>
        </div>

        {/* Content */}
        <div className="prose dark:prose-invert max-w-none">
          <div className="card p-8 space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Acceptance of Terms
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                By accessing and using D Tool (&quot;the Service&quot;), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by these terms, please do not use this Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Description of Service
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                D Tool is a web-based tool that allows users to download publicly available content from YouTube, Instagram, Pinterest, TikTok and X (Twitter). The Service acts as an intermediary between users and the content platforms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Acceptable Use
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree NOT to:
              </p>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
                <li>Download content that you do not have the right to download</li>
                <li>Use the Service for any illegal or unauthorized purpose</li>
                <li>Violate any laws in your jurisdiction regarding copyright</li>
                <li>Attempt to gain unauthorized access to any systems or networks</li>
                <li>Use automated scripts or bots without permission</li>
                <li>Redistribute or resell the Service</li>
                <li>Upload viruses or malicious code</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Intellectual Property
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                The Service and its original content, features, and functionality are owned by D Tool and are protected by international copyright, trademark, and other intellectual property laws. You retain all rights to the content you download.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                User Responsibility
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                <strong>You are solely responsible for:</strong> Ensuring that you have the right to download any content; complying with all applicable laws and regulations; and any consequences that may arise from your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Service Availability
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                We strive to keep the Service available 24/7, but we do not guarantee uninterrupted access. The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Limitation of Liability
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                To the fullest extent permitted by law, D Tool shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses resulting from your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Indemnification
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                You agree to defend, indemnify, and hold harmless D Tool and its affiliates, licensors, and service providers from any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees arising out of or relating to your violation of these Terms or your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Modifications to Terms
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                We reserve the right to modify these Terms at any time. We will notify users of significant changes by posting the updated Terms on this page. Your continued use of the Service after any modifications indicates your acceptance of the updated Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Governing Law
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which D Tool operates, without regard to its conflict of law provisions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Contact Information
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                If you have any questions about these Terms of Service, please contact us at legal@dtool.example.com.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
