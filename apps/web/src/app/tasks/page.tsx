import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Training Fund task', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default function TaskPage() {
  return <div><header className="page-hero"><div className="container"><p className="eyebrow">District Training Fund</p><h1>A little support goes a long way.</h1><p>Review your assigned task and help someone take their next step.</p></div></header><section className="section container guide"><p>Open a task from Actions or your personal task link. It will appear in the task dialog.</p></section></div>;
}
