import type { QueuedActivityNotification } from '@district/contracts/activity-notification/types';
import type { EmailNotification } from '@district/integrations/email/email-template';
import { activityNotificationRepository } from '@district/persistence/runtime';
import { sendThemedEmail } from './index';

type ApprovalRepository = Pick<ReturnType<typeof activityNotificationRepository>, 'approvalNotification' | 'recordApprovalNotification'>;

export function activityApprovalEmail(submission: QueuedActivityNotification, approvedAt: Date): EmailNotification {
  const form = submission.notification;

  return {
    to: { email: form.email, name: form.leaderName.slice(0, 200) },
    subject: 'Your activity notification has been approved', heading: 'Your activity has been approved.',
    category: 'Activity notifications',
    paragraphs: ['Your submitted activity notification has been approved by the district activity review team.'],
    details: [
      { label: 'Application reference', value: submission.submissionId },
      { label: 'Activity', value: form.activity },
      { label: 'Venue', value: form.venueName },
      { label: 'Location', value: form.location },
      { label: 'Starts (UTC)', value: form.startsAt },
      { label: 'Ends (UTC)', value: form.endsAt },
      { label: 'Activity time zone', value: form.timeZone },
      { label: 'Approved (UTC)', value: approvedAt.toISOString() },
    ],
  };
}

/** The saved delivery receipt suppresses ordinary retries; SES delivery remains at least once. */
export async function deliverActivityApproval(caseId: string, repository: ApprovalRepository, send: typeof sendThemedEmail): Promise<'sent' | 'already-sent'> {
  const approval = await repository.approvalNotification(caseId);

  if (approval.notifiedAt) return 'already-sent';
  const { messageId } = await send(activityApprovalEmail(approval.submission, approval.approvedAt));
  await repository.recordApprovalNotification(caseId, messageId);

  return 'sent';
}

export async function notifyActivityApprovalApplicant(caseId: string): Promise<void> {
  await deliverActivityApproval(caseId, activityNotificationRepository(), sendThemedEmail);
}
