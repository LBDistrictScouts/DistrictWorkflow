import type { Metadata } from 'next';
import Link from 'next/link';
import ApplicationForm from '@/components/training-fund/application-form';
import { memberAuthenticated } from '@/lib/training-fund-server';

export const metadata: Metadata = { title: 'District Training Fund' };
export const dynamic = 'force-dynamic';
export default async function TrainingFundPage() {
  let authenticated = false;
  try { authenticated = await memberAuthenticated(); } catch { /* Render the unavailable/sign-in state. */ }
  return <div><header className="page-hero"><div className="container"><p className="eyebrow">Investing in our volunteers</p><h1>District Training Fund</h1><p>Support for the skills that make a difference.</p></div></header>
    <section className="section container guide">
      <aside className="welcome-note registration-entry"><div><h3>Registering for someone else?</h3><p>Workflow staff can record an application received by email, phone, post or another route.</p><Link className="text-link" href="/workflows/training-fund/register">Register an application →</Link></div></aside>
      <h2>Apply for training support.</h2><p className="guide-intro">Tell us about your training and the funding you need. Three district reviewers will consider your application before the treasurer arranges payment.</p>
      {authenticated ? <ApplicationForm /> : <div className="welcome-note"><div><h3>Members access required</h3><p>Please open this application through the signed-in members website. If you are already signed in, member access may not yet be configured for this service.</p></div></div>}
    </section></div>;
}
