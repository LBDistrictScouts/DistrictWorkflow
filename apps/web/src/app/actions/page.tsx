import { verifyUserSession } from '@/lib/current-user';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionCookie } from '@/lib/cognito';
import { trainingFundActions } from '@district/integrations/training-fund/gateway';

export const metadata: Metadata = { title: 'Actions', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function ActionsPage() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) redirect('/sign-in');
  const identity = await verifyUserSession(token).catch(() => null);
  if (!identity) redirect('/sign-in');
  const email = identity.email_verified === true && typeof identity.email === 'string' ? identity.email.trim() : '';
  let actions: Awaited<ReturnType<typeof trainingFundActions>> = [];
  let unavailable = false;
  if (email) {
    try { actions = await trainingFundActions(email); }
    catch { unavailable = true; }
  }

  return <div>
    <header className="page-hero"><div className="container"><p className="eyebrow">Your district workspace</p><h1>Actions</h1><p>Workflow tasks waiting for you.</p></div></header>
    <section className="section container" aria-labelledby="actions-heading">
      <div className="section-heading"><div><p className="eyebrow">Your next steps</p><h2 id="actions-heading">Available actions</h2></div><a className="text-link" href="/actions">Refresh actions</a></div>
      {!email ? <div className="empty-state"><h3>Verified email required</h3><p>Your account needs a verified email address to match workflow assignments. Contact the district administrator to check your account.</p></div>
        : unavailable ? <div className="empty-state" role="alert"><h3>Actions are temporarily unavailable</h3><p>We couldn’t load your tasks. Please refresh to try again.</p></div>
        : actions.length === 0 ? <div className="empty-state"><h3>You’re all caught up</h3><p>There are no workflow tasks waiting for you. Tasks appear here when they are assigned to your account’s email address.</p></div>
        : <div className="card-grid">{actions.map(action => <a key={action.id} className="card featured-card" href={action.href}>
          <span className="eyebrow">District Training Fund</span><h3>{action.title}</h3><p>{action.applicant} · {action.course}</p><p>Submitted {new Date(action.submittedAt).toLocaleDateString('en-GB')}</p><span className="card-action">Open task <span aria-hidden="true">→</span></span>
        </a>)}</div>}
    </section>
  </div>;
}
