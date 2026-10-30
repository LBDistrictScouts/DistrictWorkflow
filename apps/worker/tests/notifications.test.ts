import test from 'node:test';
import assert from 'node:assert/strict';
import type { SendEmailCommandInput } from '@aws-sdk/client-sesv2';
import { renderThemedEmail, type EmailNotification } from '@district/integrations/email/email-template';
import { deliverThemedEmail, emailDeliverySettings } from '@district/integrations/email/ses';
import { sendThemedEmail } from '../src/activities';
import { trainingFundTaskEmail } from '../src/activities/email-notifications/training-fund';

const notification: EmailNotification = {
  to: { name: 'Example Volunteer', email: 'volunteer@example.org' },
  subject: 'Your task is ready', heading: 'A little support goes a long way.',
  paragraphs: ['Please review your assigned task.'],
  details: [{ label: 'Reference', value: 'TEST-123' }],
  action: { label: 'Review task', url: 'https://workflow.example.org/tasks#token=example' },
  footnote: 'This is a personal task link. Do not forward it.',
};

test('themed renderer produces both HTML and usable plain text with the same task link', () => {
  const result = renderThemedEmail(notification);
  assert.match(result.html, /#103d3f/); assert.match(result.html, /#86e8a8/);
  assert.match(result.html, /Letchworth, Baldock &amp; Ashwell Scouts/);
  assert.match(result.html, /role="presentation"/);
  assert.ok(result.html.includes(notification.action!.url));
  assert.ok(result.text.includes(notification.action!.url));
  assert.ok(result.text.includes('Reference: TEST-123'));
  assert.ok(result.text.includes(notification.footnote!));
  const withoutAction = renderThemedEmail({ ...notification, action: undefined, details: undefined });
  assert.ok(!withoutAction.html.includes('copy this link'));
});
test('dynamic text and action attributes are escaped; unsafe links and headers rejected', () => {
  const result = renderThemedEmail({ ...notification, heading: '<script>alert("x")</script>', paragraphs: ['<b>Untrusted markup</b>'], action: { label: '<b>Click</b>', url: 'https://example.org/?a=1&b=%22' } });
  assert.ok(!result.html.includes('<script>')); assert.ok(!result.html.includes('<b>Untrusted markup</b>'));
  assert.match(result.html, /&lt;script&gt;/); assert.match(result.html, /a=1&amp;b=%22/);
  // Intentionally insecure inputs exercise URL rejection.
  // noinspection HttpUrlsUsage
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.org/task', 'https://user:pass@example.org/task']) {
    assert.throws(() => renderThemedEmail({ ...notification, action: { label: 'Open', url } }));
  }
  assert.throws(() => renderThemedEmail({ ...notification, subject: 'Test\r\nBcc: someone@example.org' }));
  assert.throws(() => renderThemedEmail({ ...notification, to: { email: 'one@example.org,two@example.org' } }));
  assert.throws(() => renderThemedEmail({ ...notification, paragraphs: [] }));
});
test('SES delivery uses UTF-8, one recipient, HTML and text and optional reply-to', async () => {
  const inputs: SendEmailCommandInput[] = [];
  const result = await deliverThemedEmail(notification, { from: 'notifications@example.org', replyTo: 'support@example.org' }, async input => { inputs.push(input); return { MessageId: 'ses-test-id' }; });
  assert.deepEqual(result, { messageId: 'ses-test-id' });
  assert.deepEqual(inputs[0].Destination, { ToAddresses: ['volunteer@example.org'] });
  assert.deepEqual(inputs[0].ReplyToAddresses, ['support@example.org']);
  assert.equal(inputs[0].Content?.Simple?.Subject?.Charset, 'UTF-8');
  assert.ok(inputs[0].Content?.Simple?.Body?.Html?.Data?.includes('Review task'));
  assert.ok(inputs[0].Content?.Simple?.Body?.Text?.Data?.includes('Review task'));
  await assert.rejects(deliverThemedEmail(notification, { from: 'notifications@example.org' }, async () => { throw new Error('SES unavailable'); }), /SES unavailable/);
  await assert.rejects(deliverThemedEmail(notification, { from: 'notifications@example.org' }, async () => ({})), /message ID/);
});
test('sender config supports a shared sender and the existing Training Fund fallback', () => {
  assert.equal(emailDeliverySettings({ NOTIFICATION_FROM_EMAIL: 'shared@example.org', TRAINING_FUND_FROM_EMAIL: 'old@example.org' }).from, 'shared@example.org');
  assert.equal(emailDeliverySettings({ TRAINING_FUND_FROM_EMAIL: 'old@example.org' }).from, 'old@example.org');
  assert.throws(() => emailDeliverySettings({}));
  assert.throws(() => emailDeliverySettings({ NOTIFICATION_FROM_EMAIL: 'bad' }));
});
test('invalid activity input is rejected without attempting AWS delivery', async () => {
  await assert.rejects(sendThemedEmail({ ...notification, paragraphs: [] }), error => {
    assert.equal((error as { nonRetryable?: boolean }).nonRetryable, true);
    assert.equal((error as { type?: string }).type, 'InvalidEmailNotification'); return true;
  });
});
test('Training Fund domain messages use the reusable template for both roles', () => {
  const person = { id: 'reviewer', name: 'Example Reviewer', email: 'reviewer@example.org' };
  for (const role of ['approver', 'treasurer'] as const) {
    const email = trainingFundTaskEmail('application-123', person, role, notification.action!.url, 30);
    const rendered = renderThemedEmail(email);
    assert.ok(rendered.text.includes('application-123'));
    assert.ok(rendered.text.includes('30 days'));
    assert.ok(rendered.text.includes('Opening the link does not approve'));
    assert.equal(email.action?.label, role === 'approver' ? 'Review application' : 'Open payment task');
  }
});
