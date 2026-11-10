import test from 'node:test';
import assert from 'node:assert/strict';
import { parseActivityNotification } from '@district/contracts/activity-notification/validation';
import { approveActivityNotification } from '@district/domain/activity-notification/machine';
import { activityApprovalEmail, deliverActivityApproval } from '../src/activities/email-notifications/activity-notification';
import { renderThemedEmail } from '@district/integrations/email/email-template';
import { submission } from './activity-notification-fixture';

test('activity schema accepts the queued form and rejects invalid envelopes and conditional fields', () => {
  assert.deepEqual(parseActivityNotification(submission), submission);

  for (const value of [{}, { ...submission, schemaVersion: 2 }, { ...submission, notification: { ...submission.notification, provider: 'unexpected' } }]) assert.throws(() => parseActivityNotification(value));
});

test('activity machine permits one approval and ends in a final state', () => {
  assert.equal(approveActivityNotification('awaiting_approval'), 'approved');
  assert.throws(() => approveActivityNotification('approved'));
});

test('approval email addresses the form applicant, includes the approved activity and escapes form text', () => {
  const notification = activityApprovalEmail({ ...submission, notification: { ...submission.notification, activity: '<b>Hiking</b>' } }, new Date('2026-11-09T13:00:00Z'));
  assert.equal(notification.to.email, submission.notification.email);
  assert.equal(notification.to.name, submission.notification.leaderName);
  const rendered = renderThemedEmail(notification);
  assert.match(rendered.text, /has been approved/);
  assert.ok(rendered.text.includes(submission.submissionId));
  assert.ok(rendered.text.includes(submission.notification.startsAt));
  assert.match(rendered.html, /&lt;b&gt;Hiking&lt;\/b&gt;/);
  assert.ok(!rendered.text.includes(submission.files[0]!.key));
});

test('approval delivery retries failures, saves the SES receipt after sending, and skips saved deliveries', async () => {
  const events: string[] = [];
  let notifiedAt: Date | null = null;
  let attempts = 0;

  const repository = {
    approvalNotification: async () => ({ submission, approvedAt: new Date('2026-11-09T13:00:00Z'), notifiedAt }),
    recordApprovalNotification: async (caseId: string, messageId: string) => { assert.equal(caseId, 'case-1'); assert.equal(messageId, 'ses-1'); events.push('saved'); notifiedAt = new Date(); },
  };

  const send = async () => {
    events.push('send'); attempts++;

    if (attempts === 1) throw new Error('SES unavailable');

    return { messageId: 'ses-1' };
  };

  await assert.rejects(deliverActivityApproval('case-1', repository, send), /SES unavailable/);
  assert.equal(notifiedAt, null);
  assert.equal(await deliverActivityApproval('case-1', repository, send), 'sent');
  assert.equal(await deliverActivityApproval('case-1', repository, send), 'already-sent');
  assert.deepEqual(events, ['send', 'send', 'saved']);
});
