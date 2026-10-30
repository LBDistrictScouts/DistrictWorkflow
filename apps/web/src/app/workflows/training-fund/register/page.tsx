import type { Metadata } from 'next';
import ApplicationForm from '@/components/training-fund/application-form';
import { authenticatedRegistrar } from '@/lib/training-fund-server';

export const metadata: Metadata = { title: 'Register a Training Fund application', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function RegisterApplicationPage() {
  let staff = null;
  try { staff = await authenticatedRegistrar(); } catch { /* Fail closed when the session service is unavailable. */ }
  return <div><header className="page-hero"><div className="container"><p className="eyebrow">Workflow staff</p><h1>Register an application</h1><p>Record a Training Fund application received outside the members website.</p></div></header>
    <section className="section container guide">
      {staff ? <><h2>District Training Fund</h2><p className="guide-intro">Registering as {staff.name}. Enter the applicant’s details and the source of their application. All three reviewers must still approve before payment.</p><ApplicationForm mode="staff" /></> : <div className="welcome-note"><div><h2>Staff access required</h2><p>Sign in to the workflow platform with application registration permission. If you are already signed in, contact the platform administrator to check your access.</p></div></div>}
    </section></div>;
}
