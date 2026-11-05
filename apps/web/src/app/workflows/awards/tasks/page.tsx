import Awards from '@/components/awards';

export const metadata = { title: 'Awards · Tasks' };

export default function Page() {
  return <><header className="page-hero"><div className="container"><p className="eyebrow">Awards / Tasks</p><h1>Award tasks</h1><p>Find presentation tasks, reassign them and record completed awards.</p></div></header><div className="section container"><Awards mode="tasks" /></div></>;
}
