import { assign, setup } from 'xstate';
import type { PaymentFlowInput, PaymentFlowOutput, PaymentFlowEvent, PaymentRecord, PaymentTreasurer } from '@district/contracts/payments/types';

export interface PaymentFlowContext {
  request: PaymentFlowInput;
  treasurer?: PaymentTreasurer;
  detailsTaskId?: string;
  detailsResponseId?: string;
  paymentTaskId?: string;
  payment?: PaymentRecord;
}

const reference = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Reusable definition; Temporal/activity integration acknowledges I/O with events. No money is transferred. */
export const paymentFlowMachine = setup({
  types: {
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    context: {} as PaymentFlowContext,
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    input: {} as PaymentFlowInput,
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    output: {} as PaymentFlowOutput,
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    events: {} as PaymentFlowEvent,
  },
  guards: {
    validTreasurer: ({ event }) => event.type === 'ROLE_USERS_RESOLVED' && event.users.length > 0
      && new Set(event.users.map(user => user.id)).size === 1
      && event.users.every(user => Boolean(user.id.trim() && user.name.trim() && user.appointmentEmail.trim())),
    validDetailsRequest: ({ event }) => event.type === 'DETAILS_REQUESTED' && reference(event.requestId),
    matchingDetailsResponse: ({ context, event }) => event.type === 'DETAILS_RECEIVED' && event.responseId === context.detailsTaskId,
    validPaymentTask: ({ event }) => event.type === 'PAYMENT_TASK_CREATED' && reference(event.taskId),
    assignedTreasurerPayment: ({ context, event }) => event.type === 'RECORD_PAYMENT'
      && event.payment.personId === context.treasurer?.id && Boolean(context.detailsResponseId)
      && event.payment.reference.trim().length > 0 && event.payment.reference.trim().length <= 200
      && /^\d{4}-\d{2}-\d{2}$/.test(event.payment.paidAt) && Number.isFinite(Date.parse(event.payment.paidAt))
      && new Date(event.payment.paidAt).toISOString().slice(0, 10) === event.payment.paidAt
      && Number.isFinite(Date.parse(event.payment.recordedAt)) && event.payment.paidAt <= event.payment.recordedAt.slice(0, 10),
  },
}).createMachine({
  id: 'paymentFlow',
  initial: 'resolve_treasurer',
  description: 'Reusable payment process: request supporting details, receive a protected response, create a treasurer task and record payment.',
  context: ({ input }) => {
    if (!Number.isSafeInteger(input.amountPence) || input.amountPence <= 0 || input.currency !== 'GBP'
      || !input.reference.trim() || !input.payee.name.trim() || !input.payee.email.trim()
      || !input.detailsRequest.purpose.trim() || input.detailsRequest.fields.length === 0) throw new Error('Invalid payment workflow input');

    return { request: input };
  },
  output: ({ context }) => ({ reference: context.request.reference, amountPence: context.request.amountPence,
    currency: context.request.currency, detailsResponseId: context.detailsResponseId!, paymentTaskId: context.paymentTaskId!, payment: context.payment!,
  }),
  states: {
    resolve_treasurer: {
      description: 'Resolve exactly one active user tagged district-treasurer. Deduplicate tagged email addresses by user. Missing or ambiguous membership blocks progress.',
      meta: { activity: 'resolveRoleUser', activityInput: 'district-treasurer' },
      on: { ROLE_USERS_RESOLVED: { guard: 'validTreasurer', target: 'request_details', actions: assign(({ event }) => {
        const user = [...event.users].sort((a, b) => a.appointmentEmail < b.appointmentEmail ? -1 : a.appointmentEmail > b.appointmentEmail ? 1 : 0)[0]!;

        return { treasurer: { id: user.id, name: user.name, email: user.appointmentEmail } };
      }) } },
    },
    request_details: {
      description: 'Request the configured complex form from the payee, respecting their notification preference. The caller supplies the purpose and fields, such as bank details or receipt information.',
      meta: { responseActivity: 'requestComplexResponse', configuration: 'input.detailsRequest' },
      on: { DETAILS_REQUESTED: { guard: 'validDetailsRequest', target: 'awaiting_details', actions: assign(({ event }) => ({ detailsTaskId: event.requestId })) } },
    },
    awaiting_details: {
      description: 'Wait for validated, securely stored supporting details. Keep only the response reference in workflow state and output.',
      on: { DETAILS_RECEIVED: { guard: 'matchingDetailsResponse', target: 'create_payment_task', actions: assign(({ event }) => ({ detailsResponseId: event.responseId })) } },
    },
    create_payment_task: {
      description: 'Create a task for the assigned treasurer with the payee, approved amount, source reference and protected supporting-details reference.',
      on: { PAYMENT_TASK_CREATED: { guard: 'validPaymentTask', target: 'awaiting_payment', actions: assign(({ event }) => ({ paymentTaskId: event.taskId })) } },
    },
    awaiting_payment: {
      description: 'The assigned treasurer pays through the usual banking process and records the reference/date. This workflow does not transfer money.',
      on: { RECORD_PAYMENT: { guard: 'assignedTreasurerPayment', target: 'paid', actions: assign(({ event }) => ({ payment: event.payment })) } },
    },
    paid: { type: 'final', description: 'Payment recorded. Return its audit record and supporting-details reference to the calling workflow.' },
  },
});
