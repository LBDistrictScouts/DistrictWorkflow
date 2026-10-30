import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { application, routing, makeState } from './fixtures';
import { parseApplication, parseRouting } from '@district/contracts/training-fund/validation';
import { approve, recordPayment } from '@district/domain/training-fund/state';
import { signTask, verifyTask } from '@district/integrations/training-fund/tokens';
import { consumeApplication as consume } from '@district/application/training-fund/intake';

const consumeApplication = (body: string, route: typeof routing, dependencies: Omit<Parameters<typeof consume>[2], 'isDuplicate'>) => consume(body, route, { ...dependencies, isDuplicate: error => error instanceof WorkflowExecutionAlreadyStartedError });

const now = '2026-10-05T12:00:00Z';
test('schema accepts the contract and rejects unexpected, malformed and inconsistent inputs', () => {
  assert.deepEqual(parseApplication(application), application);
  for (const value of [
    { ...application, approvers: routing.approvers },
    { ...application, declaration: false },
    { ...application, schemaVersion: '2.0' },
    { ...application, applicationId: 'bad' },
    { ...application, applicant: { ...application.applicant, email: 'bad' } },
    { ...application, course: { ...application.course, startDate: '2026-02-30' } },
    { ...application, funding: { ...application.funding, requestedPence: -1 } },
    { ...application, funding: { ...application.funding, requestedPence: 1.5 } },
    { ...application, funding: { ...application.funding, requestedPence: 15001 } },
    { ...application, funding: { ...application.funding, reason: '   ' } },
  ]) assert.throws(() => parseApplication(value));
});
test('routing requires exactly three different people and a separate treasurer', () => {
  assert.deepEqual(parseRouting(routing), routing);
  assert.throws(() => parseRouting({ ...routing, approvers: routing.approvers.slice(1) }));
  assert.throws(() => parseRouting({ ...routing, approvers: [routing.approvers[0], routing.approvers[0], routing.approvers[2]] }));
  assert.throws(() => parseRouting({ ...routing, treasurer: routing.approvers[0] }));
  assert.throws(() => parseRouting({ ...routing, treasurer: { ...routing.treasurer, email: routing.approvers[0].email.toUpperCase() } }));
});
test('three distinct approvals required; repeated clicks count once; unknown people cannot approve', () => {
  const state = makeState();
  assert.throws(() => approve(state, 'intruder', now));
  assert.throws(() => approve(state, 'treasurer', now));
  approve(state, 'reviewer-2', now); approve(state, 'reviewer-2', now); approve(state, 'reviewer-1', now);
  assert.equal(state.approvals.length, 2);
  assert.equal(state.status, 'awaiting_approvals');
  assert.throws(() => recordPayment(state, 'treasurer', 'BANK-1', '2026-10-05', now));
  approve(state, 'reviewer-3', now);
  assert.equal(state.status, 'awaiting_payment');
  assert.throws(() => recordPayment(state, 'reviewer-1', 'BANK-1', '2026-10-05', now));
  assert.throws(() => recordPayment(state, 'treasurer', ' ', '2026-10-05', now));
  assert.throws(() => recordPayment(state, 'treasurer', 'BANK-1', '2026-02-30', now));
  assert.throws(() => recordPayment(state, 'treasurer', 'BANK-1', '2027-10-05', now));
  recordPayment(state, 'treasurer', 'BANK-1', '2026-10-05', now);
  recordPayment(state, 'treasurer', 'BANK-1', '2026-10-05', now);
  assert.equal(state.status, 'paid');
  assert.throws(() => recordPayment(state, 'treasurer', 'BANK-2', '2026-10-05', now));
});
test('task capabilities reject tampering, expired links, invalid roles and wrong signing keys', () => {
  const key = 'a'.repeat(32);
  const identity = { workflowId: `training-fund-${application.applicationId}`, personId: 'reviewer-1', role: 'approver' as const, expiresAt: 2000 };
  const token = signTask(identity, key);
  assert.deepEqual(verifyTask(token, key, 1000), identity);
  assert.throws(() => verifyTask(token, key, 2000));
  assert.throws(() => verifyTask(token, 'b'.repeat(32), 1000));
  assert.throws(() => verifyTask(token + '.extra', key, 1000));
  assert.throws(() => verifyTask('broken', key, 1000));
  const altered = Buffer.from(JSON.stringify({ ...identity, personId: 'reviewer-2' })).toString('base64url') + '.' + token.split('.')[1];
  assert.throws(() => verifyTask(altered, key, 1000));
});
test('SQS is acknowledged only after Temporal starts or confirms a duplicate', async () => {
  const calls: string[] = [];
  const acknowledge = async () => { calls.push('delete'); };
  const start = async () => { calls.push('start'); };
  assert.equal(await consumeApplication(JSON.stringify(application), routing, { start, acknowledge }), 'started');
  assert.deepEqual(calls, ['start', 'delete']);
  calls.length = 0;
  await assert.rejects(consumeApplication('{}', routing, { start, acknowledge }));
  assert.deepEqual(calls, []);
  await assert.rejects(consumeApplication(JSON.stringify(application), routing, { start: async () => { throw new Error('Temporal unavailable'); }, acknowledge }));
  assert.deepEqual(calls, []);
  assert.equal(await consumeApplication(JSON.stringify(application), routing, { start: async () => { throw new WorkflowExecutionAlreadyStartedError('duplicate', 'id', 'trainingFundWorkflow'); }, acknowledge }), 'duplicate');
  assert.deepEqual(calls, ['delete']);
  await assert.rejects(consumeApplication(JSON.stringify(application), routing, { start, acknowledge: async () => { throw new Error('SQS delete unavailable'); } }));
});


test('the application ledger prevents restarting an archived workflow and fails closed when unavailable', async () => {
  const calls: string[] = [];
  const dependencies = {
    start: async () => { calls.push('start'); },
    acknowledge: async () => { calls.push('delete'); },
    alreadyRecorded: async () => { calls.push('ledger'); return true; },
  };
  assert.equal(await consumeApplication(JSON.stringify(application), routing, dependencies), 'duplicate');
  assert.deepEqual(calls, ['ledger', 'delete']);
  calls.length = 0;
  await assert.rejects(consumeApplication(JSON.stringify(application), routing, {
    ...dependencies, alreadyRecorded: async () => { throw new Error('Database unavailable'); },
  }));
  assert.deepEqual(calls, []);
});
