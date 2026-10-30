import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createTestDatabase } from '@district/persistence/testing/postgres';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { ApplicationFailure } from '@temporalio/common';
import { Worker } from '@temporalio/worker';
import { createTrainingFundRepository } from '@district/persistence/training-fund-repository';
import * as schema from '@district/persistence/schema';
import { ProjectionConflict, type TrainingFundRecord } from '@district/application/training-fund/repository';
import type { TrainingFundState } from '@district/contracts/training-fund/types';
import { application, routing } from './fixtures';

// Real Temporal and PostgreSQL; each run owns a disposable database. No AWS calls.
test('persisted workflow commits decisions, serializes simultaneous approvals and retries a lost DB receipt', { timeout: 60000 }, async t => {
  const postgres = await createTestDatabase();
  t.after(() => postgres.close());
  const db = postgres.db;
  await postgres.migrate();
  const repository = createTrainingFundRepository(db);
  const env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path: resolve('.bin/temporal') }, ui: false } });
  let lostReceipt = false;
  const attempts: number[] = [];
  const taskQueue = `database-test-${randomUUID()}`;
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue,
    workflowsPath: require.resolve('../src/workflows/index'),
    activities: {
      notifyTrainingFundTask: async () => {},
      persistTrainingFundState: async (input: TrainingFundRecord) => {
        attempts.push(input.revision);
        try { await repository.save(input); }
        catch (error) {
          if (error instanceof ProjectionConflict) throw ApplicationFailure.nonRetryable(error.message, 'ProjectionConflict');
          throw error;
        }
        if (input.revision === 1 && !lostReceipt) { lostReceipt = true; throw new Error('Simulated lost commit receipt'); }
      },
    },
  });
  try {
    await worker.runUntil(() => env.client.connection.withDeadline(Date.now() + 20000, async () => {
      const workflowId = `training-fund-${application.applicationId}`;
      const handle = await env.client.workflow.start('trainingFundWorkflow', { workflowId, taskQueue, args: [application, routing, { persistState: true }] });
      await assert.rejects(handle.executeUpdate('recordTrainingFundPayment', { args: ['treasurer', 'BANK-1', '2026-01-01'] }));
      const approvals = await Promise.all(['reviewer-1', 'reviewer-2', 'reviewer-1', 'reviewer-3'].map(personId => handle.executeUpdate<TrainingFundState, [string]>('approveTrainingFund', { args: [personId] })));
      assert.ok(approvals.every(state => state.approvals.length >= 1));
      assert.equal((await repository.findByWorkflowId(workflowId))?.state.status, 'awaiting_payment');
      await handle.executeUpdate('recordTrainingFundPayment', { args: ['treasurer', 'BANK-1', '2026-01-01'] });
      const result = await handle.result() as TrainingFundState;
      assert.equal(result.status, 'paid');
      const saved = await repository.findByApplicationId(application.applicationId);
      assert.deepEqual(saved?.state, result);
      assert.equal(saved?.revision, 4);
      assert.deepEqual(attempts, [0, 1, 1, 2, 3, 4]);
      assert.equal((await db.select().from(schema.trainingFundTransitions)).length, 5);
      assert.equal(await repository.alreadyRecorded(application), true);
      await Worker.runReplayHistory({ workflowsPath: require.resolve('../src/workflows/index') }, await handle.fetchHistory());
    }));
  } finally { await env.teardown(); }
});
