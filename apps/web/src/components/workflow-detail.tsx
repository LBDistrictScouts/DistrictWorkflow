import Link from 'next/link';

export default function WorkflowDetail({ slug, name, description, summary, unavailable }: { slug: string; name: string; description: string; summary: { total: number; open: number; completed: number; cancelled: number }; unavailable: boolean }) {
  const metrics = [ [slug === 'training-fund' ? 'Applications' : 'Awards', summary.total], ['Open', summary.open], ['Completed', summary.completed], ['Cancelled', summary.cancelled] ];

  return <><header className="page-hero"><div className="container"><p className="eyebrow">Workflow overview</p><h1>{name}</h1><p>{description}</p></div></header>
    <section className="section container"><h2>At a glance</h2><p>{slug === 'training-fund' ? 'Applications across the Training Fund, including completed applications.' : 'Awards you have access to, including completed awards.'}</p>
      {unavailable ? <p role="alert">Metrics are temporarily unavailable. Refresh this page to try again.</p> : <dl className="workflow-metrics">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      <div className="card-grid">{[
        ['form', 'Form', 'Start a new workflow.'], ['definition', 'Definition', 'Explore the state diagram and transition map.'], ['tasks', 'Tasks', 'Search, filter and sort workflow tasks.'],
      ].map(([path, title, text]) => <Link className="card featured-card" key={path} href={`/workflows/${slug}/${path}`}><h3>{title}</h3><p>{text}</p><span className="card-action">Open {title.toLowerCase()} →</span></Link>)}</div>
    </section></>;
}
