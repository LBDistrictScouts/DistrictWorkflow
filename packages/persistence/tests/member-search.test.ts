import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../src/testing/postgres';
import { createUserRepository } from '../src/user-repository';
import { createTrainingFundRepository } from '../src/training-fund-repository';
import { ProjectionConflict } from '@district/application/training-fund/repository';
import type { TrainingFundState } from '@district/contracts/training-fund/types';
import { trainingFundApplications } from '../src/schema';

test('member search is bounded, active-only, literal and deduplicated; applicant lookup requires a unique contact email', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const directory = createUserRepository(database.db);
    const alice = { id: randomUUID(), name: 'Alice Volunteer', active: true, emails: ['alice@example.org', 'alice-other@example.org'] };
    const inactive = { id: randomUUID(), name: 'Alice Inactive', active: false, emails: ['old@example.org'] };
    const percent = { id: randomUUID(), name: '100% Volunteer', active: true, emails: ['percent@example.org'] };
    const noContact = { id: randomUUID(), name: 'No Contact', active: true, emails: [] };
    await directory.sync([alice, inactive, percent, noContact]);
    assert.deepEqual(await directory.searchActiveUsers('ali'), [{ id: alice.id, name: alice.name }]);
    assert.deepEqual(await directory.searchActiveUsers('alice-other@'), [{ id: alice.id, name: alice.name }]);
    assert.deepEqual(await directory.searchActiveUsers('a'), []);
    assert.deepEqual(await directory.searchActiveUsers('x'.repeat(101)), []);
    assert.deepEqual(await directory.searchActiveUsers('100%'), [{ id: percent.id, name: percent.name }]);
    assert.equal(await directory.findActiveApplicantById(inactive.id), null);
    assert.equal(await directory.findActiveApplicantById(noContact.id), null);
    assert.equal((await directory.findActiveApplicantById(alice.id))?.email, 'alice-other@example.org');
    await directory.sync([alice, { ...inactive, emails: alice.emails }, percent, noContact]);
    assert.equal(await directory.findActiveApplicantById(alice.id), null, 'shared addresses cannot identify the applicant for email responses');
  } finally { await database.close(); }
});

test('new applications store a member foreign key and retries retain UUID identity across contact snapshot changes', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const directory = createUserRepository(database.db);
    const user = { id: randomUUID(), name: 'Applicant', active: true, emails: ['applicant@example.org'] };
    await directory.sync([user]);

    const state: TrainingFundState = {
      application: { schemaVersion: '1.1', type: 'district.training-fund.application', applicationId: randomUUID(), submittedAt: '2026-11-03T10:00:00Z',
        applicant: { userId: user.id, name: user.name, email: user.emails[0]! },
        course: { title: 'First aid', provider: 'Training', startDate: '2026-12-01', location: 'District', costPence: 5000 },
        funding: { requestedPence: 3000, reason: 'Training support', benefit: 'First aid cover' }, declaration: true,
      },
      routing: { approvers: [{ id: 'a', name: 'A', email: 'a@example.org' }], treasurer: { id: 't', name: 'T', email: 't@example.org' } },
      status: 'awaiting_approvals', approvals: [], requiredApprovals: 1,
    };

    const repository = createTrainingFundRepository(database.db);
    await repository.save({ workflowId: `training-fund-${state.application.applicationId}`, revision: 0, state });
    const [row] = await database.db.select().from(trainingFundApplications);
    assert.equal(row!.applicantUserId, user.id);
    assert.equal(await repository.alreadyRecorded({ ...state.application, applicant: { ...state.application.applicant, name: 'Updated Directory Name', email: 'new@example.org' } }), true);
    await assert.rejects(repository.alreadyRecorded({ ...state.application, applicant: { ...state.application.applicant, userId: randomUUID() } }), ProjectionConflict);
    await assert.rejects(repository.alreadyRecorded({ ...state.application, funding: { ...state.application.funding, requestedPence: 2000 } }), ProjectionConflict);
  } finally { await database.close(); }
});
