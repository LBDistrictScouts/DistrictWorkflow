import type { EmailNotification } from './email-template';

export function taskDigestEmail(to: EmailNotification['to'], tasks: NonNullable<EmailNotification['taskList']>, origin: string): EmailNotification {
  return {
    to, subject: `${tasks.length} outstanding district task${tasks.length === 1 ? '' : 's'}`,
    heading: 'Your outstanding tasks', category: 'Task reminder',
    paragraphs: ['These tasks were outstanding when this reminder was prepared. Already completed a task? No further action is needed.',
      'You receive this reminder every 72 hours while you have outstanding tasks and Task Notification selected in your profile.'],
    taskList: tasks, action: { label: 'View your actions', url: `${origin}/actions` },
    footnote: 'Task links check current availability. Sign in with the email address the task was assigned to.',
  };
}
