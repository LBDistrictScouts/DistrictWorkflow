import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { parseRouting } from '@district/contracts/training-fund/validation';

export function required(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}
export function loadRouting() {
  return parseRouting(JSON.parse(readFileSync(required('TRAINING_FUND_ROUTING_FILE'), 'utf8')));
}
export function signingKey(): string {
  const key = required('TRAINING_FUND_SIGNING_KEY');
  if (Buffer.byteLength(key) < 32) throw new Error('TRAINING_FUND_SIGNING_KEY must contain at least 32 bytes');
  return key;
}
export function taskOrigin(): string {
  const url = new URL(required('TRAINING_FUND_PUBLIC_URL'));
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('TRAINING_FUND_PUBLIC_URL must use HTTPS (except localhost)');
  }
  return url.origin;
}
export { workflowIdFor } from '@district/contracts/training-fund/workflow';
