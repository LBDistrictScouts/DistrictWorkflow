import { cookies } from 'next/headers';
import { sessionCookie } from '@/lib/cognito';
import { verifyUserSession } from '@/lib/current-user';
import { boundedJson, sameOrigin } from '@/lib/training-fund-server';
import { responseTaskRequest } from '@district/integrations/responses/gateway';
import { ResponseError } from '@district/contracts/responses/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };

  if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403, headers });
  const token = (await cookies()).get(sessionCookie)?.value;
  let identity;

  try { if (token) identity = await verifyUserSession(token); } catch { /* Reject invalid session. */ }

  if (!identity) return Response.json({ error: 'Please sign in using the response recipient email address.' }, { status: 401, headers });
  let body;

  try { body = await boundedJson(request); }
  catch { return Response.json({ error: 'Invalid or oversized response' }, { status: 400, headers }); }

  try {
    const result = await responseTaskRequest(body, { id: identity.userId, email: identity.email });

    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof ResponseError) return Response.json({ error: error.message }, { status: error.status, headers });

    return Response.json({ error: 'The response service is temporarily unavailable. Please retry the same response.' }, { status: 503, headers });
  }
}
