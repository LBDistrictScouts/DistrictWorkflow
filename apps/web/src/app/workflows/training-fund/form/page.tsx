import Link from 'next/link';
import ApplicationForm from '@/components/training-fund/application-form';
import { authenticatedRegistrar, memberAuthenticated } from '@/lib/training-fund-server';

export const metadata = { title: 'Training Fund · Form' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const memberMode = (await searchParams).mode === 'member';
  const staff = await authenticatedRegistrar().catch(() => null);
  const member = memberMode && await memberAuthenticated().catch(() => false);

  return <><header className="page-hero"><div className="container"><p className="eyebrow">Training Fund / Form</p><h1>{memberMode ? 'Apply for training support' : 'Register an application'}</h1><p>Start a Training Fund application.</p></div></header><section className="section container guide">
    <p>{memberMode ? 'Tell us about your training and the funding you need.' : 'Record an application received by email, phone, post or another route.'} Two of three reviewers must approve before payment.</p>
    <p><Link className="text-link" href={memberMode ? '/workflows/training-fund/form' : '/workflows/training-fund/form?mode=member'}>{memberMode ? 'Register an application for someone else →' : 'Apply through your members account →'}</Link></p>
    {memberMode ? member ? <ApplicationForm /> : <p>Open this form through the signed-in members website to apply.</p> : staff ? <><p>Registering as {staff.name}.</p><ApplicationForm mode="staff" /></> : <p>Sign in with application registration permission to start this workflow.</p>}
  </section></>;
}
