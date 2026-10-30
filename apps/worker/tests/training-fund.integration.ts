import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { WorkflowIdReusePolicy } from '@temporalio/client';
import { application, routing } from './fixtures';
import type { Person, TaskIdentity, TrainingFundState } from '@district/contracts/training-fund/types';

async function eventually(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(50); }
  assert.fail('Expected state was not reached');
}

test('real Temporal: every assigned approval, no early payment, duplicate safety and replay', { timeout: 60000 }, async () => {
  const env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path: resolve('.bin/temporal') }, ui: false } });
  const notifications: string[] = [];
  const queue = `training-fund-test-${randomUUID()}`;
  const worker = await Worker.create({
    connection: env.nativeConnection, taskQueue: queue,
    workflowsPath: require.resolve('../src/workflows/index'),
    activities: { notifyTrainingFundTask: async (_id: string, person: Person, role: TaskIdentity['role']) => { notifications.push(`${role}:${person.id}`); } },
  });
  try {
    await worker.runUntil(async () => {
      const id = `training-fund-${randomUUID()}`;
      const handle = await env.client.workflow.start('trainingFundWorkflow', { workflowId: id, taskQueue: queue, args: [application, routing], workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE });
      await eventually(() => notifications.length === 3);
      assert.deepEqual(new Set(notifications), new Set(['approver:reviewer-1', 'approver:reviewer-2', 'approver:reviewer-3']));
      await assert.rejects(handle.executeUpdate('approveTrainingFund', { args: ['intruder'] }));
      await assert.rejects(handle.executeUpdate('recordTrainingFundPayment', { args: ['treasurer', 'BANK-1', '2026-01-01'] }));
      await handle.executeUpdate('approveTrainingFund', { args: ['reviewer-2'] });
      await handle.executeUpdate('approveTrainingFund', { args: ['reviewer-2'] });
      await handle.executeUpdate('approveTrainingFund', { args: ['reviewer-1'] });
      const partial = await handle.query<TrainingFundState>('trainingFundState');
      assert.equal(partial.approvals.length, 2);
      assert.equal(partial.status, 'awaiting_approvals');
      assert.equal(notifications.length, 3);
      await handle.executeUpdate('approveTrainingFund', { args: ['reviewer-3'] });
      await eventually(() => notifications.length === 4);
      assert.equal(notifications[3], 'treasurer:treasurer');
      await assert.rejects(handle.executeUpdate('recordTrainingFundPayment', { args: ['reviewer-1', 'BANK-1', '2026-01-01'] }));
      await handle.executeUpdate('recordTrainingFundPayment', { args: ['treasurer', 'BANK-1', '2026-01-01'] });
      const result = await handle.result() as TrainingFundState;
      assert.equal(result.status, 'paid');
      assert.equal(result.approvals.length, 3);
      assert.equal(result.payment?.reference, 'BANK-1');
      assert.equal((await handle.query<TrainingFundState>('trainingFundState')).status, 'paid');
      await assert.rejects(env.client.workflow.start('trainingFundWorkflow', { workflowId: id, taskQueue: queue, args: [application, routing], workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE }));
      await Worker.runReplayHistory({ workflowsPath: require.resolve('../src/workflows/index') }, await handle.fetchHistory());
    });
  } finally { await env.teardown(); }
});
