'use client';

import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import type { TaskAction, TaskView } from '@district/contracts/training-fund/types';

const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);

export default function TaskPanel() {
  const tokenRef = useRef('');
  const [token, setToken] = useState('');
  const [view, setView] = useState<TaskView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(taskToken: string, command: TaskAction): Promise<TaskView> {
    const response = await fetch('/api/training-fund/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: taskToken, command }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Unable to open this task');
    return body;
  }
  useEffect(() => {
    let active = true;
    let requestNumber = 0;
    function openTask(taskToken: string) {
      if (!taskToken) return;
      tokenRef.current = taskToken;
      // Keep the capability in memory, out of the address bar and browser storage.
      window.history.replaceState(null, '', window.location.pathname);
      const currentRequest = ++requestNumber;
      load(taskToken, { action: 'view' }).then(result => {
        if (active && currentRequest === requestNumber) {
          setToken(taskToken); setView(result); setError(''); setMessage('');
        }
      }).catch(failure => {
        if (active && currentRequest === requestNumber) {
          setToken(taskToken); setView(null);
          setError(failure instanceof Error ? failure.message : 'Unable to open this task');
        }
      });
    }
    const fromHash = () => new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    const onHashChange = () => openTask(fromHash());
    openTask(fromHash() || tokenRef.current);
    window.addEventListener('hashchange', onHashChange);
    return () => { active = false; window.removeEventListener('hashchange', onHashChange); };
  }, []);

  async function act(command: TaskAction) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await load(token, command);
      if (tokenRef.current !== token) return;
      setView(result);
      if (command.action === 'approve') setMessage('Your approval has been recorded.');
      if (command.action === 'record-payment') setMessage('Payment has been recorded. This application is complete.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to complete this action'); }
    finally { setBusy(false); }
  }

  function pay(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void act({ action: 'record-payment', reference: String(data.get('reference') || ''), paidAt: String(data.get('paidAt') || '') });
  }

  if (!view) return <div className="empty-state"><h2>Your Training Fund task</h2><p>Open your personal email link to review the application. If you have just opened it, the details will appear here shortly.</p>{error && <p className="fund-error" role="alert">{error}</p>}{token && <button className="button" disabled={busy} onClick={() => void act({ action: 'view' })}>Try again</button>}</div>;
  const { state, role, personId } = view;
  const { application } = state;
  const approved = state.approvals.some(approval => approval.personId === personId);
  const person = role === 'approver' ? state.routing.approvers.find(p => p.id === personId) : state.routing.treasurer;
  return <div className="fund-task">
    <p className="eyebrow">{role === 'approver' ? 'Review application' : 'Arrange payment'} · {person?.name}</p>
    <h2>{application.course.title}</h2><p className="guide-intro">{application.applicant.name} · {application.applicant.group}</p>
    <div className="fund-summary"><span>Funding requested<strong>{money(application.funding.requestedPence)}</strong></span><span>Approvals<strong>{state.approvals.length} of {state.routing.approvers.length}</strong></span><span>Status<strong>{state.status === 'paid' ? 'Paid' : state.status === 'awaiting_payment' ? 'Ready for payment' : 'Awaiting approvals'}</strong></span></div>
    <dl className="fund-details">
      <dt>Reference</dt><dd>{application.applicationId}</dd>
      <dt>Application source</dt><dd>{application.submission?.channel === 'staff' ? `Staff registration · ${application.submission.receivedVia}` : application.submission?.channel === 'members' ? 'Members website' : 'External submission (source not recorded)'}</dd>
      {application.submission?.channel === 'staff' && <><dt>Received</dt><dd>{application.submission.receivedAt}</dd><dt>Source reference</dt><dd>{application.submission.reference}</dd><dt>Registered by</dt><dd>{application.submission.registeredBy.name} ({application.submission.registeredBy.id})</dd><dt>Registered at</dt><dd>{new Date(application.submission.registeredAt).toLocaleString('en-GB')}</dd></>}
      <dt>Submitted</dt><dd>{new Date(application.submittedAt).toLocaleString('en-GB')}</dd>
      <dt>Email</dt><dd>{application.applicant.email}</dd>
      <dt>Role</dt><dd>{application.applicant.role}</dd>
      {application.applicant.membershipNumber && <><dt>Membership number</dt><dd>{application.applicant.membershipNumber}</dd></>}
      <dt>Provider</dt><dd>{application.course.provider}</dd><dt>Start date</dt><dd>{application.course.startDate}</dd>
      <dt>Location</dt><dd>{application.course.location}</dd><dt>Course cost</dt><dd>{money(application.course.costPence)}</dd>
      <dt>Reason for applying</dt><dd>{application.funding.reason}</dd><dt>Benefit to Scouting</dt><dd>{application.funding.benefit}</dd>
      <dt>Other funding</dt><dd>{application.funding.otherFunding || 'None stated'}</dd>
      <dt>Declaration</dt><dd>{application.submission?.channel === 'staff' ? 'The registering staff member confirmed that this accurately records the application and that the applicant agreed to sharing their details for processing.' : 'The applicant confirmed the information is accurate and may be shared for processing.'}</dd>
    </dl>
    <h3>Approval progress</h3><ul className="fund-approvals">{state.routing.approvers.map(reviewer => {
      const decision = state.approvals.find(approval => approval.personId === reviewer.id);
      return <li key={reviewer.id}><span>{reviewer.name}</span><strong>{decision ? `Approved · ${new Date(decision.approvedAt).toLocaleDateString('en-GB')}` : 'Awaiting approval'}</strong></li>;
    })}</ul>
    {error && <p className="fund-error" role="alert">{error}</p>}{message && <p className="fund-success" role="status">{message}</p>}
    {role === 'approver' && !approved && state.status === 'awaiting_approvals' && <div className="fund-action"><p>By approving, you confirm your support for the requested {money(application.funding.requestedPence)} of training funding.</p><button className="button" disabled={busy} onClick={() => void act({ action: 'approve' })}>{busy ? 'Recording…' : 'Approve application'}</button></div>}
    {role === 'approver' && approved && <p className="fund-success">You have approved this application.</p>}
    {role === 'treasurer' && state.status === 'awaiting_payment' && <form className="fund-form fund-action" onSubmit={pay}><h3>Record payment</h3><p>Arrange the payment using your usual process, then record it here. This button does not transfer money.</p><div className="fund-fields"><label>Payment reference<input name="reference" required maxLength={200} disabled={busy} /></label><label>Date paid<input name="paidAt" type="date" required max={new Date().toISOString().slice(0, 10)} disabled={busy} /></label></div><button className="button" type="submit" disabled={busy}>{busy ? 'Recording…' : 'Confirm payment made'}</button></form>}
    {state.payment && <div className="welcome-note"><div><h3>Payment recorded</h3><p>{state.payment.paidAt} · {state.payment.reference}</p></div></div>}
    <button className="text-link fund-refresh" disabled={busy} onClick={() => void act({ action: 'view' })}>Refresh progress</button>
  </div>;
}
