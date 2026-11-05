import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor } from 'xstate';
import { paymentFlowMachine } from '@district/domain/payments/machine';
import type { PaymentFlowInput } from '@district/contracts/payments/types';

const detailsTaskId = '30000000-0000-4000-8000-000000000001';
const paymentTaskId = '30000000-0000-4000-8000-000000000002';

const input: PaymentFlowInput = {
  reference: 'EXPENSE-123', amountPence: 1250, currency: 'GBP', payee: { name: 'Volunteer', email: 'volunteer@example.org' },
  detailsRequest: { purpose: 'receipt', subject: 'Expense receipt requested', heading: 'Provide your receipt details', instructions: 'Enter the receipt reference for this reimbursement.',
    fields: [{ name: 'receiptReference', label: 'Receipt reference', type: 'text', required: true }],
  },
};

test('payment definition is independent of Training Fund and can request receipt information', () => {
  const actor = createActor(paymentFlowMachine, { input }).start();
  assert.equal(actor.getSnapshot().value, 'resolve_treasurer');
  actor.send({ type: 'DETAILS_REQUESTED', requestId: detailsTaskId });
  assert.equal(actor.getSnapshot().value, 'resolve_treasurer');
  actor.send({ type: 'ROLE_USERS_RESOLVED', users: [] });
  actor.send({ type: 'ROLE_USERS_RESOLVED', users: [{ id: 'one', name: 'One', appointmentEmail: 'one@example.org' }, { id: 'two', name: 'Two', appointmentEmail: 'two@example.org' }] });
  assert.equal(actor.getSnapshot().value, 'resolve_treasurer');
  actor.send({ type: 'ROLE_USERS_RESOLVED', users: [{ id: 'finance', name: 'Finance', appointmentEmail: 'z-finance@example.org' }, { id: 'finance', name: 'Finance', appointmentEmail: 'finance@example.org' }] });
  assert.equal(actor.getSnapshot().context.treasurer?.email, 'finance@example.org');
  assert.equal(actor.getSnapshot().context.request.detailsRequest.purpose, 'receipt');
  actor.send({ type: 'PAYMENT_TASK_CREATED', taskId: paymentTaskId });
  assert.equal(actor.getSnapshot().value, 'request_details');
  actor.send({ type: 'DETAILS_REQUESTED', requestId: 'invalid' });
  assert.equal(actor.getSnapshot().value, 'request_details');
  actor.send({ type: 'DETAILS_REQUESTED', requestId: detailsTaskId });
  actor.send({ type: 'DETAILS_RECEIVED', responseId: paymentTaskId });
  assert.equal(actor.getSnapshot().value, 'awaiting_details');
  actor.send({ type: 'DETAILS_RECEIVED', responseId: detailsTaskId });
  actor.send({ type: 'PAYMENT_TASK_CREATED', taskId: paymentTaskId });
  const payment = { personId: 'finance', reference: 'EXPENSE-TX', paidAt: '2026-11-03', recordedAt: '2026-11-03T12:00:00Z' };
  actor.send({ type: 'RECORD_PAYMENT', payment: { ...payment, personId: 'another-user' } });
  actor.send({ type: 'RECORD_PAYMENT', payment: { ...payment, paidAt: '2026-02-30' } });
  actor.send({ type: 'RECORD_PAYMENT', payment: { ...payment, paidAt: '2026-12-01' } });
  assert.equal(actor.getSnapshot().value, 'awaiting_payment');
  actor.send({ type: 'RECORD_PAYMENT', payment });
  assert.equal(actor.getSnapshot().status, 'done');
  assert.deepEqual(actor.getSnapshot().output, { reference: input.reference, amountPence: input.amountPence, currency: 'GBP', detailsResponseId: detailsTaskId, paymentTaskId, payment });
});
