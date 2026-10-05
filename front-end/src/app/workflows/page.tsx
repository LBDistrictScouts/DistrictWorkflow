import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Workflows" };

export default function Workflows() {
  return <div>
    <header className="page-hero"><div className="container"><p className="eyebrow">Your district workspace</p><h1>District workflows</h1><p>Your next step starts here.</p></div></header>
    <section className="section container" aria-labelledby="available-heading">
      <div className="section-heading"><div><p className="eyebrow">Get things moving</p><h2 id="available-heading">Available workflows</h2></div></div>
      <div className="empty-state"><span className="empty-icon" aria-hidden="true">↗</span><h3>No workflows available yet</h3><p>Once district workflows are introduced, you’ll be able to find them here.</p><Link className="button" href="/help">Read the getting started guide <span aria-hidden="true">→</span></Link></div>
    </section>
  </div>;
}
