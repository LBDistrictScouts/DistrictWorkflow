import { randomBytes, createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { cognitoConfig, cookieOptions, transactionCookie } from '@/lib/cognito';

export async function GET() {
  try {
    const config = cognitoConfig();
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const url = new URL('/oauth2/authorize', config.domain);
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.callback, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set(transactionCookie, JSON.stringify({ state, nonce, verifier }), { ...cookieOptions(), maxAge: 600 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch { return Response.json({ error: 'Sign-in is not configured.' }, { status: 503 }); }
}
