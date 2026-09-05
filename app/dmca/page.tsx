import { Metadata } from 'next';
import { Shield, Mail, FileText } from 'lucide-react';

export const metadata: Metadata = {
  title: 'DMCA - D Tool',
  description: 'DMCA Takedown Policy for D Tool.',
};

export default function DMCAPage() {
  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-brand mb-4">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            DMCA Takedown Policy
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            We respect intellectual property rights and comply with DMCA
          </p>
        </div>

        {/* Content */}
        <div className="card p-8 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-500" />
              Digital Millennium Copyright Act Notice
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              D Tool respects the intellectual property rights of others and expects its users to do the same. It is our policy to respond to clear notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (&quot;DMCA&quot;).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              How to Submit a DMCA Takedown Notice
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              If you believe that your copyrighted work has been copied in a way that constitutes copyright infringement, please provide our designated Copyright Agent with a written notice that includes the following:
            </p>
            <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
              <li>An electronic or physical signature of the person authorized to act on behalf of the owner of the copyright interest</li>
              <li>A description of the copyrighted work that you claim has been infringed</li>
              <li>A description of where the infringing material is located on our service</li>
              <li>Your address, telephone number, and email address</li>
              <li>A statement by you that you have a good faith belief that the disputed use is not authorized by the copyright owner</li>
              <li>A statement by you, under penalty of perjury, that the above information in your notice is accurate and that you are the copyright owner</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Contact Information
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-3">
              Please send your DMCA takedown notices to our Copyright Agent at:
            </p>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <p className="text-gray-600 dark:text-gray-400">
                <strong className="text-gray-900 dark:text-white">Email:</strong> dmca@dtool.example.com
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Response Time
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              We will investigate notices of alleged copyright infringement and take appropriate actions under the DMCA. We aim to respond to all valid DMCA notices within 24-48 business hours.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Counter-Notification
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              If you believe that your content that was removed (or to which access was disabled) is not infringing, or that you have the authorization from the copyright owner, you may send a counter-notice containing the following information:
            </p>
            <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2 mt-3">
              <li>Your physical or electronic signature</li>
              <li>Identification of the content that has been removed or to which access has been disabled</li>
              <li>A statement under penalty of perjury that you have a good faith belief that the content was removed due to mistake or misidentification</li>
              <li>Your name, address, and telephone number</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Important Note
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Please note that under Section 512(f) of the DMCA, any person who knowingly materially misrepresents that material or activity is infringing may be held liable. Please ensure that you are the copyright owner or authorized to act on behalf of the owner before submitting a takedown notice.
            </p>
          </section>
        </div>

        {/* Contact CTA */}
        <div className="mt-8 card p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            For other inquiries, please visit our contact page.
          </p>
          <a
            href="/contact"
            className="btn-primary inline-flex items-center gap-2"
          >
            <Mail className="w-5 h-5" />
            Contact Us
          </a>
        </div>
      </div>
    </div>
  );
}
