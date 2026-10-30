import { assign, initialTransition, setup, transition } from 'xstate';
import type { Payment, TrainingFundApplication, TrainingFundRouting, TrainingFundState } from '@district/contracts/training-fund/types';

type Context = Omit<TrainingFundState, 'status'>;
type Event =
  | { type: 'APPROVE'; personId: string; at: string }
  | { type: 'RECORD_PAYMENT'; payment: Payment };

// Pure transitions only: Temporal owns timers, notifications and durable replay.
export const trainingFundMachine = setup({
  types: {
    context: {} as Context,
    input: {} as { application: TrainingFundApplication; routing: TrainingFundRouting },
    events: {} as Event,
  },
  guards: {
    allApproved: ({ context }) => context.routing.approvers.every(person =>
      context.approvals.some(approval => approval.personId === person.id)),
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
      on: {
        APPROVE: {
          guard: 'newAssignedApproval',
          actions: assign(({ context, event }) => ({
            approvals: [...context.approvals, { personId: event.personId, approvedAt: event.at }],
          })),
        },
      },
      always: { guard: 'allApproved', target: 'awaiting_payment' },
    },
    awaiting_payment: {
      on: {
        RECORD_PAYMENT: {
          guard: 'assignedTreasurer',
          target: 'paid',
          actions: assign(({ event }) => ({ payment: event.payment })),
        },
      },
    },
    paid: { type: 'final' },
  },
});

export function initialTrainingFundState(application: TrainingFundApplication, routing: TrainingFundRouting): TrainingFundState {
  const [snapshot] = initialTransition(trainingFundMachine, { application, routing });
  return { ...snapshot.context, status: snapshot.value as TrainingFundState['status'] };
}

// Retain the existing serializable query/API contract; no actor internals escape.
export function transitionTrainingFund(state: TrainingFundState, event: Event, invalidMessage: string): void {
  const { status, ...context } = state;
  const snapshot = trainingFundMachine.resolveState({ value: status, context });
  if (!snapshot.can(event)) throw new Error(invalidMessage);
  const [next] = transition(trainingFundMachine, snapshot, event);
  Object.assign(state, next.context, { status: next.value });
}
