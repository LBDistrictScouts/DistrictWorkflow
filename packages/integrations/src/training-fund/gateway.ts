import { trainingFundRepository } from '@district/persistence/runtime';
import { Client, Connection, WorkflowNotFoundError } from '@temporalio/client';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { TrainingFundDependencies } from '@district/application/training-fund/service';
import type { TrainingFundState } from '@district/contracts/training-fund/types';
import { connectionOptions, namespace } from '../temporal/config';
import { required, signingKey } from './settings';
import { signTask, verifyTask } from './tokens';
import { availableTrainingFundActions } from '@district/application/training-fund/actions';

// Lazy connection: building/rendering the app does not connect to Temporal.
// A failed connection can be retried on a subsequent request.
let connectionPromise: Promise<Connection> | undefined;
function connection() {
  return connectionPromise ??= Connection.connect(connectionOptions).catch(error => {
    connectionPromise = undefined;
    throw error;
  });
}
async function withHandle<T>(workflowId: string, run: (handle: ReturnType<Client['workflow']['getHandle']>) => Promise<T>): Promise<T> {
  const connected = await connection();
  const client = new Client({ connection: connected, namespace });
  return connected.withDeadline(Date.now() + 15000, () => run(client.workflow.getHandle(workflowId)));
}

export const trainingFundGateway: TrainingFundDependencies = {
  async enqueue(application) {
    const queueUrl = required('TRAINING_FUND_QUEUE_URL');
    const sqs = new SQSClient({});
    try {
      await sqs.send(new SendMessageCommand({
        QueueUrl: queueUrl, MessageBody: JSON.stringify(application),
        ...(queueUrl.endsWith('.fifo') ? { MessageGroupId: application.applicationId, MessageDeduplicationId: application.applicationId } : {}),
      }));
    } finally { sqs.destroy(); }
  },
  verifyTask: token => verifyTask(token, signingKey()),
  async query(workflowId) {
    try { return await withHandle(workflowId, handle => handle.query<TrainingFundState>('trainingFundState')); }
    catch (error) {
      if (!(error instanceof WorkflowNotFoundError)) throw error;
      const saved = await trainingFundRepository().findByWorkflowId(workflowId);
      if (saved?.state.status === 'paid') return saved.state;
      throw error; // Pending workflow recovery remains an explicit operator action.
    }
  },
  approve: (workflowId, personId) => withHandle(workflowId, handle => handle.executeUpdate<TrainingFundState, [string]>('approveTrainingFund', { args: [personId] })),
  recordPayment: (workflowId, personId, reference, paidAt) => withHandle(workflowId, handle => handle.executeUpdate<TrainingFundState, [string, string, string]>('recordTrainingFundPayment', { args: [personId, reference, paidAt] })),
};

/** Ledger selects this user's candidates; live workflow state determines availability. */
export async function trainingFundActions(email: string) {
  const records = await trainingFundRepository().findPendingForEmail(email);
  const actions = [];
  for (const record of records) {
    const state = await trainingFundGateway.query(record.workflowId);
    for (const assignment of availableTrainingFundActions(state, email)) {
      const token = signTask({ ...assignment, workflowId: record.workflowId, expiresAt: Date.now() + 15 * 60 * 1000 }, signingKey());
      actions.push({
        id: `${record.workflowId}:${assignment.role}:${assignment.personId}`,
        title: assignment.role === 'approver' ? 'Review Training Fund application' : 'Record Training Fund payment',
        applicant: state.application.applicant.name,
        course: state.application.course.title,
        submittedAt: state.application.submittedAt,
        href: `/tasks#token=${encodeURIComponent(token)}`,
      });
    }
  }
  return actions;
}
