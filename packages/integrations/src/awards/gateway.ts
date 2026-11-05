import { awardsWorkflowIdFor, isAwardsWorkflowId } from '@district/contracts/awards/workflow';
import { Client, Connection, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { createHash } from 'node:crypto';
import type { AwardRow, AwardImportStatus } from '@district/contracts/awards/types';
import { connectionOptions, namespace, taskQueue } from '../temporal/config';

async function withClient<T>(run: (client: Client) => Promise<T>) {
  const connection = await Connection.connect(connectionOptions);

  try { return await connection.withDeadline(Date.now() + 15000, () => run(new Client({ connection, namespace }))); }
  finally { await connection.close(); }
}

export async function startAwards(rows: AwardRow[], createdBy: string, importId: string) {
  const workflowId = awardsWorkflowIdFor(importId);
  // A UUID is the retry key; the fingerprint rejects reuse for a different request.
  const requestFingerprint = createHash('sha256').update(JSON.stringify({ rows, createdBy })).digest('hex');

  return withClient(async client => {
    try { await client.workflow.start('awardsWorkflow', { workflowId, taskQueue, args: [{ rows, createdBy }], memo: { requestFingerprint }, workflowIdReusePolicy: 'REJECT_DUPLICATE' }); }
    catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      const existing = await client.workflow.getHandle(workflowId).describe();

      if (existing.memo?.requestFingerprint !== requestFingerprint) throw new TypeError('This import identifier is already used for another request. Select the file again to start a new import.');
    }

    return workflowId;
  });
}

export async function awardImportStatus(workflowId: string): Promise<AwardImportStatus> {
  if (!isAwardsWorkflowId(workflowId)) throw new TypeError('Invalid import');

  return withClient(client => client.workflow.getHandle(workflowId).query<AwardImportStatus>('awardImportStatus'));
}

export async function notifyAwardsProgress(workflowId: string) {
  if (!isAwardsWorkflowId(workflowId)) throw new TypeError('Invalid import');

  return withClient(client => client.workflow.getHandle(workflowId).signal('awardsProgressChanged'));
}
