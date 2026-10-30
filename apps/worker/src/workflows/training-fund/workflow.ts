import { ApplicationFailure, allHandlersFinished, workflowInfo, condition, defineQuery, defineUpdate, proxyActivities, setHandler } from '@temporalio/workflow';
import type { TrainingFundApplication, TrainingFundRouting, TrainingFundState } from '@district/contracts/training-fund/types';
import type { notifyTrainingFundTask, persistTrainingFundState } from '../../activities';
import { approve, recordPayment } from '@district/domain/training-fund/state';
import { initialTrainingFundState } from '@district/domain/training-fund/machine';

export const trainingFundState = defineQuery<TrainingFundState>('trainingFundState');
export const approveTrainingFund = defineUpdate<TrainingFundState, [string]>('approveTrainingFund');
export const recordTrainingFundPayment = defineUpdate<TrainingFundState, [string, string, string]>('recordTrainingFundPayment');

const { notifyTrainingFundTask: notify } = proxyActivities<{ notifyTrainingFundTask: typeof notifyTrainingFundTask }>({
  startToCloseTimeout: '30 seconds', retry: { initialInterval: '10 seconds', maximumInterval: '10 minutes' },
});

export async function trainingFundWorkflow(application: TrainingFundApplication, routing: TrainingFundRouting, options?: { persistState: true }): Promise<TrainingFundState> {
  // The recorded input selects the new path. Existing two-argument histories
  // retain their exact command sequence and do not suddenly acquire DB writes.
  if (options?.persistState) return persistedTrainingFundWorkflow(application, routing);
  const state = initialTrainingFundState(application, routing);
  setHandler(trainingFundState, () => state);
  setHandler(approveTrainingFund, personId => {
    try { approve(state, personId, new Date().toISOString()); }
    catch (error) { throw ApplicationFailure.nonRetryable((error as Error).message, 'InvalidDecision'); }
    return state;
  });
  setHandler(recordTrainingFundPayment, (personId, reference, paidAt) => {
    try { recordPayment(state, personId, reference, paidAt, new Date().toISOString()); }
    catch (error) { throw ApplicationFailure.nonRetryable((error as Error).message, 'InvalidDecision'); }
    return state;
  });

  await Promise.all(routing.approvers.map(person => notify(application.applicationId, person, 'approver')));
  await condition(() => state.status !== 'awaiting_approvals');
  await notify(application.applicationId, routing.treasurer, 'treasurer');
  await condition(() => state.status === 'paid');
  return state;
}


const { persistTrainingFundState: persist } = proxyActivities<{ persistTrainingFundState: typeof persistTrainingFundState }>({
  startToCloseTimeout: '30 seconds', retry: { initialInterval: '1 second', maximumInterval: '1 minute' },
});

async function persistedTrainingFundWorkflow(application: TrainingFundApplication, routing: TrainingFundRouting): Promise<TrainingFundState> {
  let state = initialTrainingFundState(application, routing);
  let initialized = false;
  let decisionTail: Promise<void> = Promise.resolve();
  const workflowId = workflowInfo().workflowId;
  const revision = (value: TrainingFundState) => value.approvals.length + (value.payment ? 1 : 0);
  setHandler(trainingFundState, () => state);

  function decide(change: (next: TrainingFundState) => void): Promise<TrainingFundState> {
    // Reserve a queue position synchronously. A condition-based boolean lock can
    // wake multiple waiting handlers in the same Workflow Task.
    const decision = decisionTail.then(async () => {
      await condition(() => initialized);
      const next: TrainingFundState = JSON.parse(JSON.stringify(state));
      try { change(next); }
      catch (error) { throw ApplicationFailure.nonRetryable((error as Error).message, 'InvalidDecision'); }
      if (revision(next) !== revision(state)) {
        await persist({ workflowId, revision: revision(next), state: next });
        state = next; // A successful Update now means the database commit completed.
      }
      return state;
    });
    decisionTail = decision.then(() => undefined, () => undefined);
    return decision;
  }
  setHandler(approveTrainingFund, personId => decide(next => approve(next, personId, new Date().toISOString())));
  setHandler(recordTrainingFundPayment, (personId, reference, paidAt) => decide(next => recordPayment(next, personId, reference, paidAt, new Date().toISOString())));

  await persist({ workflowId, revision: 0, state });
  initialized = true;
  await Promise.all(routing.approvers.map(person => notify(application.applicationId, person, 'approver')));
  await condition(() => state.status !== 'awaiting_approvals');
  await notify(application.applicationId, routing.treasurer, 'treasurer');
  await condition(() => state.status === 'paid');
  await condition(allHandlersFinished);
  return state;
}
