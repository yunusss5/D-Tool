import { Metadata } from 'next';
import FAQPage from './FAQClient';

export const metadata: Metadata = {
  title: 'FAQ - D Tool',
  description: 'Frequently asked questions about D Tool - the multi-platform downloader.',
};

export default function Page() {
  return <FAQPage />;
}
