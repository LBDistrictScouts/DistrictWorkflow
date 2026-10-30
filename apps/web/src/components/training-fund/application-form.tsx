'use client';

import { useRef, useState, type SubmitEvent } from 'react';
import type { TrainingFundApplication } from '@district/contracts/training-fund/types';

export default function ApplicationForm({ mode = 'member' }: { mode?: 'member' | 'staff' }) {
  const staff = mode === 'staff';
  const pending = useRef<(TrainingFundApplication & { registration?: { receivedVia: string; receivedAt: string; reference: string } }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reference, setReference] = useState('');
  const [retry, setRetry] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) || '').trim();
    const pence = (key: string) => Math.round(Number(text(key)) * 100);
    if (!pending.current) {
      if (pence('requested') > pence('cost')) { setError('Requested funding cannot exceed the course cost.'); return; }
      pending.current = {
        schemaVersion: '1.0', type: 'district.training-fund.application', applicationId: crypto.randomUUID(), submittedAt: new Date().toISOString(),
        applicant: { name: text('name'), email: text('email'), group: text('group'), role: text('role'), ...(text('membership') ? { membershipNumber: text('membership') } : {}) },
        course: { title: text('title'), provider: text('provider'), startDate: text('startDate'), location: text('location'), costPence: pence('cost') },
        funding: { requestedPence: pence('requested'), reason: text('reason'), benefit: text('benefit'), otherFunding: text('otherFunding') },
        declaration: true,
        ...(staff ? { registration: { receivedVia: text('receivedVia'), receivedAt: text('receivedAt'), reference: text('sourceReference') } } : {}),
      };
    }
    setBusy(true); setError('');
    try {
      const response = await fetch(staff ? '/api/training-fund/registrations' : '/api/training-fund/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current) });
      const result = await response.json();
      if (!response.ok) {
        // A validation/auth failure is definite. Network/5xx failures may have queued the application.
        if (response.status < 500 && !retry) { pending.current = null; setRetry(false); }
        else setRetry(true);
        setError(result.error || 'Unable to submit your application');
        return;
      }
      setReference(result.applicationId);
    } catch (failure) {
      if (pending.current) setRetry(true);
      setError(failure instanceof Error ? failure.message : 'Unable to submit your application');
    } finally { setBusy(false); }
  }

  if (reference) return <div className="empty-state" role="status"><p className="eyebrow">Application received</p><h2>{staff ? 'Application registered.' : 'Thank you for investing in your skills.'}</h2><p>The application has been queued for review. All three reviewers must approve before it goes to the district treasurer.</p><p>Your reference: <strong className="application-reference">{reference}</strong></p></div>;

  return <form className="fund-form" onSubmit={submit}>
    {staff && <fieldset disabled={busy || retry}><legend>Application source</legend><div className="fund-fields">
      <label>Received via<select name="receivedVia" required defaultValue="email"><option value="email">Email</option><option value="phone">Phone</option><option value="post">Post</option><option value="other">Other</option></select></label>
      <label>Date received<input name="receivedAt" type="date" required max={new Date().toISOString().slice(0, 10)} /></label>
    </div><label>Source reference<textarea name="sourceReference" required maxLength={500} rows={2} placeholder="For example, email subject and date or correspondence reference" /></label><p className="fund-hint">Keep the original correspondence in your usual records. Do not paste bank details or the full email here.</p></fieldset>}
    <fieldset disabled={busy || retry}><legend>{staff ? 'Applicant details' : 'About you'}</legend><div className="fund-fields">
      <label>Full name<input name="name" autoComplete={staff ? "off" : "name"} required maxLength={200} /></label>
      <label>Email address<input name="email" type="email" autoComplete={staff ? "off" : "email"} required maxLength={254} /></label>
      <label>Group or district team<input name="group" required maxLength={200} /></label>
      <label>Scouting role<input name="role" required maxLength={200} /></label>
      <label>Membership number <span>(optional)</span><input name="membership" maxLength={30} pattern="[A-Za-z0-9-]+" /></label>
    </div></fieldset>
    <fieldset disabled={busy || retry}><legend>Your training</legend><div className="fund-fields">
      <label>Course or qualification<input name="title" required maxLength={200} /></label>
      <label>Training provider<input name="provider" required maxLength={200} /></label>
      <label>Course start date<input name="startDate" type="date" required /></label>
      <label>Location or online platform<input name="location" required maxLength={200} /></label>
      <label>Total course cost (£)<input name="cost" type="number" min="0.01" max="100000" step="0.01" required /></label>
      <label>Funding requested (£)<input name="requested" type="number" min="0.01" max="100000" step="0.01" required /></label>
    </div></fieldset>
    <fieldset disabled={busy || retry}><legend>How will the funding help?</legend>
      <label>Why are you applying for funding?<textarea name="reason" rows={4} required maxLength={4000} /></label>
      <label>How will this training benefit local Scouting?<textarea name="benefit" rows={4} required maxLength={4000} /></label>
      <label>Other funding applied for or received <span>(optional)</span><textarea name="otherFunding" rows={3} maxLength={2000} /></label>
      <label className="fund-declaration"><input type="checkbox" required />{staff ? 'I confirm that this accurately records the application received and that the applicant has agreed to their details being shared with the district reviewers and treasurer.' : 'I confirm that the information is accurate and may be shared with the district reviewers and treasurer to process this application.'}</label>
    </fieldset>
    <p className="fund-hint">Do not include bank details. The treasurer will arrange payment separately once the application is approved.</p>
    {error && <p className="fund-error" role="alert">{error}</p>}
    {retry && <p role="status">We could not confirm receipt. Retry this same application below so it keeps the same reference. Please keep this page open.</p>}
    <button className="button" disabled={busy} type="submit">{busy ? 'Submitting…' : retry ? 'Retry submission' : staff ? 'Register application' : 'Submit application'} <span aria-hidden="true">→</span></button>
  </form>;
}
