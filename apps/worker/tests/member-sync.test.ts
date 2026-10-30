import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMembers, parseMember } from '@district/integrations/district-team/members';
const member = { id: '11111111-1111-4111-8111-111111111111', full_name: 'Jacob Tyler', active: true,
  member_contact_methods: [
    { contact_method_type: 'Email', contact_method: ' Jacob@lbdscouts.org.uk ' },
    { contact_method_type: 'Email Alias', contact_method: 'jacob@4thletchworth.com' },
    { contact_method_type: 'Phone Number', contact_method: '123' },
  ] };
test('normalizes both login emails and ignores phone numbers', () => {
  assert.deepEqual(parseMember(member).emails, ['jacob@lbdscouts.org.uk', 'jacob@4thletchworth.com']);
  assert.throws(() => parseMember({ ...member, member_contact_methods: undefined }));
});
test('fetches all pages and refuses incomplete or duplicate snapshots', async () => {
  process.env.DISTRICT_TEAM_MEMBERS_URL = 'https://directory.example/api/members';
  let calls = 0;
  const mock = (async () => {
    calls++;
    return Response.json({ data: [{ ...member, id: calls === 1 ? member.id : '22222222-2222-4222-8222-222222222222' }],
      pagination: { page: calls, page_count: 2, total: 2 } });
  }) as typeof fetch;
  assert.equal((await fetchMembers(mock)).length, 2);
  assert.equal(calls, 2);
  await assert.rejects(fetchMembers((async () => Response.json({ data: [member],
    pagination: { page: 1, page_count: 1, total: 2 } })) as typeof fetch), /Incomplete/);
  await assert.rejects(fetchMembers((async () => Response.json({ data: [member, member],
    pagination: { page: 1, page_count: 1, total: 2 } })) as typeof fetch), /Duplicate/);
});
