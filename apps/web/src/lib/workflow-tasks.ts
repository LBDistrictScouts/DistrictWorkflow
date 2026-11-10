import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyUserSession } from './current-user';
import { sessionCookie } from './cognito';
import { activityNotificationRepository, awardsRepository, workflowOverviewRepository } from '@district/persistence/runtime';
import { trainingFundActions } from '@district/integrations/training-fund/gateway';
import type { WorkflowTaskRow } from '@district/contracts/workflows/tasks';

export async function workflowTasks(slug: 'awards' | 'training-fund' | 'activity-notification', withLinks = false): Promise<WorkflowTaskRow[]> {
  const token = (await cookies()).get(sessionCookie)?.value;
  const actor = token ? await verifyUserSession(token).catch(() => null) : null;

  if (!actor) redirect('/sign-in');

  if (slug === 'training-fund') {
    const rows = await workflowOverviewRepository().trainingFundTasks();

    if (!withLinks) return rows;
    // Keep the overview available if live Temporal task links cannot be loaded.
    const actions = await trainingFundActions(actor.email).catch(() => []);

    return rows.map(row => ({ ...row, href: actions.find(action => action.id === row.id)?.href }));
  }

  if (slug === 'activity-notification') {
    const records = await activityNotificationRepository().list(actor.userId, true);

    return records.map(({ task, submission }) => ({ id: task.id, executionId: task.workflowExecutionId, title: 'Approve activity notification', subject: `${submission.notification.activity} · ${submission.notification.venueName}`, assignee: 'Activity out-of-district team', status: task.status, createdAt: task.createdAt?.toISOString() ?? '', completedAt: task.completedAt?.toISOString(), href: `/workflows/activity-notification/tasks#task-${task.id}`, searchText: `${submission.notification.leaderName} ${submission.notification.groups.join(' ')} ${submission.notification.sections.join(' ')}` }));
  }

  const [tasks, people] = await Promise.all([awardsRepository().list(actor.userId, true), awardsRepository().assignees()]);

  return tasks.map(task => ({ id: task.id, executionId: task.workflowExecutionId, title: 'Present Award', subject: `${task.context.recipient.name} · ${task.context.description}`, assignee: task.assignedUserId ? people.find(person => person.id === task.assignedUserId)?.name ?? 'Inactive member' : [...new Map(task.progress.roleAssignees.map(person => [person.id, person.name])).values()].join(', ') || 'Unassigned', status: task.status, createdAt: task.createdAt?.toISOString() ?? '', completedAt: task.completedAt?.toISOString(), href: `/workflows/awards/tasks#task-${task.id}` }));
}

export async function workflowCaseSummary(slug: 'awards' | 'training-fund' | 'activity-notification') {
  const token = (await cookies()).get(sessionCookie)?.value;
  const actor = token ? await verifyUserSession(token).catch(() => null) : null;

  if (!actor) redirect('/sign-in');

  return workflowOverviewRepository().caseSummary(slug, actor.userId);
}
