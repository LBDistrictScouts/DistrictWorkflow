
import type { JWTPayload } from 'jose';
import { userRepository } from '@district/persistence/runtime';
import { verifySession } from './cognito';
export async function verifyUserSession(token: string): Promise<JWTPayload & { userId: string; name: string }> {
  const identity = await verifySession(token);
  if (identity.email_verified !== true || typeof identity.email !== 'string') throw new Error('Verified email required');
  const user = await userRepository().findByEmail(identity.email);
  if (!user) throw new Error('No unique active district member matches this email');
  return { ...identity, userId: user.id, name: user.name };
}
