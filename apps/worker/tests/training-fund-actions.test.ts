import test from 'node:test';
import assert from 'node:assert/strict';
import { availableTrainingFundActions } from '@district/application/training-fund/actions';
import type { TrainingFundState } from '@district/contracts/training-fund/types';

const state = {
  routing: { approvers: [{ id: 'a', email: 'Reviewer@Example.org', name: 'Reviewer' }, { id: 'b', email: 'other@example.org', name: 'Other' }], treasurer: { id: 't', email: 'finance@example.org', name: 'Finance' } },
  status: 'awaiting_approvals', approvals: [],
} as unknown as TrainingFundState;

test('only outstanding assignments for the matching email are available', () => {
  assert.deepEqual(availableTrainingFundActions(state, ' reviewer@example.org '), [{ personId: 'a', role: 'approver' }]);
  for (const email of ['', 'stranger@example.org', 'finance@example.org']) assert.deepEqual(availableTrainingFundActions(state, email), []);
  assert.deepEqual(availableTrainingFundActions({ ...state, approvals: [{ personId: 'a', approvedAt: '2026-10-29' }] }, 'reviewer@example.org'), []);
});
test('payment appears only for the treasurer after approval; paid workflows have no actions', () => {
  const payment = { ...state, status: 'awaiting_payment' as const };
  assert.deepEqual(availableTrainingFundActions(payment, 'FINANCE@example.org'), [{ personId: 't', role: 'treasurer' }]);
  assert.deepEqual(availableTrainingFundActions(payment, 'reviewer@example.org'), []);
  assert.deepEqual(availableTrainingFundActions({ ...payment, status: 'paid' }, 'finance@example.org'), []);
});
