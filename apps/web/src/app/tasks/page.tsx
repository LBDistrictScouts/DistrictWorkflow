import type { Metadata } from 'next';
import TaskPanel from '@/components/training-fund/task-panel';
export const metadata: Metadata = { title: 'Training Fund task', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function TaskPage() {
  return <div><header className="page-hero"><div className="container"><p className="eyebrow">District Training Fund</p><h1>A little support goes a long way.</h1><p>Review your assigned task and help someone take their next step.</p></div></header><section className="section container guide"><TaskPanel /></section></div>;
}
