import { verifyUserSession } from '@/lib/current-user';
import { cookies } from 'next/headers';
import { sessionCookie } from '@/lib/cognito';

export default async function UserWell() {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return null;

  let identity;
  try { identity = await verifyUserSession(token); }
  catch { return null; }

  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const name = text(identity.name)
    || [text(identity.given_name), text(identity.family_name)].filter(Boolean).join(' ')
    || text(identity.email)
    || text(identity['cognito:username'])
    || 'District account';
  const email = text(identity.email);

  return <div className="user-well" role="group" aria-label="Signed-in account">
    <svg className="user-well-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.7-3.4 3.2-5.2 7-5.2s6.3 1.8 7 5.2" />
    </svg>
    <span className="user-well-details">
      <strong className="user-well-name" title={name}>{name}</strong>
      {email && <small className="user-well-email" title={email}>{email}</small>}
    </span>
    <form action="/auth/logout" method="post" className="user-well-signout">
      <button type="submit">Sign out</button>
    </form>
  </div>;
}
