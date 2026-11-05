import Awards from '@/components/awards';

export const metadata = { title: 'Awards · Form' };

export default function Page() {
  return <><header className="page-hero"><div className="container"><p className="eyebrow">Awards / Form</p><h1>Import awards</h1><p>Start a workflow from a CSV or Excel file.</p></div></header><div className="section container"><Awards mode="form" /></div></>;
}
