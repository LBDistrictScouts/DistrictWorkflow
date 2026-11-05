import { ApplicationFailure, proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/email-notifications/task-digest';

const { listTaskDigestRecipients, sendTaskDigest } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 minutes', retry: { maximumAttempts: 3 },
});

export async function taskDigestWorkflow() {
  const recipients = await listTaskDigestRecipients();
  let sent = 0;
  const failed: string[] = [];

  // Each recipient is a separate activity, so retrying one does not resend earlier emails.
  for (const userId of recipients) {
    try { if (await sendTaskDigest(userId)) sent++; }
    catch { failed.push(userId); }
  }

  if (failed.length) throw ApplicationFailure.nonRetryable(`Task digests failed for ${failed.length} recipients: ${failed.join(', ')}`);

  return { sent };
}
