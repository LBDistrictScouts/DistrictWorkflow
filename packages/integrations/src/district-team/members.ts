
export interface DirectoryMember { id: string; name: string; active: boolean; emails: string[] }
export function parseMember(value: unknown): DirectoryMember {
  const m = value as Record<string, unknown>;
  if (!m || typeof m.id !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(m.id)
    || typeof m.full_name !== 'string' || typeof m.active !== 'boolean' || !Array.isArray(m.member_contact_methods))
    throw new Error('Invalid district-team member');
  const emails: string[] = [];
  for (const raw of m.member_contact_methods) {
    const c = raw as Record<string, unknown>;
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
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    throw new Error('District-team API requires HTTPS');
  const members: DirectoryMember[] = [];
  const seen = new Set<string>();
  let expectedTotal: number | undefined;
  for (let page = 1; page <= 10000; page++) {
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', '100');
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', ...(process.env.DISTRICT_TEAM_AUTHORIZATION ? { Authorization: process.env.DISTRICT_TEAM_AUTHORIZATION } : {}) },
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error('District-team API returned ' + response.status);
    const body = await response.json() as { data: unknown[]; pagination: { page: number; page_count: number; total: number } };
    const p = body.pagination;
    if (!Array.isArray(body.data) || !p || p.page !== page || !Number.isInteger(p.page_count)
      || p.page_count < 0 || !Number.isInteger(p.total) || p.total < 0)
      throw new Error('Invalid district-team pagination');
    expectedTotal ??= p.total;
    if (p.total !== expectedTotal) throw new Error('Directory changed during pagination; retry required');
    for (const raw of body.data) {
      const member = parseMember(raw);
      if (seen.has(member.id)) throw new Error('Duplicate member during pagination');
      seen.add(member.id);
      members.push(member);
    }
    if (page >= p.page_count) {
      if (members.length !== expectedTotal) throw new Error('Incomplete directory snapshot');
      return members;
    }
  }
  throw new Error('District-team pagination limit exceeded');
}
