import type { TaskAction, TaskIdentity, TaskView, TrainingFundApplication, TrainingFundState } from '@district/contracts/training-fund/types';
import { parseApplication } from '@district/contracts/training-fund/validation';

export type FailureReason = 'invalid-input' | 'forbidden' | 'conflict';
export class TrainingFundError extends Error {
  constructor(public readonly reason: FailureReason, message: string) { super(message); }
}

export interface TrainingFundDependencies {
  enqueue(application: TrainingFundApplication): Promise<void>;
  verifyTask(token: string): TaskIdentity;
  query(workflowId: string): Promise<TrainingFundState>;
  approve(workflowId: string, personId: string): Promise<TrainingFundState>;
  recordPayment(workflowId: string, personId: string, reference: string, paidAt: string): Promise<TrainingFundState>;
}

function parseTaskRequest(value: unknown): { token: string; command: TaskAction } {
  if (!value || typeof value !== 'object') throw new TrainingFundError('invalid-input', 'Invalid task request');
  const { token, command } = value as { token?: unknown; command?: Record<string, unknown> };
  if (typeof token !== 'string' || !command || typeof command !== 'object') throw new TrainingFundError('invalid-input', 'Invalid task request');
  if (command.action === 'view' || command.action === 'approve') return { token, command: { action: command.action } };
  if (command.action === 'record-payment' && typeof command.reference === 'string' && typeof command.paidAt === 'string') {
    return { token, command: { action: command.action, reference: command.reference, paidAt: command.paidAt } };
  }
  throw new TrainingFundError('invalid-input', 'Invalid task action');
}

export async function submitApplication(body: unknown, dependencies: Pick<TrainingFundDependencies, 'enqueue'>) {
  let application;
  try { application = parseApplication(body); }
  catch (error) { throw new TrainingFundError('invalid-input', (error as Error).message); }
  await dependencies.enqueue(application);
  return { applicationId: application.applicationId, status: 'queued' as const };
}

export async function executeTask(body: unknown, dependencies: TrainingFundDependencies): Promise<TaskView> {
  const { token, command } = parseTaskRequest(body);
  let identity;
  try { identity = dependencies.verifyTask(token); }
  catch { throw new TrainingFundError('forbidden', 'This task link is invalid or expired. Ask the district team for a new link.'); }
  let state = await dependencies.query(identity.workflowId);
  const assigned = identity.role === 'approver'
    ? state.routing.approvers.some(p => p.id === identity.personId)
    : state.routing.treasurer.id === identity.personId;
  if (!assigned) throw new TrainingFundError('forbidden', 'You are not assigned to this application');
  if (command.action === 'approve') {
    if (identity.role !== 'approver') throw new TrainingFundError('forbidden', 'An approver task is required');
    if (!state.approvals.some(a => a.personId === identity.personId)) {
      if (state.status !== 'awaiting_approvals') throw new TrainingFundError('conflict', 'Application is no longer awaiting approval');
      state = await dependencies.approve(identity.workflowId, identity.personId);
    }
  } else if (command.action === 'record-payment') {
    if (identity.role !== 'treasurer') throw new TrainingFundError('forbidden', 'A treasurer task is required');
    if (state.status === 'paid') {
      if (state.payment?.reference !== command.reference.trim() || state.payment.paidAt !== command.paidAt) throw new TrainingFundError('conflict', 'Payment has already been recorded');
    } else {
      // Validate before the update for a useful response; the workflow independently enforces this too.
      const { recordPayment } = await import('@district/domain/training-fund/state');
      try { recordPayment(structuredClone(state), identity.personId, command.reference, command.paidAt, new Date().toISOString()); }
      catch (error) { throw new TrainingFundError('conflict', (error as Error).message); }
      state = await dependencies.recordPayment(identity.workflowId, identity.personId, command.reference, command.paidAt);
    }
  }
  return { state, personId: identity.personId, role: identity.role };
}
