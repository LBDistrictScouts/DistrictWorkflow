import { Client, Connection } from '@temporalio/client';
import { connectionOptions, namespace } from '@district/integrations/temporal/config';
import { workflowIdFor } from '@district/integrations/training-fund/settings';
import { notifyTrainingFundTask } from '../activities';
import type { TrainingFundState } from '@district/contracts/training-fund/types';

async function main() {
  const [applicationId, personId] = process.argv.slice(2);
  if (!applicationId || !personId) throw new Error('Usage: yarn training-fund:resend <application UUID> <assigned person ID>');
  const connection = await Connection.connect(connectionOptions);
  try {
    const client = new Client({ connection, namespace });
    const state = await client.workflow.getHandle(workflowIdFor(applicationId)).query<TrainingFundState>('trainingFundState');
    const approver = state.routing.approvers.find(p => p.id === personId);
    if (approver && state.status === 'awaiting_approvals' && !state.approvals.some(a => a.personId === personId)) {
      await notifyTrainingFundTask(applicationId, approver, 'approver');
    } else if (state.routing.treasurer.id === personId && state.status === 'awaiting_payment') {
      await notifyTrainingFundTask(applicationId, state.routing.treasurer, 'treasurer');
    } else throw new Error('No outstanding task for this person');
    console.info('Task email resent');
  } finally { await connection.close(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Unable to resend task'); process.exitCode = 1; });
