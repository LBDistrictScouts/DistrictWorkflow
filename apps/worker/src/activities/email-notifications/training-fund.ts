import { sendThemedEmail } from './index';
import type { EmailNotification } from '@district/integrations/email/email-template';
import type { Person, TaskIdentity } from '@district/contracts/training-fund/types';
import { signingKey, taskOrigin, workflowIdFor } from '@district/integrations/training-fund/settings';
import { signTask } from '@district/integrations/training-fund/tokens';

// SES delivery is at least once: retries can send the same task more than once.
// The underlying approval/payment commands are idempotent.
export async function notifyTrainingFundTask(applicationId: string, person: Person, role: TaskIdentity['role']): Promise<void> {
  const days = Number(process.env.TRAINING_FUND_LINK_DAYS || '30');
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('TRAINING_FUND_LINK_DAYS must be 1–365');
  const token = signTask({ workflowId: workflowIdFor(applicationId), personId: person.id, role, expiresAt: Date.now() + days * 86400000 }, signingKey());
  // Fragment keeps the capability out of ordinary HTTP access logs and referrers.
  const url = `${taskOrigin()}/tasks#token=${token}`;
  await sendThemedEmail(trainingFundTaskEmail(applicationId, person, role, url, days));
}

/** Domain content only: signing stays in the activity; branding/delivery are shared. */
export function trainingFundTaskEmail(applicationId: string, person: Person, role: TaskIdentity['role'], url: string, days: number): EmailNotification {
  const task = role === 'approver' ? 'Review and approve this Training Fund application' : 'Arrange payment for this approved Training Fund application';
  return {
    to: { email: person.email, name: person.name },
    subject: `Training Fund: ${role === 'approver' ? 'approval requested' : 'ready for payment'}`,
    category: 'District Training Fund',
    heading: role === 'approver' ? 'Your approval is needed.' : 'Ready for payment.',
    preview: task,
    paragraphs: [task + '.', 'Opening the link does not approve the application or record payment. Please review the details and click the action button.'],
    details: [{ label: 'Application reference', value: applicationId }],
    action: { label: role === 'approver' ? 'Review application' : 'Open payment task', url },
    footnote: `This personal link expires in ${days} days. It grants access to your assigned task; do not forward it.`,
  };
}
