import { refreshCookie, sessionRetentionSeconds } from '@/lib/session-refresh';
import { verifyUserSession } from '@/lib/current-user';
import { NextRequest, NextResponse } from 'next/server';
import { cognitoConfig, cookieOptions, sessionCookie, transactionCookie } from '@/lib/cognito';

export async function GET(request: NextRequest) {
  const config = cognitoConfig();
  const response = NextResponse.redirect(new URL('/sign-in?error=access', config.origin));
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(transactionCookie, '', { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(sessionCookie, '', { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(refreshCookie, '', { ...cookieOptions(), maxAge: 0 });
  let stage = 'transaction';

  try {
    const transaction = JSON.parse(request.cookies.get(transactionCookie)?.value ?? 'null');
    const code = request.nextUrl.searchParams.get('code');

    if (!transaction || !code || transaction.state !== request.nextUrl.searchParams.get('state')) {
      console.warn('[auth] Login rejected: missing transaction/code or state mismatch');

      return response;
    }

    stage = 'token exchange';
    const headers = new Headers({ 'Content-Type': 'application/x-www-form-urlencoded' });

    if (process.env.COGNITO_CLIENT_SECRET) headers.set('Authorization', `Basic ${Buffer.from(`${config.clientId}:${process.env.COGNITO_CLIENT_SECRET}`).toString('base64')}`);
    const tokens = await fetch(new URL('/oauth2/token', config.domain), { method: 'POST', headers, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: config.callback, code, code_verifier: transaction.verifier }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });

    if (!tokens.ok) {
      console.warn(`[auth] Token exchange rejected: status=${tokens.status}`);

      return response;
    }

    const body = await tokens.json();
    stage = 'identity verification and directory lookup';
    const identity = await verifyUserSession(body.id_token);

    if (identity.nonce !== transaction.nonce) {
      console.warn('[auth] Login rejected: nonce mismatch');

      return response;
    }

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    if (typeof body.refresh_token !== 'string' || !body.refresh_token) throw new Error('Missing refresh token');
    response.cookies.set(refreshCookie, body.refresh_token, { ...cookieOptions(), maxAge: sessionRetentionSeconds });
    response.headers.set('Location', new URL('/', config.origin).href);
    response.cookies.set(sessionCookie, body.id_token, { ...cookieOptions(), maxAge: sessionRetentionSeconds });
  } catch (error) {
    // Do not log raw errors: database errors can contain email query parameters.
    const knownReasons = ['Workflow group membership required', 'Verified email required', 'Email required', 'No unique active district member matches this email', 'DATABASE_URL is required'];
    const reason = error instanceof Error && knownReasons.includes(error.message) ? error.message : 'Verification or dependency failure';
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : undefined;
    console.warn(`[auth] Login failed ${JSON.stringify({ stage, reason, code })}`);
  }

  return response;
}
