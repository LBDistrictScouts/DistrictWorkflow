'use client';

import Link from 'next/link';
import WorkflowTaskList from './workflow-task-list';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AwardContext, AwardImportStatus } from '@district/contracts/awards/types';

const stages = { listed: 'Award listed', received: 'Award received', scheduled: 'Presentation scheduled', presented: 'Award presented' };

type Task = { progress: { roleAssignees: { id: string; name: string; appointmentEmail: string }[]; stage: keyof typeof stages; presentationDate: string | null };  id: string; assignedUserId: string | null; context: AwardContext; workflowExecutionId: string; status: 'pending' | 'in_progress' | 'completed'; createdAt: string | null };

export default function Awards({ mode }: { mode: 'form' | 'tasks' }) {
  const [file, setFile] = useState<File>();
  const importId = useRef('');
  const [workflowId, setWorkflowId] = useState('');
  const [status, setStatus] = useState<AwardImportStatus>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/awards?history=all'); const body = await response.json();

    if (!response.ok) throw new Error(body.error);
    setTasks(body.tasks); setPeople(body.people);
  }, []);

  useEffect(() => {
    if (mode !== 'tasks') return;
    let disposed = false;
    fetch('/api/awards?history=all').then(async response => {
      const body = await response.json();

      if (!response.ok) throw new Error(body.error);

      if (!disposed) { setTasks(body.tasks); setPeople(body.people); }
    }).catch(e => { if (!disposed) setError(e.message); });

    return () => { disposed = true; };
  }, [mode]);
  useEffect(() => {
    if (mode !== 'tasks') return;
    const updated = () => { refresh().catch(e => setError(e.message)); setSelected([]); };

    window.addEventListener('task-updated', updated);

    return () => window.removeEventListener('task-updated', updated);
  }, [mode, refresh]);
  useEffect(() => {
    if (!workflowId || status?.ready) return;
    let disposed = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/awards?import=${workflowId}`); const body = await response.json();

        if (!response.ok) throw new Error(body.error);

        if (!disposed) { setStatus(body); setError(''); }
      } catch (e) { if (!disposed) setError((e instanceof Error ? e.message : String(e))); }
    };

    const timer = setInterval(poll, 3000); void poll();

    return () => { disposed = true; clearInterval(timer); };
  }, [workflowId, status?.ready, refresh]);

  async function upload() {
    if (!file) return;
    setBusy(true); setError('');

    try {
      importId.current ||= crypto.randomUUID();
      const response = await fetch('/api/awards', { method: 'POST', headers: { 'x-filename': encodeURIComponent(file.name), 'x-import-id': importId.current }, body: file });
      const body = await response.json();

 if (!response.ok) throw new Error(body.error);
      setStatus(undefined); setWorkflowId(body.workflowId);
    } catch (e) { setError((e instanceof Error ? e.message : String(e))); } finally { setBusy(false); }
  }

  async function change(taskId: string, action: 'assign' | 'complete' | 'schedule' | 'receive', assignee: string | null = null) {
    setBusy(true); setError('');

    try {
      const response = await fetch('/api/awards', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId, action, assignee, taskIds: selected }) });
      const body = await response.json();

 if (!response.ok) throw new Error(body.error);

      if (action === 'receive') setSelected([]);
      await refresh();
    } catch (e) { setError((e instanceof Error ? e.message : String(e))); } finally { setBusy(false); }
  }

  return <>
    {mode === 'form' && <section className="card"><h2>Import awards</h2><p>Upload a CSV or Excel (.xlsx) file with columns <strong>Membership number</strong>, <strong>Award description</strong> and <strong>Award date</strong>. Use YYYY-MM-DD or DD/MM/YYYY dates. Up to 500 awards, 2 MB; Excel imports use the first sheet.</p>
      <p>Each matched recipient gets a Present Award task assigned to the users resolved from the DLV tag, with no deadline.</p>
      <label htmlFor="awards-file">Awards file</label><input id="awards-file" type="file" accept=".csv,.xlsx" disabled={busy || (!!workflowId && !status?.ready)} onChange={e => { setFile(e.target.files?.[0]); importId.current = ''; setWorkflowId(''); setStatus(undefined); }} />
      <button type="button" className="button" disabled={!file || busy || !!workflowId} onClick={upload}>{busy ? 'Working…' : 'Import awards'}</button>
      {status && <div role="status"><p>{status.ready ? 'Import finished' : 'Importing'}: {status.processed} of {status.total} rows processed. {status.errors.length} could not be imported.</p>{status.errors.map(e => <p key={e.row}>Row {e.row}: {e.message}</p>)}</div>}
      {status?.ready && <Link className="text-link" href="/workflows/awards/tasks">View presentation tasks →</Link>}
    </section>}
    {error && <p role="alert">{error}</p>}
    {mode === 'tasks' && <><div className="section-heading"><h2>Presentation tasks</h2><button type="button" onClick={() => refresh().catch(e => setError(e.message))}>Refresh tasks</button></div>
    <p>Reminders go to the current assignee at 9am London time, three days before and on the presentation date.</p>
    <button type="button" className="button" disabled={busy || !selected.length} onClick={() => change('', 'receive')}>Mark {selected.length || 'selected'} awards received</button>
    <WorkflowTaskList labels={stages} selection={{ selected, onChange: setSelected, eligible: task => !busy && task.status === 'listed' }} tasks={tasks.map(task => ({ id: task.id, executionId: task.workflowExecutionId, title: 'Present Award', subject: `${task.context.recipient.name} · ${task.context.description}`, assignee: task.assignedUserId ? people.find(person => person.id === task.assignedUserId)?.name ?? 'Inactive member' : [...new Map(task.progress.roleAssignees.map(person => [person.id, person.name])).values()].join(', ') || 'Unassigned', status: task.progress.stage, createdAt: task.createdAt ?? '', href: `/workflows/awards/tasks#task-${task.id}`, searchText: task.context.membershipNumber }))} /></>}
  </>;
}
