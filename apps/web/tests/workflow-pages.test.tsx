import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WorkflowTaskRow } from '@district/contracts/workflows/tasks';
import { filterTasks } from '../src/lib/task-list';
import WorkflowTaskList from '../src/components/workflow-task-list';
import WorkflowDetail from '../src/components/workflow-detail';
import WorkflowFlow from '../src/components/workflow-flow';
import { machineToGraph } from '../src/vendor/sketch/machine';
import { awardsMachine } from '@district/domain/awards/machine';

const rows: WorkflowTaskRow[] = [
  { id: '1', executionId: 'a', title: 'Present Award', subject: 'Alice · Service award', assignee: 'DLV', status: 'pending', createdAt: '2026-11-01', searchText: '12345' },
  { id: '2', executionId: 'a', title: 'Present Award', subject: 'Bob · Thanks', assignee: 'Pat', status: 'completed', createdAt: '2026-11-02' },
];

test('task search, status and assignee filters combine; date and name sorting are stable', () => {
  const defaults = { search: '', status: '', assignee: '', sort: 'createdAt:desc' };
  assert.deepEqual(filterTasks(rows, defaults).map(row => row.id), ['2', '1']);
  assert.deepEqual(filterTasks(rows, { ...defaults, search: '  ALICE ', status: 'pending', assignee: 'DLV' }).map(row => row.id), ['1']);
  assert.equal(filterTasks(rows, { ...defaults, search: '12345' }).length, 1);
  assert.equal(filterTasks(rows, { ...defaults, status: 'completed', assignee: 'DLV' }).length, 0);
  assert.deepEqual(filterTasks(rows, { ...defaults, sort: 'subject:asc' }).map(row => row.id), ['1', '2']);
  assert.deepEqual(rows.map(row => row.id), ['1', '2']);
});

test('workflow landing page links to all three subpages and task listing has labelled controls', () => {
  const html = renderToStaticMarkup(createElement(WorkflowDetail, { slug: 'awards', name: 'Awards', description: 'Present awards', summary: { total: 2, open: 1, completed: 1, cancelled: 0 }, unavailable: false }));

  for (const page of ['form', 'definition', 'tasks']) assert.ok(html.includes(`/workflows/awards/${page}`));
  assert.match(html, /Awards<\/dt><dd>2/); assert.match(html, /Completed<\/dt><dd>1/); assert.ok(!html.includes('Workflow runs'));
  const table = renderToStaticMarkup(createElement(WorkflowTaskList, { tasks: rows }));

  for (const label of ['Search tasks', 'All statuses', 'Assigned to', 'Sort by', 'Completed']) assert.ok(table.includes(label));
});

test('awards definition shows the XState chart and a transition map including reassignment', () => {
  const graph = machineToGraph(awardsMachine);
  const html = renderToStaticMarkup(createElement(WorkflowFlow, { graph, id: 'awards-test' }));

  for (const label of ['Transitions map', 'RECEIVE', 'REASSIGN', 'SCHEDULE', 'PRESENT']) assert.ok(html.includes(label));
  assert.equal(graph.edges.find(edge => edge.data.eventType === 'REASSIGN')?.data.isTargetless, true);
});

import { taskReference } from '../src/lib/task-reference';

test('all task entry points resolve to a single modal reference, excluding external links', () => {
  const origin = 'https://workflow.example.org';
  const id = '550e8400-e29b-41d4-a716-446655440000';

  for (const path of ['/workflows/awards', '/workflows/awards/tasks']) assert.deepEqual(taskReference(`${path}#task-${id}`, origin), { kind: 'award', id });
  assert.deepEqual(taskReference(`/workflows/activity-notification/tasks#task-${id}`, origin), { kind: 'activity', id });
  assert.equal(taskReference(`https://other.example.org/workflows/activity-notification/tasks#task-${id}`, origin), null);
  assert.deepEqual(taskReference('/tasks#token=capability', origin), { kind: 'training-fund', token: 'capability' });
  assert.deepEqual(taskReference('/responses#token=capability&choice=yes', origin), { kind: 'response', token: 'capability', choice: 'yes' });
  assert.equal(taskReference(`https://other.example.org/workflows/awards/tasks#task-${id}`, origin), null);
  assert.equal(taskReference('/workflows/awards/tasks#task-invalid', origin), null);
  assert.equal(taskReference('/workflows/awards/form', origin), null);
});

import AssigneePanel from '../src/components/tasks/assignee-panel';

test('assignees use name search and prevent removal of the final assigned user', () => {
  const person = { id: 'one', name: 'Alice' };
  const html = renderToStaticMarkup(createElement(AssigneePanel, { assignees: [person], people: [person], disabled: false, onAdd: () => {}, onRemove: () => {} }));
  assert.ok(html.includes('type="search"'));
  assert.ok(!html.includes('<select'));
  assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Remove Alice"/);
  const multiple = renderToStaticMarkup(createElement(AssigneePanel, { assignees: [person, { id: 'two', name: 'Bob' }], people: [], disabled: false, onAdd: () => {}, onRemove: () => {} }));
  assert.ok(!multiple.includes('disabled=""'));
});

import { awardsImportMachine } from '@district/domain/awards/import-machine';

test('awards import diagram connects row processing and task completion with distinct diagram IDs', () => {
  const graph = machineToGraph(awardsImportMachine);
  assert.equal(graph.edges.find(edge => edge.data.eventType === 'TASK_CREATED')?.targetId, 'awardsImport.next_award');
  assert.equal(graph.edges.find(edge => edge.data.eventType === 'awardsProgressChanged')?.targetId, 'awardsImport.check_completion');
  const html = renderToStaticMarkup(createElement(WorkflowFlow, { graph, id: 'awards-import-flow', title: 'Import workflow · Temporal' }));

  for (const label of ['resolveRoleUser(DLV)', 'getMemberProfileByMembershipNumber', 'createAwardTask', 'MEMBER_NOT_FOUND', 'NO_ASSIGNEES', 'Transitions map']) assert.ok(html.includes(label), label);

  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(target.startsWith('awards-import-flow-'));
    assert.ok(html.includes(`id="${target}"`));
  }
});


test('Activity Approvals uses the workflow template with case metrics and three subpages', () => {
  const html = renderToStaticMarkup(createElement(WorkflowDetail, { slug: 'activity-notification', name: 'Activity Approvals', description: 'Review activity notifications', summary: { total: 3, open: 2, completed: 1, cancelled: 0 }, unavailable: false }));

  for (const page of ['form', 'definition', 'tasks']) assert.ok(html.includes(`/workflows/activity-notification/${page}`));
  assert.match(html, /Activity notifications<\/dt><dd>3/);
  assert.match(html, /Open<\/dt><dd>2/);
  assert.match(html, /Completed<\/dt><dd>1/);
  assert.match(html, /Cancelled<\/dt><dd>0/);
  assert.ok(!html.includes('Awards'));
});
