import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/email-notifications/award-reminders';

const reminders = proxyActivities<typeof activities>({ startToCloseTimeout: '2 minutes', retry: { maximumAttempts: 3 } });

export async function awardRemindersWorkflow() {
  let sent = 0, failed = 0;

  try { await reminders.wakeCompletedAwardImports(); } catch { failed++; }

  const ids = await reminders.listDueAwardReminders();

  for (const id of ids) {
    try { sent += await reminders.sendAwardReminder(id); } catch { failed++; }
  }

  if (failed) throw ApplicationFailure.nonRetryable(`Award reminder delivery failed for ${failed} tasks`);

  return { sent };
}
