import { createHmac, timingSafeEqual } from 'node:crypto';
import { ResponseError } from '@district/contracts/responses/validation';

function key() {
  const value = process.env.RESPONSE_TASK_SIGNING_KEY;

  if (!value || Buffer.byteLength(value) < 32) throw new Error('RESPONSE_TASK_SIGNING_KEY must contain at least 32 bytes');

  return value;
}

export function signResponseLink(requestId: string, expiresAt: string): string {
  const body = Buffer.from(JSON.stringify({ purpose: 'response-task', requestId, expiresAt: Date.parse(expiresAt) })).toString('base64url');

  return `${body}.${createHmac('sha256', key()).update(body).digest('base64url')}`;
}

export function verifyResponseLink(token: string, now = Date.now()): string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (typeof token !== 'string' || token.length > 2048) throw new ResponseError(403, 'Invalid response link');
  const [body, supplied, extra] = token.split('.');

  if (!body || !supplied || extra) throw new ResponseError(403, 'Invalid response link');
  const expected = createHmac('sha256', key()).update(body).digest();
  const mac = Buffer.from(supplied, 'base64url');

  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) throw new ResponseError(403, 'Invalid response link');
  let value;

  try { value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { throw new ResponseError(403, 'Invalid response link'); }

  if (value.purpose !== 'response-task' || !/^[0-9a-f-]{36}$/i.test(value.requestId) || !Number.isSafeInteger(value.expiresAt)) throw new ResponseError(403, 'Invalid response link');

  if (value.expiresAt <= now) throw new ResponseError(410, 'This response link has expired');

  return value.requestId;
}
