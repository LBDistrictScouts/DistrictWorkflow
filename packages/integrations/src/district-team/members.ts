import { parseObject } from '@district/contracts/boundary';
import { fetchCollection } from './collection';

export interface DirectoryMember { id: string; name: string; active: boolean; emails: string[] }

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export function parseMember(value: unknown): DirectoryMember {
  const m = parseObject(value, 'Invalid district-team member');

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!m || typeof m.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(m.id)
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    || typeof m.full_name !== 'string' || typeof m.active !== 'boolean' || !Array.isArray(m.member_contact_methods))
    throw new Error('Invalid district-team member');
  const emails: string[] = [];

  for (const raw of m.member_contact_methods) {
    const c = parseObject(raw, 'Invalid district-team contact method');

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    if (!c || typeof c.contact_method_type !== 'string' || typeof c.contact_method !== 'string')
      throw new Error('Invalid district-team contact method');

    if (['Email', 'Email Alias', 'Email Group'].includes(c.contact_method_type)) {
      const email = c.contact_method.trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid district-team email');
      emails.push(email);
    }
  }

  return { id: m.id.toLowerCase(), name: m.full_name, active: m.active, emails: [...new Set(emails)] };
}

export async function fetchMembers(fetcher: typeof fetch = fetch): Promise<DirectoryMember[]> {
  const endpoint = process.env.DISTRICT_TEAM_MEMBERS_URL;

  if (!endpoint) throw new Error('DISTRICT_TEAM_MEMBERS_URL is required');

  return fetchCollection(endpoint, parseMember, fetcher);
}
