import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMachine } from 'xstate';
import { paymentFlowMachine } from '@district/domain/payments/machine';
import { trainingFundMachine } from '@district/domain/training-fund/machine';
import { machineToGraph } from '../src/vendor/sketch/machine';
import WorkflowFlow from '../src/components/workflow-flow';

function render(machine: Parameters<typeof machineToGraph>[0], id = 'test-flow') {
  return renderToStaticMarkup(createElement(WorkflowFlow, { graph: machineToGraph(machine), id }));
}

test('Sketch renders the full Training Fund definition, both majority outcomes, bank details and appeal email', () => {
  const graph = machineToGraph(trainingFundMachine);
  const approve = graph.edges.find(edge => edge.data.eventType === 'APPROVE');
  const reject = graph.edges.find(edge => edge.data.eventType === 'REJECT');
  assert.equal(approve?.data.guard, 'newAssignedDecision');
  assert.equal(reject?.data.guard, 'newAssignedDecision');
  assert.ok(graph.edges.some(edge => edge.data.guard === 'approvalMajority' && edge.targetId === 'trainingFund.payment'));
  assert.ok(graph.edges.some(edge => edge.data.guard === 'rejectionMajority' && edge.targetId === 'trainingFund.notify_rejection'));
  const html = render(trainingFundMachine);

  for (const label of ['training-fund-approvers', 'APPROVE', 'REJECT', 'paymentFlow', 'offer_appeal', 'awaiting_appeal', 'email_trustee_agenda', 'appeal_referred', 'TRUSTEE_AGENDA_EMAIL_SENT']) assert.ok(html.includes(label), label);
  assert.equal((html.match(/data-testid="state-card"/g) ?? []).length, graph.nodes.length - 1);

  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(html.includes(`id="${target}"`));
});

test('Sketch renders the shared payment definition separately from its caller', () => {
  const graph = machineToGraph(trainingFundMachine);
  assert.deepEqual(graph.nodes.find(node => node.id === 'trainingFund.payment')?.data.invocations, ['paymentFlow']);
  assert.ok(graph.edges.some(edge => edge.data.eventType === 'xstate.done.actor.payment' && edge.targetId === 'trainingFund.paid'));
  const html = render(paymentFlowMachine, 'payment-diagram');

  for (const label of ['district-treasurer', 'resolve_treasurer', 'ROLE_USERS_RESOLVED', 'request_details', 'awaiting_details', 'DETAILS_RECEIVED', 'create_payment_task', 'awaiting_payment', 'RECORD_PAYMENT', 'paid']) assert.ok(html.includes(label), label);
  assert.equal((html.match(/data-testid="state-card"/g) ?? []).length, 6);
});

test('Sketch preserves nested and parallel states, entry actions and scoped target links', () => {
  const machine = createMachine({ id: 'nested', initial: 'working', states: {
    working: { type: 'parallel', states: {
      review: { initial: 'pending', states: {
        pending: { entry: 'notify', on: { APPROVE: 'approved' } }, approved: { type: 'final' },
      } },
      payment: { initial: 'waiting', states: { waiting: { on: { PAY: 'paid' } }, paid: { type: 'final' } } },
    } },
  } });

  const html = render(machine, 'nested-flow');
  assert.ok(html.includes('Parallel states'));
  assert.ok(html.includes('notify'));
  assert.equal((html.match(/data-testid="state-card"/g) ?? []).length, 7);

  for (const [, target] of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(target.startsWith('nested-flow-'));
    assert.ok(html.includes(`id="${target}"`));
  }
});
