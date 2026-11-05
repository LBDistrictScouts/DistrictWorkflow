import { cognitoConfig, verifySession } from './cognito';

export const refreshCookie = 'workflow-refresh';

// Browser retention limit; Cognito independently enforces refresh-token expiry.
export const sessionRetentionSeconds = 30 * 24 * 60 * 60;

export async function refreshSession(refreshToken: string, subject: string) {
  const config = cognitoConfig();
  const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });

  if (process.env.COGNITO_CLIENT_SECRET) headers.set('Authorization', `Basic ${Buffer.from(`${config.clientId}:${process.env.COGNITO_CLIENT_SECRET}`).toString('base64')}`);

  const response = await fetch(new URL('/oauth2/token', config.domain), {
    method: 'POST', headers, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: config.clientId, refresh_token: refreshToken }),
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error('Session refresh failed');
  const body = await response.json();

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (typeof body.id_token !== 'string') throw new Error('Missing refreshed ID token');
  const identity = await verifySession(body.id_token);

  if (identity.sub !== subject) throw new Error('Refreshed subject mismatch');

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  return { token: body.id_token, refreshToken: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : refreshToken };
}
