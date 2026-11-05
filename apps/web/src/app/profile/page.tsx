import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionCookie } from '@/lib/cognito';
import { verifyUserSession } from '@/lib/current-user';
import { profileRepository } from '@district/persistence/runtime';
import ProfileForm from '@/components/profile-form';

export const metadata: Metadata = { title: 'Your profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const token = (await cookies()).get(sessionCookie)?.value;

  if (!token) redirect('/sign-in');
  const identity = await verifyUserSession(token);
  const profile = await profileRepository().findByUserId(identity.userId);

  return <section className="section container guide"><h1>Your profile</h1><p className="guide-intro">Choose how your name appears and how you receive task requests.</p>
    <ProfileForm initial={profile} directoryName={identity.name} />
  </section>;
}
