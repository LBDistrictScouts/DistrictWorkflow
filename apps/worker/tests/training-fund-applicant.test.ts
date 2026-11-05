import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolveTrainingFundApplicant, ApplicantSelectionError } from '@district/application/training-fund/applicant';
import { parseApplication } from '@district/contracts/training-fund/validation';
import { application } from './fixtures';

const userId = randomUUID();
const body = { ...application, schemaVersion: '1.1', applicant: { userId } };
const user = { id: userId, name: 'Directory Name', email: 'directory@example.org' };

const directory = { findActiveApplicantById: async (id: string) => { assert.equal(id, userId);

 return user; } };

test('new form sends a member UUID and only the server supplies directory contact data', async () => {
  const result = parseApplication(await resolveTrainingFundApplicant(body, directory));
  assert.deepEqual(result.applicant, { userId, name: user.name, email: user.email });
  assert.deepEqual(body.applicant, { userId });
  assert.equal(result.applicant.group, undefined);
  assert.equal(result.applicant.role, undefined);
  assert.deepEqual(parseApplication(application), application, 'legacy applications remain valid');

  for (const applicant of [{ name: 'Manual Name', email: 'manual@example.org' }, { userId: 'invalid' }, { userId, email: 'forged@example.org' }]) {
    await assert.rejects(resolveTrainingFundApplicant({ ...body, applicant }, directory), ApplicantSelectionError);
  }

  const withoutId = { ...result, applicant: { name: user.name, email: user.email } };
  assert.throws(() => parseApplication(withoutId));
  await assert.rejects(resolveTrainingFundApplicant(body, { findActiveApplicantById: async () => null }), ApplicantSelectionError);
  await assert.rejects(resolveTrainingFundApplicant(body, { findActiveApplicantById: async () => { throw new Error('Database unavailable'); } }), /Database unavailable/);
});
