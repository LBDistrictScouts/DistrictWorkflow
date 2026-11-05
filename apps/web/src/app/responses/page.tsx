import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Your response', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default function ResponsePage() {
  return <section className="section container guide"><h1>Your response</h1><p>Open your personal task link to view the response form.</p></section>;
}
