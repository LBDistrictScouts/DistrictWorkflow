import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Help & guidance" };

export default function Help() {
  return <div>
    <header className="page-hero"><div className="container"><p className="eyebrow">A helping hand</p><h1>Help &amp; guidance</h1><p>A few things to know before you get started.</p></div></header>
    <section className="section container guide" aria-labelledby="guide-heading">
      <p className="eyebrow">Start here</p><h2 id="guide-heading">Welcome to District Workflow.</h2><p className="guide-intro">This is the new home for guided district tasks at Letchworth, Baldock &amp; Ashwell Scouts.</p>
      <div className="guide-step"><span>01</span><div><h3>Find a workflow</h3><p>The workflows page is where you’ll find available district processes. There are no workflows available in this initial version.</p><Link className="text-link" href="/workflows">Go to workflows →</Link></div></div>
      <div className="guide-step"><span>02</span><div><h3>Make yourself at home</h3><p>Use the navigation to move between pages. The colour theme button in the header switches between light and dark mode, and remembers your preference on this device.</p></div></div>
      <div className="guide-step"><span>03</span><div><h3>More to come</h3><p>Starting tasks, submitting information and tracking progress will become available as district workflows are added.</p></div></div>
    </section>
  </div>;
}
