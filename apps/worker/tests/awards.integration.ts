import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import type { AwardImportStatus } from '@district/contracts/awards/types';

test('awards workflow enriches each row, reports unknown recipients and replays', { timeout: 60000 }, async () => {
  const env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path: resolve('.bin/temporal') }, ui: false } });
  let complete = false;
  const assignees = [{ id: 'first-user', name: 'First User', appointmentEmail: 'first@example.org' }, { id: 'second-user', name: 'Second User', appointmentEmail: 'second@example.org' }];
  const created: { assignees: typeof assignees; occurrence: number; context: { recipient: { name: string } } }[] = [];

  try {
    const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: 'awards-test', workflowsPath: require.resolve('../src/workflows/awards'), activities: {
      resolveRoleUser: async (tag: string) => { assert.equal(tag, 'DLV');

 return assignees; },
      initializeAwards: async () => ({ executionId: 'execution', stepId: 'step', tagId: 'dlv' }),
      getMemberProfileByMembershipNumber: async (number: string) => number === '999' ? null : { id: 'recipient', name: 'Recipient', appointments: [{ role: 'Leader', team: 'District', email: 'role@example.org' }] },
      createAwardTask: async (input: typeof created[number]) => { created.push(input); },
      finishAwardsIfComplete: async () => complete,
    } });

    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start('awardsWorkflow', { workflowId: 'awards-test', taskQueue: 'awards-test', args: [{ createdBy: 'registrar', rows: [{ membershipNumber: '123', description: 'Award', awardDate: '2026-11-03' }, { membershipNumber: '999', description: 'Award', awardDate: '2026-11-03', sourceRow: 5 }] }] });

      for (let i = 0; i < 100; i++) {
        const status = await handle.query<AwardImportStatus>('awardImportStatus');

        if (status.ready) break;
        await delay(20);
      }

      complete = true;
      await handle.signal('awardsProgressChanged');
      // SAFETY: This test starts the registered workflow whose declared result is the asserted domain type.
      const result = await handle.result() as AwardImportStatus;
      assert.equal(result.ready, true); assert.equal(result.processed, 2);
      assert.deepEqual(result.errors, [{ row: 5, message: 'Membership number not found.' }]);
      assert.deepEqual(created[0]!.assignees, assignees);
      assert.equal(created.length, 1); assert.equal(created[0]!.occurrence, 1);
      assert.equal(created[0]!.context.recipient.name, 'Recipient');
      assert.ok(!(await handle.fetchHistory()).events?.some(event => event.timerStartedEventAttributes), 'new awards workflows have no polling timers');
      await Worker.runReplayHistory({ workflowsPath: require.resolve('../src/workflows/awards') }, await handle.fetchHistory());
    });
  } finally { await env.teardown(); }
});
