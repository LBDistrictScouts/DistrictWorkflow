import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../src/testing/postgres';
import { eq } from 'drizzle-orm';
import { ProjectionConflict } from '@district/application/training-fund/repository';
import type { TrainingFundApplication, TrainingFundState } from '@district/contracts/training-fund/types';
import { createTrainingFundRepository } from '../src/training-fund-repository';
import * as schema from '../src/schema';

function initial(): TrainingFundState {
  const application: TrainingFundApplication = {
    schemaVersion: '1.0', type: 'district.training-fund.application', applicationId: randomUUID(), submittedAt: '2026-10-05T10:00:00Z',
    applicant: { name: 'Example Volunteer', email: 'volunteer@example.org', group: 'Example Group', role: 'Volunteer' },
    course: { title: 'First aid', provider: 'Example Training', startDate: '2026-11-01', location: 'District', costPence: 10000 },
    funding: { requestedPence: 5000, reason: 'Course fees', benefit: 'First aid cover' }, declaration: true,
  };
  return { application, routing: {
    approvers: [1, 2, 3].map(n => ({ id: `reviewer-${n}`, name: `Reviewer ${n}`, email: `reviewer-${n}@example.org` })),
    treasurer: { id: 'treasurer', name: 'Treasurer', email: 'treasurer@example.org' },
  }, status: 'awaiting_approvals', approvals: [] };
}

test('generated PostgreSQL migration, atomic ledger, retries, conflicts and completion', async () => {
  const database = await createTestDatabase();
  const db = database.db;
  const repository = createTrainingFundRepository(db);
  try {
    await database.migrate();
    await database.migrate(); // Deployment re-run is harmless.
    const state = initial();
    const workflowId = `training-fund-${state.application.applicationId}`;
    const applicationId = state.application.applicationId;
    const original = structuredClone(state);
    assert.equal(await repository.alreadyRecorded(state.application), false);
    await repository.save({ workflowId, revision: 0, state });
    await repository.save({ workflowId, revision: 0, state: structuredClone(state) });
    assert.equal(await repository.alreadyRecorded(state.application), true);
    assert.equal((await repository.findPendingForEmail(' REVIEWER-1@EXAMPLE.ORG ')).length, 1);
    assert.deepEqual(await repository.findPendingForEmail('stranger@example.org'), []);
    assert.deepEqual(await repository.findPendingForEmail('treasurer@example.org'), []);
    await assert.rejects(repository.alreadyRecorded({ ...state.application, funding: { ...state.application.funding, requestedPence: 1000 } }), ProjectionConflict);

    state.approvals.push({ personId: 'reviewer-1', approvedAt: '2026-10-05T11:00:00Z' });
    await repository.save({ workflowId, revision: 1, state });
    await repository.save({ workflowId, revision: 0, state: original }); // Delayed initial activity retry.
    assert.equal((await repository.findByWorkflowId(workflowId))?.revision, 1);
    assert.deepEqual(await repository.findPendingForEmail('reviewer-1@example.org'), []);
    assert.equal((await repository.findPendingForEmail('reviewer-2@example.org')).length, 1);
    await assert.rejects(repository.save({ workflowId, revision: 1, state: { ...state, approvals: [{ personId: 'reviewer-2', approvedAt: '2026-10-05T11:00:00Z' }] } }), ProjectionConflict);
    await assert.rejects(repository.save({ workflowId, revision: 3, state }), ProjectionConflict);
    await assert.rejects(repository.save({ workflowId, revision: 1, state: { ...state, application: { ...state.application, declaration: false as true } } }));

    // A database failure after the audit insert must roll back both tables.
    await db.$client.query(`CREATE FUNCTION reject_projection_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated database failure'; END; $$;
      CREATE TRIGGER reject_projection_update BEFORE UPDATE ON training_fund_applications FOR EACH ROW EXECUTE FUNCTION reject_projection_update();`);
    state.approvals.push({ personId: 'reviewer-2', approvedAt: '2026-10-05T11:01:00Z' });
    await assert.rejects(repository.save({ workflowId, revision: 2, state }));
    assert.equal((await repository.findByApplicationId(applicationId))?.revision, 1);
    assert.equal((await db.select().from(schema.trainingFundTransitions)).length, 2);
    await db.$client.query('DROP TRIGGER reject_projection_update ON training_fund_applications; DROP FUNCTION reject_projection_update();');
    await repository.save({ workflowId, revision: 2, state });
    state.approvals.push({ personId: 'reviewer-3', approvedAt: '2026-10-05T11:02:00Z' });
    state.status = 'awaiting_payment';
    await repository.save({ workflowId, revision: 3, state });
    assert.equal((await repository.findPendingForEmail('treasurer@example.org')).length, 1);
    assert.deepEqual(await repository.findPendingForEmail('reviewer-2@example.org'), []);
    state.status = 'paid';
    state.payment = { personId: 'treasurer', reference: 'BANK-1', paidAt: '2026-10-05', recordedAt: '2026-10-05T12:00:00Z' };
    await repository.save({ workflowId, revision: 4, state });
    assert.deepEqual((await repository.findByApplicationId(applicationId))?.state, state);
    assert.deepEqual(await repository.findPendingForEmail('treasurer@example.org'), []);
    assert.equal((await db.select().from(schema.trainingFundTransitions)).length, 5);
    assert.equal(await repository.findByWorkflowId('not-found'), null);
    assert.equal(await repository.alreadyRecorded(state.application), true);
    assert.deepEqual(await repository.findPendingForEmail('reviewer-1@example.org'), []);
    assert.deepEqual(await repository.findPendingForEmail('stranger@example.org'), []);
    assert.deepEqual(await repository.findPendingForEmail('treasurer@example.org'), []); // Independent of Temporal retention.

    const staffState = initial();
    staffState.application.submission = { channel: 'staff', receivedVia: 'email', receivedAt: '2026-10-05', reference: 'Email reference', registeredBy: { id: 'staff', name: 'Registrar' }, registeredAt: '2026-10-05T10:00:00Z' };
    await repository.save({ workflowId: `training-fund-${staffState.application.applicationId}`, revision: 0, state: staffState });
    const retry = structuredClone(staffState.application);
    if (retry.submission?.channel === 'staff') retry.submission.registeredAt = '2026-10-05T10:05:00Z';
    assert.equal(await repository.alreadyRecorded(retry), true);
    if (retry.submission?.channel === 'staff') retry.submission.registeredBy.id = 'different-registrar';
    await assert.rejects(repository.alreadyRecorded(retry), ProjectionConflict);

    // SQL constraints protect identity, status and foreign keys, even outside the repository.
    await assert.rejects(db.update(schema.trainingFundApplications).set({ status: 'awaiting_approvals' }).where(eq(schema.trainingFundApplications.applicationId, applicationId)));
    await assert.rejects(db.insert(schema.trainingFundTransitions).values({ applicationId: randomUUID(), revision: 0, status: state.status, state }));
    const changed = structuredClone(state); changed.application.applicant.name = 'Different applicant';
    await assert.rejects(repository.save({ workflowId, revision: 4, state: changed }), ProjectionConflict);
  } finally { await database.close(); }
});

test('separate PostgreSQL sessions cannot commit different decisions at the same revision', async () => {
  const database = await createTestDatabase();
  const repository = createTrainingFundRepository(database.db);
  try {
    await database.migrate();
    const state = initial();
    const workflowId = `training-fund-${state.application.applicationId}`;
    await Promise.all([
      repository.save({ workflowId, revision: 0, state }),
      repository.save({ workflowId, revision: 0, state: structuredClone(state) }),
    ]);
    const first = structuredClone(state);
    const second = structuredClone(state);
    first.approvals.push({ personId: 'reviewer-1', approvedAt: '2026-10-05T11:00:00Z' });
    second.approvals.push({ personId: 'reviewer-2', approvedAt: '2026-10-05T11:00:00Z' });
    const writes = await Promise.allSettled([
      repository.save({ workflowId, revision: 1, state: first }),
      repository.save({ workflowId, revision: 1, state: second }),
    ]);
    assert.equal(writes.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = writes.find(result => result.status === 'rejected');
    assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof ProjectionConflict);
    const saved = await repository.findByWorkflowId(workflowId);
    assert.equal(saved?.revision, 1);
    assert.deepEqual(saved?.state, writes[0].status === 'fulfilled' ? first : second);
    assert.equal((await database.db.select().from(schema.trainingFundTransitions)).length, 2);
  } finally { await database.close(); }
});
