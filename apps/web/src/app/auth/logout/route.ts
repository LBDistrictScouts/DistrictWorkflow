import { NextResponse } from 'next/server';
import { cognitoConfig, cookieOptions, sessionCookie } from '@/lib/cognito';

export async function POST(request: Request) {
  const config = cognitoConfig();
  if (request.headers.get('origin') !== config.origin) return new Response('Invalid origin', { status: 403 });
  const url = new URL('/logout', config.domain);
  url.search = new URLSearchParams({ client_id: config.clientId, logout_uri: `${config.origin}/sign-in` }).toString();
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(sessionCookie, '', { ...cookieOptions(), maxAge: 0 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
