import { verifyUserSession } from '@/lib/current-user';
import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/cognito';

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(sessionCookie)?.value;
  if (!token) return signInRequired(request);
  try {
    await verifyUserSession(token);
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return signInRequired(request);
  }
}

function signInRequired(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Cognito sign-in and workflow group membership required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.redirect(new URL('/sign-in', request.url));
}

export const config = {
  matcher: ['/((?!auth/|sign-in$|_next/static/|_next/image|images/|fonts/|favicon.svg$).*)'],
};
