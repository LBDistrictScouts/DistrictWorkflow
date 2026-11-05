import { refreshCookie, refreshSession, sessionRetentionSeconds } from '@/lib/session-refresh';
import { verifyUserSession } from '@/lib/current-user';
import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie, cookieOptions, verifySession } from '@/lib/cognito';

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(sessionCookie)?.value;

  if (!token) return signInRequired(request);

  try {
    const identity = await verifySession(token, true);
    let renewed: Awaited<ReturnType<typeof refreshSession>> | undefined;

    if (identity.exp! <= Math.floor(Date.now() / 1000) + 60) {
      const refreshToken = request.cookies.get(refreshCookie)?.value;

      if (!refreshToken) return signInRequired(request);
      renewed = await refreshSession(refreshToken, identity.sub!);
    }

    await verifyUserSession(renewed?.token ?? token);
    const headers = new Headers(request.headers);

    if (renewed) {
      request.cookies.set(sessionCookie, renewed.token);
      request.cookies.set(refreshCookie, renewed.refreshToken);
      headers.set('cookie', request.cookies.toString());
    }

    const response = NextResponse.next({ request: { headers } });

    if (renewed) {
      response.cookies.set(sessionCookie, renewed.token, { ...cookieOptions(), maxAge: sessionRetentionSeconds });
      response.cookies.set(refreshCookie, renewed.refreshToken, { ...cookieOptions(), maxAge: sessionRetentionSeconds });
    }

    response.headers.set('Cache-Control', 'private, no-store');

    return response;
  } catch {
    return signInRequired(request);
  }
}

function signInRequired(request: NextRequest) {
  const response = request.nextUrl.pathname.startsWith('/api/') ? NextResponse.json({ error: 'Cognito sign-in and workflow group membership required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }) : NextResponse.redirect(new URL('/sign-in', request.url));
  response.cookies.set(sessionCookie, '', { ...cookieOptions(), maxAge: 0 });
  response.cookies.set(refreshCookie, '', { ...cookieOptions(), maxAge: 0 });
  response.headers.set('Cache-Control', 'private, no-store');

  return response;
}

export const config = {
  matcher: ['/((?!api/email-task-status$|auth/|sign-in$|_next/static/|_next/image|images/|fonts/|favicon.svg$).*)'],
};
