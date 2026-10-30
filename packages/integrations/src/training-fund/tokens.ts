import { createHmac, timingSafeEqual } from 'node:crypto';
import type { TaskIdentity } from '@district/contracts/training-fund/types';

function signature(body: string, key: string): Buffer {
  return createHmac('sha256', key).update(body).digest();
}
export function signTask(identity: TaskIdentity, key: string): string {
  const body = Buffer.from(JSON.stringify(identity)).toString('base64url');
  return `${body}.${signature(body, key).toString('base64url')}`;
}
export function verifyTask(token: string, key: string, now = Date.now()): TaskIdentity {
  if (token.length > 2048) throw new Error('Invalid task link');
  const [body, mac, extra] = token.split('.');
  if (!body || !mac || extra) throw new Error('Invalid task link');
  const supplied = Buffer.from(mac, 'base64url');
  const expected = signature(body, key);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Invalid task link');
  const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TaskIdentity;
  if (!/^training-fund-[0-9a-f-]{36}$/i.test(value.workflowId) || typeof value.personId !== 'string' || !['approver', 'treasurer'].includes(value.role) || !Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now) {
    throw new Error('Invalid or expired task link');
  }
  return value;
}
