import { verifyUserSession } from '@/lib/current-user';
import { NextRequest, NextResponse } from 'next/server';
import { cognitoConfig, cookieOptions, sessionCookie, transactionCookie } from '@/lib/cognito';

export async function GET(request: NextRequest) {
  const config = cognitoConfig();
  const response = NextResponse.redirect(new URL('/sign-in?error=access', config.origin));
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(transactionCookie, '', { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(sessionCookie, '', { ...cookieOptions(), maxAge: 0 });
  try {
    const transaction = JSON.parse(request.cookies.get(transactionCookie)?.value ?? 'null');
    const code = request.nextUrl.searchParams.get('code');
    if (!transaction || !code || transaction.state !== request.nextUrl.searchParams.get('state')) return response;
    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (process.env.COGNITO_CLIENT_SECRET) headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${process.env.COGNITO_CLIENT_SECRET}`).toString('base64')}`;
    const tokens = await fetch(new URL('/oauth2/token', config.domain), { method: 'POST', headers, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, redirect_uri: config.callback, code, code_verifier: transaction.verifier }), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!tokens.ok) return response;
    const body = await tokens.json();
    const identity = await verifyUserSession(body.id_token);
    if (identity.nonce !== transaction.nonce) return response;
    response.headers.set('Location', new URL('/', config.origin).href);
    response.cookies.set(sessionCookie, body.id_token, { ...cookieOptions(), maxAge: Math.max(0, identity.exp! - Math.floor(Date.now() / 1000)) });
  } catch { /* Invalid or unavailable identity providers fail closed. */ }
  return response;
}
