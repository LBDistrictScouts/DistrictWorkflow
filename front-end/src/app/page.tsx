import Link from "next/link";

export default function Home() {
  return <div>
    <section className="hero">
      <div className="container hero-inner">
        <p className="eyebrow">Letchworth, Baldock &amp; Ashwell Scouts</p>
        <h1>Making district<br />work <span>flow.</span></h1>
        <p className="hero-description">A home for the tasks that keep Scouting moving.<br className="desktop-break" /> Less admin, more time for what matters.</p>
        <Link className="button hero-button" href="/workflows">Explore workflows <span aria-hidden="true">→</span></Link>
        <div className="hero-detail" aria-hidden="true"><span>Start</span><i /><span>Progress</span><i /><span>Done</span></div>
      </div>
    </section>
    <section className="section container" aria-labelledby="start-heading">
      <div className="section-heading"><div><p className="eyebrow">Your district workspace</p><h2 id="start-heading">Let’s get started.</h2></div><p>Find your next step, with a little<br className="desktop-break" /> guidance along the way.</p></div>
      <div className="card-grid">
        <Link className="card featured-card" href="/workflows"><span className="card-icon" aria-hidden="true">↗</span><span className="eyebrow">Take the next step</span><h3>District workflows</h3><p>Find the workflows available to help you get things done across the district.</p><span className="card-action">Explore workflows <span aria-hidden="true">→</span></span></Link>
        <Link className="card" href="/help"><span className="card-icon" aria-hidden="true">?</span><span className="eyebrow">A helping hand</span><h3>Help &amp; guidance</h3><p>New here? Get to know your workspace and find out what to expect.</p><span className="card-action">Find your way <span aria-hidden="true">→</span></span></Link>
      </div>
      <aside className="welcome-note"><span className="note-icon" aria-hidden="true">i</span><div><h3>A new home for district tasks</h3><p>We’re getting things ready. Available workflows will appear here as they’re introduced.</p></div></aside>
    </section>
  </div>;
}
