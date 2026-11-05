'use client';

import { useEffect, useState } from 'react';
import type { AwardContext } from '@district/contracts/awards/types';
import AssigneePanel from './assignee-panel';

const stages = { listed: 'Award listed', received: 'Award received', scheduled: 'Presentation scheduled', presented: 'Award presented' };

type Task = { id: string; context: AwardContext; assignedUserId: string | null; progress: { stage: keyof typeof stages; presentationDate: string | null; roleAssignees: { id: string; name: string }[] } };

export default function AwardTask({ taskId, onChanged }: { taskId: string; onChanged: () => void }) {
  const [data, setData] = useState<{ task: Task; people: { id: string; name: string }[] }>();
  const [date, setDate] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const endpoint = `/api/awards?task=${encodeURIComponent(taskId)}`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal }).then(async response => {
      const body = await response.json();

 if (!response.ok) throw new Error(body.error);
      setData(body); setDate(body.task.progress.presentationDate ?? '');
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });

    return () => controller.abort();
  }, [endpoint]);

  async function change(action: 'receive' | 'schedule' | 'complete' | 'add-assignee' | 'remove-assignee', assignee: string | null = null) {
    setBusy(true); setError(''); setMessage('');

    try {
      const response = await fetch('/api/awards', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, taskIds: [taskId], action, assignee, presentationDate: date }) });
      const body = await response.json();

 if (!response.ok) throw new Error(body.error);
      onChanged();
      const refresh = await fetch(endpoint); const updated = await refresh.json();

      if (!refresh.ok) {
        if (refresh.status === 404 && action === 'remove-assignee') { setData(undefined); setError('Assignment updated. This task is no longer available to you.');

 return; }

        throw new Error(updated.error);
      }

      setData(updated); setMessage('Task updated.');
    } catch (error) { setError((error instanceof Error ? error.message : String(error))); } finally { setBusy(false); }
  }

  if (!data) return <p role={error ? 'alert' : 'status'}>{error || 'Loading task…'}</p>;
  const { task, people } = data; const stage = task.progress.stage;

  return <><p className="task-stage">{stages[stage]}</p>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="task-section"><h3>Recipient</h3><h4>{task.context.recipient.name}</h4><dl className="task-facts"><div><dt>Award</dt><dd>{task.context.description}</dd></div><div><dt>Membership number</dt><dd>{task.context.membershipNumber}</dd></div><div><dt>Award date</dt><dd>{task.context.awardDate}</dd></div></dl><h4>Current appointments at import</h4>{task.context.recipient.appointments.length ? <ul>{task.context.recipient.appointments.map((a, index) => <li key={index}>{a.role}{a.team && ` — ${a.team}`}</li>)}</ul> : <p>No current appointments.</p>}</section>
    <section className="task-section"><h3>Presentation</h3>{stage === 'listed' && <button type="button" className="button" disabled={busy} onClick={() => change('receive')}>Mark award received</button>}{['received', 'scheduled'].includes(stage) && <><label htmlFor="task-presentation-date">Presentation date</label><div className="task-schedule"><input id="task-presentation-date" type="date" value={date} disabled={busy} onChange={event => setDate(event.target.value)} /><button type="button" className="button" disabled={busy || !date} onClick={() => change('schedule')}>{stage === 'scheduled' ? 'Save new date' : 'Schedule presentation'}</button></div><p>Reminders at 9am London time, three days before and on the day.</p></>}{stage === 'scheduled' && <button type="button" className="button" disabled={busy} onClick={() => change('complete')}>Mark as presented</button>}{stage === 'presented' && <p>This award has been presented.</p>}</section>
    <AssigneePanel assignees={task.assignedUserId ? [{ id: task.assignedUserId, name: people.find(person => person.id === task.assignedUserId)?.name ?? 'Inactive member' }] : [...new Map(task.progress.roleAssignees.map(person => [person.id, person])).values()]} people={people} disabled={busy || stage === 'presented'} onAdd={id => change('add-assignee', id)} onRemove={id => change('remove-assignee', id)} />
  </>;
}
