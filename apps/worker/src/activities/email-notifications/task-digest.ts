import { taskDigestRepository } from '@district/persistence/runtime';
import { signResponseLink } from '@district/integrations/responses/tokens';
import { trainingFundActions } from '@district/integrations/training-fund/gateway';
import { taskDigestEmail } from '@district/integrations/email/task-digest';
import { sendThemedEmail } from './index';

export async function listTaskDigestRecipients(): Promise<string[]> {
  return (await taskDigestRepository().recipients()).map(person => person.id);
}

export async function sendTaskDigest(userId: string): Promise<boolean> {
  const repository = taskDigestRepository();
  // Recheck eligibility on every attempt, rather than retaining a stale profile snapshot.
  const person = (await repository.recipients()).find(person => person.id === userId);

  if (!person) return false;
  const origin = new URL(process.env.PUBLIC_APP_ORIGIN || process.env.TRAINING_FUND_PUBLIC_URL || '').origin;

  const tasks = (await repository.tasks(userId)).map(task => ({
    title: task.request ? `${task.request.heading} (${task.request.recipient.email})` : task.title,
    url: task.request ? `${origin}/responses#token=${encodeURIComponent(signResponseLink(task.id, task.request.expiresAt))}` : `${origin}/actions`,
  }));

  // Older Training Fund workflows retain their assignments in the application ledger.
  const legacy = new Map<string, { title: string; url: string }>();

  for (const email of person.emails) {
    for (const action of await trainingFundActions(email)) {
      legacy.set(action.id, { title: `${action.title}: ${action.applicant} - ${action.course} (${email})`, url: `${origin}/actions` });
    }
  }

  tasks.push(...legacy.values());

  if (!tasks.length) return false;
  await sendThemedEmail(taskDigestEmail({ email: person.emails[0]!, name: person.name }, tasks, origin));

  return true;
}
