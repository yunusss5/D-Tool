import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - D Tool',
  description: 'Privacy Policy for D Tool - Learn how we handle your data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Privacy Policy
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
                Introduction
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                At D Tool (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), we take your privacy seriously. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our website and services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Information We Collect
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                We collect minimal information to provide our services:
              </p>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
                <li><strong>URLs you submit:</strong> When you use our downloader, you provide us with the URLs of the content you wish to download.</li>
                <li><strong>Usage data:</strong> We may collect basic analytics about how our service is used, such as pages visited and features used.</li>
                <li><strong>Device information:</strong> Basic device information like browser type and operating system may be collected automatically.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                How We Use Your Information
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-3">
                We use the collected information to:
              </p>
              <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
                <li>Provide and maintain our downloader service</li>
                <li>Process your download requests</li>
                <li>Improve our website and services</li>
                <li>Respond to your questions and support requests</li>
                <li>Monitor the usage of our service to detect and prevent abuse</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Data Retention
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                We do not store the URLs you submit or the files you download. All processing happens in real-time and temporary files are deleted immediately after the download is complete.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Cookies
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                We may use essential cookies to remember your preferences (such as theme settings). We do not use tracking or advertising cookies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Third-Party Services
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Our service fetches content directly from third-party platforms (YouTube, Instagram, Pinterest). We are not responsible for the privacy practices of these platforms. We recommend reviewing their privacy policies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Data Security
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                We implement appropriate security measures to protect your information. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Your Rights
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Depending on your location, you may have certain rights regarding your personal information, including the right to access, correct, or delete your data. To exercise these rights, please contact us.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Children&apos;s Privacy
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Our service is not intended for children under 13 years of age. We do not knowingly collect information from children under 13.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Changes to This Policy
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the &quot;Last updated&quot; date.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Contact Us
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                If you have any questions about this Privacy Policy, please contact us at privacy@dtool.example.com.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
