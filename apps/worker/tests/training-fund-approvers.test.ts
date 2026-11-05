import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrainingFundApprovers } from '@district/domain/training-fund/approvers';
import { routing } from './fixtures';

const matches = routing.approvers.map(person => ({ id: person.id, name: person.name, appointmentEmail: person.email }));

test('role matches produce one vote per user and retain appointment emails', () => {
  assert.deepEqual(resolveTrainingFundApprovers([...matches, { ...matches[0]!, appointmentEmail: 'zzz@example.org' }], routing.treasurer), routing.approvers);
  assert.throws(() => resolveTrainingFundApprovers([], routing.treasurer), /three distinct/);
  assert.throws(() => resolveTrainingFundApprovers(matches.slice(0, 2), routing.treasurer), /three distinct/);
  assert.throws(() => resolveTrainingFundApprovers(matches, { ...routing.treasurer, id: matches[0]!.id }), /separate/);
  assert.throws(() => resolveTrainingFundApprovers(matches.map(person => ({ ...person, appointmentEmail: 'shared@example.org' })), routing.treasurer), /unique appointment/);
});
