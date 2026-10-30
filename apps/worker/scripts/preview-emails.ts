import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderThemedEmail, type EmailNotification } from '@district/integrations/email/email-template';
import { trainingFundTaskEmail } from '../src/activities/email-notifications/training-fund';

// Rendering only: fictional content and links; no SES calls or real recipients.
const directory = resolve('.data/email-previews');
mkdirSync(directory, { recursive: true });
const person = { id: 'preview', name: 'Example Volunteer', email: 'preview@example.org' };
const url = 'https://workflow.example.org/tasks#token=preview-only';
const examples: Record<string, EmailNotification> = {
  approval: trainingFundTaskEmail('example-application', person, 'approver', url, 30),
  payment: trainingFundTaskEmail('example-application', person, 'treasurer', url, 30),
  general: { to: person, subject: 'Your district update', category: 'District Workflow', heading: 'Your request is complete.', paragraphs: ['Your district request has been completed. Thank you for helping local Scouting.'], details: [{ label: 'Reference', value: 'EXAMPLE-001' }] },
};
for (const [name, notification] of Object.entries(examples)) {
  const result = renderThemedEmail(notification);
  writeFileSync(resolve(directory, `${name}.html`), result.html);
  writeFileSync(resolve(directory, `${name}.txt`), result.text);
}
console.info(`Email previews written to ${directory}`);
