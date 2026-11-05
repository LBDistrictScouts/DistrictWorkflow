export async function fetchCollection<T extends { id: string }>(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
  endpoint: string, parse: (value: unknown) => T, fetcher: typeof fetch = fetch,
): Promise<T[]> {
  const url = new URL(endpoint);

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    throw new Error('District-team API requires HTTPS');
  const members: T[] = [];
  const seen = new Set<string>();
  let expectedTotal: number | undefined;

  for (let page = 1; page <= 10000; page++) {
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', '100');

    const response = await fetcher(url, {
      // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
      headers: { Accept: 'application/json', ...(process.env.DISTRICT_TEAM_AUTHORIZATION ? { Authorization: process.env.DISTRICT_TEAM_AUTHORIZATION } : {}) },
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) throw new Error('District-team API returned ' + response.status);
    // SAFETY: Pagination and data are validated immediately below; each record is subsequently passed to the supplied parser.
    const body = await response.json() as { data: unknown[]; pagination: { page: number; page_count: number; total: number } };
    const p = body.pagination;

    if (!Array.isArray(body.data) || !p || p.page !== page || !Number.isInteger(p.page_count)
      || p.page_count < 0 || !Number.isInteger(p.total) || p.total < 0)
      throw new Error('Invalid district-team pagination');
    expectedTotal ??= p.total;

    if (p.total !== expectedTotal) throw new Error('Directory changed during pagination; retry required');

    for (const raw of body.data) {
      const member = parse(raw);

      if (seen.has(member.id)) throw new Error('Duplicate record during pagination');
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
