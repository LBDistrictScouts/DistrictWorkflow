'use client';

import { useId, useState } from 'react';
import type { WorkflowTaskRow } from '@district/contracts/workflows/tasks';
import { filterTasks } from '../lib/task-list';

// oxlint-disable-next-line anti-slop/no-known-value-widening -- This lookup intentionally accepts runtime string keys and returns an optional value.
const defaultLabels: Record<string, string> = { pending: 'Pending', in_progress: 'In progress', completed: 'Completed', not_required: 'No longer required' };

export default function WorkflowTaskList({ tasks, labels = defaultLabels, selection }: { tasks: WorkflowTaskRow[]; labels?: Record<string, string>; selection?: { selected: string[]; onChange: (ids: string[]) => void; eligible: (task: WorkflowTaskRow) => boolean } }) {
  const id = useId();
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('');
  const [assignee, setAssignee] = useState(''); const [sort, setSort] = useState('createdAt:desc');
  const rows = filterTasks(tasks, { search, status, assignee, sort });
  const selectable = rows.filter(row => selection?.eligible(row)).map(row => row.id);

  return <section aria-label="Workflow task listing">
    <div className="task-list-controls">
      <label htmlFor={`${id}-search`}>Search tasks<input id={`${id}-search`} type="search" placeholder="Name, task or description" value={search} onChange={e => setSearch(e.target.value)} /></label>
      <label htmlFor={`${id}-status`}>Status<select id={`${id}-status`} value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label htmlFor={`${id}-assignee`}>Assigned to<select id={`${id}-assignee`} value={assignee} onChange={e => setAssignee(e.target.value)}><option value="">Anyone</option>{[...new Set(tasks.map(task => task.assignee))].sort().map(name => <option key={name}>{name}</option>)}</select></label>
      <label htmlFor={`${id}-sort`}>Sort by<select id={`${id}-sort`} value={sort} onChange={e => setSort(e.target.value)}><option value="createdAt:desc">Newest first</option><option value="createdAt:asc">Oldest first</option><option value="subject:asc">Recipient / applicant A–Z</option><option value="subject:desc">Recipient / applicant Z–A</option><option value="assignee:asc">Assignee A–Z</option><option value="status:asc">Status A–Z</option></select></label>
    </div>
    <p role="status">{rows.length} of {tasks.length} tasks</p>
    {rows.length ? <div className="workflow-table-scroll"><table className="workflow-table"><thead><tr>{selection && <th scope="col"><input type="checkbox" aria-label="Select all listed awards matching filters" disabled={!selectable.length} checked={!!selectable.length && selectable.every(id => selection.selected.includes(id))} onChange={e => selection.onChange(e.target.checked ? [...new Set([...selection.selected, ...selectable])] : selection.selected.filter(id => !selectable.includes(id)))} /></th>}<th scope="col">Task / recipient</th><th scope="col">Assigned to</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Details</th></tr></thead><tbody>{rows.map(task => <tr key={task.id} id={`task-${task.id}`}>{selection && <td><input type="checkbox" aria-label={`Select ${task.subject}`} disabled={!selection.eligible(task)} checked={selection.selected.includes(task.id)} onChange={e => selection.onChange(e.target.checked ? [...selection.selected, task.id] : selection.selected.filter(id => id !== task.id))} /></td>}<td><strong>{task.title}</strong><br />{task.subject}</td><td>{task.assignee}</td><td>{labels[task.status]}</td><td>{task.createdAt ? new Date(task.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '—'}</td><td>{task.href ? <a href={task.href}>Open task →</a> : task.completedAt ? `Completed ${new Date(task.completedAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}` : '—'}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h3>{tasks.length ? 'No matching tasks' : 'No tasks yet'}</h3><p>{tasks.length ? 'Try a different search or filter.' : 'Tasks will appear here when available to you.'}</p></div>}
  </section>;
}
