import type { TaskIdentity, TrainingFundState } from '@district/contracts/training-fund/types';

/** Assignments are matched only against a verified account email by the caller. */
export function availableTrainingFundActions(state: TrainingFundState, email: string): Pick<TaskIdentity, 'personId' | 'role'>[] {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  const matches = (assigned: string) => assigned.trim().toLowerCase() === normalized;
  if (state.status === 'awaiting_approvals') {
    return state.routing.approvers
      .filter(person => matches(person.email) && !state.approvals.some(approval => approval.personId === person.id))
      .map(person => ({ personId: person.id, role: 'approver' as const }));
  }
  if (state.status === 'awaiting_payment' && matches(state.routing.treasurer.email)) {
    return [{ personId: state.routing.treasurer.id, role: 'treasurer' }];
  }
  return [];
}
