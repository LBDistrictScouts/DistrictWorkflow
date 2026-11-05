import test from 'node:test';
import assert from 'node:assert/strict';
import { createActor } from 'xstate';
import { trainingFundMachine } from '@district/domain/training-fund/machine';
import { application, routing } from './fixtures';

const at = '2026-11-03T10:00:00Z';
const approvalTaskId = '20000000-0000-4000-8000-000000000001';
const bankTaskId = '20000000-0000-4000-8000-000000000002';
const paymentTaskId = '20000000-0000-4000-8000-000000000003';
const appealTaskId = '20000000-0000-4000-8000-000000000004';

function prepared() {
  const actor = createActor(trainingFundMachine, { input: { application } }).start();
  assert.equal(actor.getSnapshot().value, 'received');
  actor.send({ type: 'START' });
  actor.send({ type: 'APPROVAL_SETUP_COMPLETED', approvalTaskId, approvers: routing.approvers });
  assert.equal(actor.getSnapshot().value, 'awaiting_decisions');
  assert.equal(actor.getSnapshot().context.requiredDecisions, 2);

  return actor;
}

test('complete definition: majority approval requires bank-details receipt before treasurer payment', () => {
  const actor = prepared();
  actor.send({ type: 'REJECT', personId: 'reviewer-3', at });
  actor.send({ type: 'APPROVE', personId: 'reviewer-1', at });
  actor.send({ type: 'APPROVE', personId: 'reviewer-1', at });
  actor.send({ type: 'REJECT', personId: 'reviewer-1', at });
  actor.send({ type: 'APPROVE', personId: 'outsider', at });
  assert.equal(actor.getSnapshot().value, 'awaiting_decisions');
  assert.equal(actor.getSnapshot().context.decisions.length, 2);
  actor.send({ type: 'APPROVE', personId: 'reviewer-2', at });
  assert.equal(actor.getSnapshot().value, 'payment');
  assert.equal(actor.getSnapshot().children.payment?.getSnapshot().value, 'resolve_treasurer');
  actor.send({ type: 'ROLE_USERS_RESOLVED', users: [{ id: routing.treasurer.id, name: routing.treasurer.name, appointmentEmail: routing.treasurer.email }] });
  actor.send({ type: 'PAYMENT_TASK_CREATED', taskId: paymentTaskId });
  assert.equal(actor.getSnapshot().value, 'payment');
  assert.equal(actor.getSnapshot().children.payment?.getSnapshot().value, 'request_details');
  actor.send({ type: 'DETAILS_REQUESTED', requestId: bankTaskId });
  actor.send({ type: 'DETAILS_RECEIVED', responseId: appealTaskId });
  assert.equal(actor.getSnapshot().children.payment?.getSnapshot().value, 'awaiting_details');
  actor.send({ type: 'DETAILS_RECEIVED', responseId: bankTaskId });
  assert.equal(actor.getSnapshot().children.payment?.getSnapshot().value, 'create_payment_task');
  actor.send({ type: 'PAYMENT_TASK_CREATED', taskId: paymentTaskId });
  const payment = { personId: 'treasurer', reference: 'BANK-1', paidAt: '2026-11-03', recordedAt: at };
  actor.send({ type: 'RECORD_PAYMENT', payment: { ...payment, personId: 'reviewer-1' } });
  assert.equal(actor.getSnapshot().children.payment?.getSnapshot().value, 'awaiting_payment');
  actor.send({ type: 'RECORD_PAYMENT', payment });
  assert.equal(actor.getSnapshot().value, 'paid');
  assert.equal(actor.getSnapshot().status, 'done');
  assert.equal(actor.getSnapshot().context.paymentResult?.detailsResponseId, bankTaskId);
});

test('complete definition: majority rejection offers appeal and waits for accepted Trustee Agenda email', () => {
  const actor = prepared();
  actor.send({ type: 'REJECT', personId: 'reviewer-1', at });
  assert.equal(actor.getSnapshot().value, 'awaiting_decisions');
  actor.send({ type: 'REJECT', personId: 'reviewer-2', at });
  assert.equal(actor.getSnapshot().value, 'notify_rejection');
  actor.send({ type: 'APPROVE', personId: 'reviewer-3', at });
  assert.equal(actor.getSnapshot().context.decisions.length, 2);
  actor.send({ type: 'REJECTION_NOTIFIED' });
  assert.equal(actor.getSnapshot().value, 'offer_appeal');
  actor.send({ type: 'APPEAL_REQUESTED', requestId: appealTaskId });
  actor.send({ type: 'APPEAL_RECEIVED', responseId: bankTaskId });
  assert.equal(actor.getSnapshot().value, 'awaiting_appeal');
  actor.send({ type: 'APPEAL_RECEIVED', responseId: appealTaskId });
  assert.equal(actor.getSnapshot().value, 'email_trustee_agenda');
  actor.send({ type: 'TRUSTEE_AGENDA_EMAIL_SENT', messageId: '' });
  assert.equal(actor.getSnapshot().value, 'email_trustee_agenda');
  actor.send({ type: 'TRUSTEE_AGENDA_EMAIL_SENT', messageId: 'SES-accepted' });
  assert.equal(actor.getSnapshot().value, 'appeal_referred');
  assert.equal(actor.getSnapshot().status, 'done');
  assert.equal(actor.getSnapshot().context.paymentResult?.detailsResponseId, undefined);
});

test('complete definition: empty or duplicate approver groups block setup; even split is not a majority', () => {
  const actor = createActor(trainingFundMachine, { input: { application } }).start();
  actor.send({ type: 'START' });

  for (const approvers of [[], [routing.approvers[0]!, routing.approvers[0]!]]) {
    actor.send({ type: 'APPROVAL_SETUP_COMPLETED', approvalTaskId, approvers });
    assert.equal(actor.getSnapshot().value, 'setup_approval');
  }

  const fourth = { id: 'reviewer-4', email: 'reviewer-4@example.org', name: 'Reviewer 4' };
  actor.send({ type: 'APPROVAL_SETUP_COMPLETED', approvalTaskId, approvers: [...routing.approvers, fourth] });
  assert.equal(actor.getSnapshot().context.requiredDecisions, 3);

  for (const personId of ['reviewer-1', 'reviewer-2']) actor.send({ type: 'APPROVE', personId, at });

  for (const personId of ['reviewer-3', 'reviewer-4']) actor.send({ type: 'REJECT', personId, at });
  assert.equal(actor.getSnapshot().value, 'awaiting_decisions');
  actor.stop();
});
