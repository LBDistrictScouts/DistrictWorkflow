import { verifyUserSession } from '@/lib/current-user';
import 'server-only';
import { executeTask, submitApplication, TrainingFundError } from '@district/application/training-fund/service';
import { trainingFundGateway } from '@district/integrations/training-fund/gateway';
import { cookies } from 'next/headers';
import { sessionCookie } from '@/lib/cognito';

async function sessionDetails(endpoint: string | undefined, cookieName: string | undefined): Promise<unknown> {
  if (!endpoint || !cookieName) return null;
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
  const session = (await cookies()).get(cookieName);
  if (!session) return null;
  const response = await fetch(url, {
    headers: { Cookie: `${session.name}=${session.value}` },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  return response.ok ? response.json() : null;
}

export async function memberAuthenticated(): Promise<boolean> {
  const body = await sessionDetails(process.env.MEMBERS_SESSION_URL, process.env.MEMBERS_SESSION_COOKIE_NAME);
  return Boolean(body && typeof body === 'object' && 'authenticated' in body && body.authenticated === true);
}

export async function authenticatedRegistrar() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return null;
  try {
    const identity = await verifyUserSession(token);
    return { id: identity.userId, name: typeof identity.name === 'string' ? identity.name : typeof identity.email === 'string' ? identity.email : identity.sub! };
  } catch { return null; }
}

export function sameOrigin(request: Request): boolean {
  // PUBLIC_APP_ORIGIN is required behind a reverse proxy if its internal URL differs.
  const expected = process.env.PUBLIC_APP_ORIGIN || new URL(request.url).origin;
  return request.headers.get('origin') === expected;
}

export async function trainingFundRequest(path: '/applications' | '/task', body: unknown): Promise<Response> {
  try {
    const result = path === '/applications'
      ? await submitApplication(body, trainingFundGateway)
      : await executeTask(body, trainingFundGateway);
    return Response.json(result, { status: path === '/applications' ? 202 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof TrainingFundError) {
      const status = { 'invalid-input': 400, forbidden: 403, conflict: 409 }[error.reason];
      return Response.json({ error: error.message }, { status, headers: { 'Cache-Control': 'no-store' } });
    }
    throw error;
  }
}

export async function boundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 32768) { await reader.cancel(); throw new Error('Request too large'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
