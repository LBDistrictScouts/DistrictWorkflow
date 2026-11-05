// Compatibility definition for the currently deployed Temporal orchestration.
// The complete process definition is in machine.ts.
import { assign, initialTransition, setup, transition } from 'xstate';
import type { Payment, TrainingFundApplication, TrainingFundRouting, TrainingFundState } from '@district/contracts/training-fund/types';

type Context = Omit<TrainingFundState, 'status'>;

type Event =
  | { type: 'APPROVE'; personId: string; at: string }
  | { type: 'RECORD_PAYMENT'; payment: Payment };

// Pure transitions only: Temporal owns timers, notifications and durable replay.
export const runtimeTrainingFundMachine = setup({
  types: {
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    context: {} as Context,
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    // oxlint-disable-next-line anti-slop/no-known-value-widening -- XState setup uses this declaration solely to supply machine types, not as runtime data.
    input: {} as { application: TrainingFundApplication; routing: TrainingFundRouting; requiredApprovals?: number },
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    events: {} as Event,
  },
  guards: {
    approvalQuorumReached: ({ context }) => context.routing.approvers.filter(person =>
      context.approvals.some(approval => approval.personId === person.id)).length
      >= (context.requiredApprovals ?? context.routing.approvers.length),
    newAssignedApproval: ({ context, event }) => event.type === 'APPROVE'
      && context.routing.approvers.some(person => person.id === event.personId)
      && !context.approvals.some(approval => approval.personId === event.personId),
    assignedTreasurer: ({ context, event }) => event.type === 'RECORD_PAYMENT'
      && context.routing.treasurer.id === event.payment.personId,
  },
}).createMachine({
  id: 'trainingFund',
  initial: 'awaiting_approvals',
  context: ({ input }) => ({ ...input, approvals: [] }),
  states: {
    awaiting_approvals: {
      meta: { title: 'Review application' },
      description: 'Two of the three assigned district reviewers must approve the application.',
      on: {
        APPROVE: {
          meta: { label: 'Record an assigned reviewer’s approval' },
          guard: 'newAssignedApproval',
          actions: assign(({ context, event }) => ({
            approvals: [...context.approvals, { personId: event.personId, approvedAt: event.at }],
          })),
        },
      },
      always: { guard: 'approvalQuorumReached', target: 'awaiting_payment', meta: { label: 'Required approval majority reached' } },
    },
    awaiting_payment: {
      meta: { title: 'Arrange payment' },
      description: 'The district treasurer arranges and records payment.',
      on: {
        RECORD_PAYMENT: {
          meta: { label: 'Treasurer records payment' },
          guard: 'assignedTreasurer',
          target: 'paid',
          actions: assign(({ event }) => ({ payment: event.payment })),
        },
      },
    },
    paid: { type: 'final', meta: { title: 'Paid' }, description: 'Payment is recorded and the workflow is complete.' },
  },
});

export function initialTrainingFundState(application: TrainingFundApplication, routing: TrainingFundRouting, policy: 'majority' | 'unanimous' = 'majority'): TrainingFundState {
  const [snapshot] = initialTransition(runtimeTrainingFundMachine, { application, routing,
    // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
    ...(policy === 'majority' ? { requiredApprovals: Math.floor(routing.approvers.length / 2) + 1 } : {}),
  });

  // SAFETY: This flat machine declares exactly the states in the domain status union.
  return { ...snapshot.context, status: snapshot.value as TrainingFundState['status'] };
}

// Retain the existing serializable query/API contract; no actor internals escape.
export function transitionTrainingFund(state: TrainingFundState, event: Event, invalidMessage: string): void {
  const { status, ...context } = state;
  const snapshot = runtimeTrainingFundMachine.resolveState({ value: status, context });

  if (!snapshot.can(event)) throw new Error(invalidMessage);
  const [next] = transition(runtimeTrainingFundMachine, snapshot, event);
  Object.assign(state, next.context, { status: next.value });
}
