import { ApplicationFailure } from '@temporalio/common';
import { awardReminderRepository } from '@district/persistence/runtime';
import { notifyAwardsProgress } from '@district/integrations/awards/gateway';
import { emailDeliverySettings } from '@district/integrations/email/ses';
import { sendThemedEmail } from './index';

export async function listDueAwardReminders() { return awardReminderRepository().dueTaskIds(); }

export async function wakeCompletedAwardImports() {
  for (const row of await awardReminderRepository().completedImports()) await notifyAwardsProgress(row.workflowId);
}

export async function sendAwardReminder(taskId: string) {
  const origin = new URL(process.env.PUBLIC_APP_ORIGIN || process.env.TRAINING_FUND_PUBLIC_URL || '');

  if (origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error('Configure PUBLIC_APP_ORIGIN');
  emailDeliverySettings();
  const repository = awardReminderRepository();
  const claims = await repository.claim(taskId);
  let failed = false;

  for (const claim of claims) {
    try {
      await sendThemedEmail({ to: { email: claim.person.email, name: claim.person.name }, category: 'Awards', subject: claim.daysBefore === 0 ? 'Award presentation today' : 'Award presentation in 3 days', heading: 'Upcoming award presentation', paragraphs: [`You are assigned to present ${claim.context.description} to ${claim.context.recipient.name}.`, `Presentation date: ${claim.presentationDate}.`], action: { label: 'View award', url: `${origin.origin}/workflows/awards/tasks#task-${taskId}` } });
      await repository.deliveryResult(claim.reminderId, 'sent');
    } catch {
      failed = true;
      await repository.deliveryResult(claim.reminderId, 'uncertain');
    }
  }

  // SES has no idempotency key. Do not duplicate possibly delivered mail on an activity retry.
  if (failed) throw ApplicationFailure.nonRetryable('Award reminder delivery failed or is uncertain; inspect award_reminders', 'AwardReminderDeliveryUncertain');

  return claims.length;
}
