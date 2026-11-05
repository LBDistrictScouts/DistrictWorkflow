import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/email-notifications/response-reminders';

const { listDueResponseReminders, sendResponseReminder } = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes', retry: { maximumAttempts: 3 },
});

export async function responseRemindersWorkflow() {
  const taskIds = await listDueResponseReminders();
  let sent = 0;
  let failed = 0;

  for (const taskId of taskIds) {
    try { if (await sendResponseReminder(taskId)) sent++; }
    catch { failed++; }
  }

  if (failed) throw ApplicationFailure.nonRetryable(`Reminder delivery failed for ${failed} tasks`);

  return { sent };
}
