import TrainingFundFlow from '@/components/training-fund/flow';

export const metadata = { title: 'Training Fund · Definition' };

export default function Page() {
  return <><header className="page-hero"><div className="container"><p className="eyebrow">Training Fund / Definition</p><h1>Training Fund definition</h1><p>Explore the process and its transitions.</p></div></header><div className="section container"><TrainingFundFlow /></div></>;
}
