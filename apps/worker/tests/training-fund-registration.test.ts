import test from 'node:test';
import assert from 'node:assert/strict';
import { staffIdentityFromSession, memberSubmission, staffSubmission } from '@district/application/training-fund/registration';
import { parseApplication } from '@district/contracts/training-fund/validation';
import { makeState, application } from './fixtures';
import { approve } from '@district/domain/training-fund/state';

const staff = { id: 'staff-123', name: 'Example Registrar' };
const registration = { receivedVia: 'email', receivedAt: '2026-10-05', reference: 'Email: first aid funding request' };
const now = '2026-10-05T15:00:00Z';

test('staff registration requires an authenticated identity and explicit permission', () => {
  assert.deepEqual(staffIdentityFromSession({ authenticated: true, user: staff, permissions: ['training-fund:register'] }), staff);
  for (const value of [null, { authenticated: true }, { authenticated: true, user: staff, permissions: [] }, { authenticated: false, user: staff, permissions: ['training-fund:register'] }, { authenticated: true, user: { id: '', name: 'Staff' }, permissions: ['training-fund:register'] }]) {
    assert.equal(staffIdentityFromSession(value), null);
  }
});
test('both initiation routes produce valid messages; server owns provenance', () => {
  const forged = { channel: 'staff', registeredBy: { id: 'forged', name: 'Forged identity' } };
  const member = parseApplication(memberSubmission({ ...application, submission: forged }));
  assert.deepEqual(member.submission, { channel: 'members' });
  const registered = parseApplication(staffSubmission({ ...application, registration, submission: forged }, staff, now));
  assert.deepEqual(registered.submission, { channel: 'staff', ...registration, registeredBy: staff, registeredAt: now });
  assert.equal('registration' in registered, false);
  assert.deepEqual(parseApplication(application), application); // Legacy website messages remain valid.
  const state = makeState(); state.application = registered;
  approve(state, 'reviewer-1', now); approve(state, 'reviewer-2', now);
  assert.equal(state.status, 'awaiting_approvals');
  approve(state, 'reviewer-3', now);
  assert.equal(state.status, 'awaiting_payment');
});
test('staff registration rejects missing or invalid source details', () => {
  for (const value of [undefined, {}, { ...registration, receivedVia: 'unknown' }, { ...registration, receivedAt: '2026-02-30' }, { ...registration, receivedAt: '2027-01-01' }, { ...registration, reference: ' ' }]) {
    assert.throws(() => staffSubmission({ ...application, registration: value }, staff, now));
  }
  assert.throws(() => parseApplication({ ...application, submission: { channel: 'staff' } }));
});
