import { ApplicationFailure } from '@temporalio/common';
import { responseReminderRepository } from '@district/persistence/runtime';
import { signResponseLink } from '@district/integrations/responses/tokens';
import { responseReminderEmail } from '@district/integrations/responses/email';
import { sendThemedEmail } from './index';
import { emailDeliverySettings } from '@district/integrations/email/ses';

export async function listDueResponseReminders(): Promise<string[]> {
  return responseReminderRepository().dueTaskIds();
}

export async function sendResponseReminder(taskId: string): Promise<boolean> {
  // Validate configuration before consuming a reminder slot.
  const origin = new URL(process.env.PUBLIC_APP_ORIGIN || process.env.TRAINING_FUND_PUBLIC_URL || '');

  if (origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error('Configure PUBLIC_APP_ORIGIN');
  emailDeliverySettings();
  signResponseLink(taskId, '2099-01-01T00:00:00Z'); // Validate signing configuration before claim.
  const claimed = await responseReminderRepository().claim(taskId);

  if (!claimed) return false;

  try {
    const token = signResponseLink(taskId, claimed.request.expiresAt);
    await sendThemedEmail(responseReminderEmail(claimed.request, `${origin.origin}/responses#token=${encodeURIComponent(token)}`));

    return true;
  } catch {
    // SES has no idempotency key; an automatic retry could exceed the user's email cap.
    throw ApplicationFailure.nonRetryable('Reminder delivery failed or is uncertain; reminder slot consumed', 'ReminderDeliveryUncertain');
  }
}
