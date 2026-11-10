import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { submission } from './activity-notification-fixture';

async function eventually(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await delay(25);
  }

  assert.fail('Expected workflow progress');
}

test('Temporal owns polling, child approval, duplicate handoff, failure retries and deterministic replay', { timeout: 60000 }, async () => {
  const env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path: resolve('.bin/temporal') }, ui: false } });
  const acknowledgements: string[] = [];
  const recorded: string[] = [];
  const initializations: string[] = [];
  let deliveries = 0;
  let approved = false;
  let notifications = 0;

  try {
    const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: 'activity-test', workflowsPath: require.resolve('../src/workflows/activity-notification'), activities: {
      receiveActivityNotification: async (environment: string) => {
        assert.equal(environment, 'test');
        await delay(25);
        deliveries++;

        if (deliveries > 3) return null;

        return { submission, receiptHandle: `receipt-${deliveries}` };
      },
      recordActivityNotification: async () => {
        if (deliveries === 3) throw new Error('Database unavailable');
        recorded.push('case-1');

        return { caseId: 'case-1', outcome: recorded.length === 1 ? 'created' : 'duplicate' };
      },
      acknowledgeActivityNotification: async (receipt: string) => { acknowledgements.push(receipt); },
      initializeActivityApproval: async (caseId: string) => { initializations.push(caseId);

 return { taskId: 'task-1' }; },
      finishActivityIfApproved: async () => approved,
      notifyActivityApprovalApplicant: async (caseId: string) => {
        assert.equal(caseId, 'case-1');
        assert.equal(approved, true);
        notifications++;

        if (notifications === 1) throw new Error('Temporary email failure');
      },
    } });

    await worker.runUntil(async () => {
      const intake = await env.client.workflow.start('activityNotificationIntakeWorkflow', { workflowId: 'activity-intake-test', taskQueue: 'activity-test', args: ['test'] });
      await eventually(() => acknowledgements.length === 2 && initializations.length === 1);
      assert.deepEqual(acknowledgements, ['receipt-1', 'receipt-2']);
      const child = env.client.workflow.getHandle(`activity-notification-test-${submission.notification.idempotenceKey}`);
      assert.equal(await child.query('activityNotificationState'), 'awaiting_approval');
      assert.equal(notifications, 0);
      approved = true;
      await child.signal('activityApprovalChanged');
      assert.equal(await child.result(), 'approved');
      assert.equal(notifications, 2);
      await eventually(() => deliveries >= 3);
      await delay(100);
      assert.ok(!acknowledgements.includes('receipt-3'));
      await Worker.runReplayHistory({ workflowsPath: require.resolve('../src/workflows/activity-notification') }, await child.fetchHistory());
      await intake.cancel();
      await assert.rejects(intake.result());
      await Worker.runReplayHistory({ workflowsPath: require.resolve('../src/workflows/activity-notification') }, await intake.fetchHistory());
    });
  } finally { await env.teardown(); }
});
