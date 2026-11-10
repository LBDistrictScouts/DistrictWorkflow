'use client';

import { useEffect, useState } from 'react';
import type { QueuedActivityNotification } from '@district/contracts/activity-notification/types';
import ActivityApproval from './activity-approval';

type ActivityTask = { task: { status: string; completedAt: string | null }; submission: QueuedActivityNotification };

export default function ActivityTask({ taskId, onChanged }: { taskId: string; onChanged: () => void }) {
  const [data, setData] = useState<ActivityTask>();
  const [error, setError] = useState('');
  const endpoint = `/api/activity-notifications?task=${encodeURIComponent(taskId)}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Task unavailable or you do not have access.');
      setData(await response.json());
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });

    return () => controller.abort();
  }, [endpoint]);

  async function refresh() {
    onChanged();
    const response = await fetch(endpoint);

    if (!response.ok) { setData(undefined); setError('Task unavailable. Refresh to check your access.');

 return; }

    setData(await response.json());
  }

  if (!data) return <p role={error ? 'alert' : 'status'}>{error || 'Loading task…'}</p>;
  const { task, submission } = data;
  const form = submission.notification;

  return <>
    <p className="task-stage">{task.status === 'completed' ? 'Approved' : 'Awaiting first approval'}</p>
    <section className="task-section"><h3>{form.activity}</h3><dl className="task-facts">
      <div><dt>Notification type</dt><dd>{form.notificationType}</dd></div>
      <div><dt>Venue and location</dt><dd>{form.venueName} · {form.location}</dd></div>
      <div><dt>Starts</dt><dd>{new Date(form.startsAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</dd></div>
      <div><dt>Ends</dt><dd>{new Date(form.endsAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</dd></div>
      <div><dt>Activity time zone</dt><dd>{form.timeZone}</dd></div>
      <div><dt>Groups and sections</dt><dd>{form.groups.join(', ')} · {form.sections.join(', ')}</dd></div>
      <div><dt>Participants</dt><dd>{form.youngPeople} young people, {form.youngLeaders} young leaders, {form.adults} adults</dd></div>
      <div><dt>Leader in charge</dt><dd>{form.leaderName} · {form.email} · {form.phone}</dd></div>
    </dl><p>{form.notes}</p></section>
    <section className="task-section"><h3>Leaders and supporting documents</h3>
      <ul>{form.leaders.map(leader => <li key={leader.id}>{leader.name}{leader.inCharge ? ' (in charge)' : ''} · {leader.email} · {leader.phone}</li>)}</ul>
      <p>Adult training: {form.adultTraining} · Trained leader: {form.trainedLeader} · Authorised: {form.authorised}</p>
      {form.externalProvider && <p>External provider: {form.externalProvider} {form.provider}</p>}
      <ul>{submission.files.map(file => <li key={`${file.key}:${file.versionId}`}>{file.name} ({file.kind})</li>)}</ul>
    </section>
    <section className="task-section"><h3>Approval</h3>{task.status === 'completed' ? <p>Approved {task.completedAt && new Date(task.completedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</p> : <><p>One approval from the activity out-of-district team completes this task for everyone.</p><ActivityApproval taskId={taskId} onApproved={refresh} /></>}</section>
  </>;
}
