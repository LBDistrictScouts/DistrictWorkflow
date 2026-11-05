import { parseAwardContext } from '@district/contracts/awards/validation';
import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseAwardsFile } from '@district/integrations/awards/import';
import { fetchMemberProfile } from '@district/integrations/district-team/member-profile';

const headers = 'Membership number,Award description,Award date\n';

test('CSV validates dates, quoted fields, duplicates and membership numbers', async () => {
  const rows = await parseAwardsFile(Buffer.from(headers + '001234,"Award, silver",03/11/2026'), 'awards.csv');
  assert.equal(rows[0]!.membershipNumber, '1234');
  assert.equal(rows[0]!.description, 'Award, silver');
  assert.equal(rows[0]!.awardDate, '2026-11-03');
  await assert.rejects(parseAwardsFile(Buffer.from(headers + '123,Award,2026-02-30'), 'a.csv'), /valid date/);
  await assert.rejects(parseAwardsFile(Buffer.from(headers + '123,Award,2026-01-01\n123,Award,2026-01-01'), 'a.csv'), /duplicate/);
  await assert.rejects(parseAwardsFile(Buffer.from(headers + 'abc,Award,2026-01-01'), 'a.csv'), /membership/);
});

test('Excel native dates import and formulas are rejected', async () => {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Awards');
  sheet.addRow(['Membership number', 'Award description', 'Award date']);
  sheet.addRow([1234, 'Service award', new Date('2026-11-03T00:00:00Z')]);
  assert.equal((await parseAwardsFile(Buffer.from(await book.xlsx.writeBuffer()), 'a.xlsx'))[0]!.awardDate, '2026-11-03');
  sheet.getCell('B2').value = { formula: 'A2', result: 1234 };
  await assert.rejects(parseAwardsFile(Buffer.from(await book.xlsx.writeBuffer()), 'a.xlsx'), /formulas/);
});

test('member profile uses the new endpoint and returns only current appointment data', async () => {
  process.env.DISTRICT_TEAM_MEMBERS_URL = 'https://directory.example/api/members';

  const profile = await fetchMemberProfile('1234', (async url => {
    assert.equal(String(url), 'https://directory.example/api/member-profile/1234');

    return Response.json({ data: { id: 'member-id', full_name: 'Recipient', current_appointments: [{ role: { name: 'Team Member', team: { team_name: 'District' } }, appointment_email: 'member@example.org' }] } });
  }));

  assert.equal(profile!.appointments[0]!.role, 'Team Member');
  assert.equal(await fetchMemberProfile('1234', (async () => new Response(null, { status: 404 }))), null);
  await assert.rejects(fetchMemberProfile('1234', (async () => Response.json({ data: {} }))), /Invalid member/);
  await assert.rejects(fetchMemberProfile('1/../../', fetch), /Invalid membership/);
});

import { awardsWorkflowIdFor, isAwardsWorkflowId } from '@district/contracts/awards/workflow';

test('awards UUID identities are stable, validated and compatible with existing imports', () => {
  const id = '550E8400-E29B-41D4-A716-446655440000';
  assert.equal(awardsWorkflowIdFor(id), 'awards-550e8400-e29b-41d4-a716-446655440000');
  assert.equal(awardsWorkflowIdFor(id), awardsWorkflowIdFor(id.toLowerCase()));
  assert.ok(isAwardsWorkflowId(awardsWorkflowIdFor(id)));
  assert.ok(isAwardsWorkflowId(`awards-${'a'.repeat(64)}`));
  assert.equal(isAwardsWorkflowId('training-fund-' + id), false);
  assert.equal(isAwardsWorkflowId('awards-invalid'), false);
  assert.throws(() => awardsWorkflowIdFor('-'.repeat(36)), /Invalid workflow/);
  assert.throws(() => awardsWorkflowIdFor('a'.repeat(64)), /Invalid workflow/);
});

import { transitionAward } from '@district/domain/awards/machine';

test('award lifecycle requires receipt and scheduling before presentation', () => {
  assert.equal(transitionAward('listed', { type: 'REASSIGN' }), 'listed');
  assert.equal(transitionAward('listed', { type: 'RECEIVE' }), 'received');
  assert.equal(transitionAward('received', { type: 'SCHEDULE' }), 'scheduled');
  assert.equal(transitionAward('scheduled', { type: 'SCHEDULE' }), 'scheduled');
  assert.equal(transitionAward('scheduled', { type: 'PRESENT' }), 'presented');
  assert.throws(() => transitionAward('listed', { type: 'PRESENT' }), /Cannot present/);
  assert.throws(() => transitionAward('presented', { type: 'REASSIGN' }), /Cannot reassign/);
});


test('stored award contexts are validated before reminders and task reads', () => {
  const context = { membershipNumber: '1234', description: 'Award', awardDate: '2026-11-01', recipient: { id: 'member', name: 'Member', appointments: [{ role: 'Volunteer', team: 'District', email: 'member@example.org' }] } };
  assert.deepEqual(parseAwardContext(context), context);

  for (const invalid of [null, {}, { ...context, recipient: null }, { ...context, recipient: { ...context.recipient, appointments: [{}] } }]) {
    assert.throws(() => parseAwardContext(invalid), /Invalid stored award context/);
  }
});
