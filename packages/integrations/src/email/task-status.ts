import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { responseRepository } from '@district/persistence/runtime';
import type { EmailNotification } from './email-template';

function key() {
  const secret = process.env.RESPONSE_TASK_SIGNING_KEY;

  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('RESPONSE_TASK_SIGNING_KEY must contain at least 32 bytes');

  return createHash('sha256').update('email-status-v1:').update(secret).digest();
}

export function statusToken(taskId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(taskId)) throw new TypeError('Invalid task ID');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(taskId, 'utf8'), cipher.final()]);

  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function statusTaskId(token: string): string {
  if (!/^[A-Za-z0-9_-]{86}$/.test(token)) throw new Error('Invalid status token');
  const bytes = Buffer.from(token, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));

  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

/** Read-only capability: never exposes answers or permits a response submission. */
export async function emailTaskStatus(token: string, repository = responseRepository()): Promise<string> {
  const request = await repository.find(statusTaskId(token));

  if (!request) return 'Status unavailable - view current status';

  if (request.completed) return 'Completed - no further action needed';

  if (Date.parse(request.expiresAt) <= Date.now()) return 'Expired - no response can be submitted';

  return 'Action required';
}

export function prepareTaskEmail(notification: EmailNotification): EmailNotification {
  if (!notification.taskStatus) return notification;
  const { taskId, url } = notification.taskStatus;
  const origin = new URL(url).origin;

  return { ...notification, statusImageUrl: `${origin}/api/email-task-status?token=${statusToken(taskId)}` };
}
