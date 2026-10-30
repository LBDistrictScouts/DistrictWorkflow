import 'dotenv/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ApplicationFailure } from '@temporalio/common';
import { renderThemedEmail, type EmailNotification } from '@district/integrations/email/email-template';
import { deliverThemedEmail, emailDeliverySettings } from '@district/integrations/email/ses';

/** Reusable Temporal activity. All template fields are plain text; do not include secrets in them. */
export async function sendThemedEmail(notification: EmailNotification): Promise<{ messageId: string }> {
  try { renderThemedEmail(notification); }
  catch { throw ApplicationFailure.nonRetryable('Invalid email notification content', 'InvalidEmailNotification'); }
  // Configuration and delivery failures remain retryable so operators can repair the sender/SES setup.
  const settings = emailDeliverySettings();
  const client = new SESv2Client({});
  try {
    return await deliverThemedEmail(notification, settings, input => client.send(new SendEmailCommand(input)));
  } finally { client.destroy(); }
}
