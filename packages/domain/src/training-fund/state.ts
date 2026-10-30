import type { TrainingFundState } from '@district/contracts/training-fund/types';
import { transitionTrainingFund } from './machine';

export function approve(state: TrainingFundState, personId: string, at: string): void {
  if (!state.routing.approvers.some(person => person.id === personId)) throw new Error('Not an assigned approver');
  if (state.approvals.some(approval => approval.personId === personId)) return;
  transitionTrainingFund(state, { type: 'APPROVE', personId, at }, 'Application is not awaiting approvals');
}

export function recordPayment(state: TrainingFundState, personId: string, reference: string, paidAt: string, at: string): void {
  if (state.routing.treasurer.id !== personId) throw new Error('Not the assigned treasurer');
  const trimmed = reference.trim();
  if (!trimmed || trimmed.length > 200) throw new Error('Enter a payment reference (1–200 characters)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt) || !Number.isFinite(Date.parse(paidAt)) || new Date(paidAt).toISOString().slice(0, 10) !== paidAt || paidAt > at.slice(0, 10)) {
    throw new Error('Enter a valid payment date that is not in the future');
  }
  if (state.payment) {
    if (state.payment.reference === trimmed && state.payment.paidAt === paidAt) return;
    throw new Error('Payment has already been recorded');
  }
  transitionTrainingFund(state, {
    type: 'RECORD_PAYMENT', payment: { personId, reference: trimmed, paidAt, recordedAt: at },
  }, 'All three approvals are required before payment');
}
