import type { SendEmailCommandInput } from '@aws-sdk/client-sesv2';
import { renderThemedEmail, validateEmailAddress, type EmailNotification } from './email-template';

export interface EmailDeliverySettings { from: string; replyTo?: string }
export type EmailSender = (input: SendEmailCommandInput) => Promise<{ MessageId?: string }>;

export function emailDeliverySettings(env: NodeJS.ProcessEnv = process.env): EmailDeliverySettings {
  const from = env.NOTIFICATION_FROM_EMAIL || env.TRAINING_FUND_FROM_EMAIL;
  if (!from) throw new Error('NOTIFICATION_FROM_EMAIL is required (TRAINING_FUND_FROM_EMAIL is supported for existing deployments)');
  validateEmailAddress(from);
  if (env.NOTIFICATION_REPLY_TO_EMAIL) validateEmailAddress(env.NOTIFICATION_REPLY_TO_EMAIL);
  return { from, replyTo: env.NOTIFICATION_REPLY_TO_EMAIL || undefined };
}

/** SES has no send idempotency key: retries may send an email more than once. */
export async function deliverThemedEmail(notification: EmailNotification, settings: EmailDeliverySettings, send: EmailSender): Promise<{ messageId: string }> {
  const rendered = renderThemedEmail(notification);
  validateEmailAddress(settings.from);
  if (settings.replyTo) validateEmailAddress(settings.replyTo);
  const response = await send({
    FromEmailAddress: settings.from,
    Destination: { ToAddresses: [notification.to.email] },
    ...(settings.replyTo ? { ReplyToAddresses: [settings.replyTo] } : {}),
    Content: { Simple: {
      Subject: { Data: notification.subject, Charset: 'UTF-8' },
      Body: { Html: { Data: rendered.html, Charset: 'UTF-8' }, Text: { Data: rendered.text, Charset: 'UTF-8' } },
    } },
  });
  if (!response.MessageId) throw new Error('SES did not return a message ID');
  return { messageId: response.MessageId };
}
