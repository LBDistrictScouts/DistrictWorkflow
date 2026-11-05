import type { TaskResponsePreference } from '@district/contracts/profile/types';
import type { ResponseRequestInput } from '@district/contracts/responses/types';
import type { EmailNotification } from '../email/email-template';

export function responseTaskEmail(request: ResponseRequestInput, url: string, preference: TaskResponsePreference = 'response-links'): EmailNotification {
  return { taskStatus: { taskId: request.taskId, url }, to: request.recipient, subject: request.subject, heading: request.heading,
    paragraphs: [request.instructions, preference === 'task-notification' ? 'You have a task waiting. Open it to review the details and respond.' : 'Open your personal link and confirm your response. Opening a link alone does not submit an answer.'],
    ...(request.definition.kind === 'simple' && preference === 'response-links'
      ? { actions: request.definition.choices.map(choice => ({ label: choice.label, url: `${url}&choice=${encodeURIComponent(choice.value)}` })) }
      : { action: { label: preference === 'task-notification' ? 'Open task' : 'Complete response form', url } }),
    footnote: `This personal link expires on ${new Date(request.expiresAt).toISOString()}. Sign in using the recipient email address. Do not forward the link.`,
  };
}

/** Retain the original task instructions and response choices under a clear reminder preface. */
export function responseReminderEmail(request: ResponseRequestInput, url: string): EmailNotification {
  const email = responseTaskEmail(request, url, 'response-links');

  return { ...email, subject: `Reminder: ${request.subject}`.slice(0, 200),
    preview: `Remember, you have an action to complete: ${request.heading}`.slice(0, 300),
    paragraphs: [`Remember, you have an action to complete: ${request.heading}`, ...email.paragraphs],
  };
}
