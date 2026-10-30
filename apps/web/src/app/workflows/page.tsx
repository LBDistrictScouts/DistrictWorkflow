import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Workflows" };

export default function Workflows() {
  return <div>
    <header className="page-hero"><div className="container"><p className="eyebrow">Your district workspace</p><h1>District workflows</h1><p>Your next step starts here.</p></div></header>
    <section className="section container" aria-labelledby="available-heading">
      <div className="section-heading"><div><p className="eyebrow">Get things moving</p><h2 id="available-heading">Available workflows</h2></div></div>
      <div className="card-grid"><Link className="card featured-card" href="/workflows/training-fund"><span className="eyebrow">Volunteer development</span><h3>District Training Fund</h3><p>Apply for training support or register an application received from a member. Three district approvers review each application before payment.</p><span className="card-action">Open workflow <span aria-hidden="true">→</span></span></Link></div>
    </section>
  </div>;
}
