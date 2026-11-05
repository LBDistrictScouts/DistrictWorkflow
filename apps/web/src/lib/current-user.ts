
import type { JWTPayload } from 'jose';
import { userRepository, profileRepository } from '@district/persistence/runtime';
import { verifySession, sessionEmail } from './cognito';

export async function verifyUserSession(token: string): Promise<JWTPayload & { userId: string; name: string; email: string }> {
  const identity = await verifySession(token);
  const email = sessionEmail(identity);
  const user = await userRepository().findByEmail(email);

  if (!user) throw new Error('No unique active district member matches this email');
  const profile = await profileRepository().findByUserId(user.id);

  return { ...identity, email, userId: user.id, name: profile.displayName ?? user.name };
}
