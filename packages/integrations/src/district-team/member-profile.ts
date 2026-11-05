import type { MemberProfile } from '@district/contracts/directory/types';

/** Membership-number lookup shared by workflows; only retains useful profile fields. */
export async function fetchMemberProfile(membershipNumber: string, fetcher: typeof fetch = fetch): Promise<MemberProfile | null> {
  if (!/^[1-9]\d*$/.test(membershipNumber) || !Number.isSafeInteger(Number(membershipNumber))) throw new TypeError('Invalid membership number');
  const base = process.env.DISTRICT_TEAM_MEMBERS_URL;

  if (!base) throw new Error('DISTRICT_TEAM_MEMBERS_URL is required');
  const url = new URL(`member-profile/${membershipNumber}`, base);

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('District-team API requires HTTPS');
  // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
  const response = await fetcher(url, { headers: { Accept: 'application/json', ...(process.env.DISTRICT_TEAM_AUTHORIZATION ? { Authorization: process.env.DISTRICT_TEAM_AUTHORIZATION } : {}) }, redirect: 'error', signal: AbortSignal.timeout(30000), cache: 'no-store' });

  if (response.status === 404) return null;

  if (!response.ok) throw new Error(`District-team API returned ${response.status}`);
  const { data } = await response.json();

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!data || typeof data.id !== 'string' || typeof data.full_name !== 'string' || !Array.isArray(data.current_appointments)) throw new Error('Invalid member profile');

  return { id: data.id, name: data.full_name, appointments: data.current_appointments.map((a: { role?: { name?: unknown; team?: { team_name?: unknown } }; appointment_email?: unknown }) => {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    if (typeof a.role?.name !== 'string' || typeof a.appointment_email !== 'string') throw new Error('Invalid member appointment');

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    return { role: a.role.name, team: typeof a.role.team?.team_name === 'string' ? a.role.team.team_name : '', email: a.appointment_email };
  }) };
}
