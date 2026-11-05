import { cookies } from 'next/headers';
import { sessionCookie } from '@/lib/cognito';
import { verifyUserSession } from '@/lib/current-user';
import { boundedJson, sameOrigin } from '@/lib/training-fund-server';
import { parseUserProfile } from '@district/contracts/profile/types';
import { profileRepository } from '@district/persistence/runtime';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };

  if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403, headers });
  const token = (await cookies()).get(sessionCookie)?.value;
  let identity;

  try { if (token) identity = await verifyUserSession(token); } catch { /* Reject invalid sessions. */ }

  if (!identity) return Response.json({ error: 'Please sign in to edit your profile.' }, { status: 401, headers });
  let profile;

  try { profile = parseUserProfile(await boundedJson(request)); }
  catch (error) { return Response.json({ error: error instanceof TypeError ? error.message : 'Invalid profile request' }, { status: 400, headers }); }

  try { return Response.json(await profileRepository().save(identity.userId, profile), { headers }); }
  catch { return Response.json({ error: 'Your profile could not be saved. Please try again.' }, { status: 503, headers }); }
}
