import { assign, sendTo, setup } from 'xstate';
import { paymentFlowMachine } from '../payments/machine';
import type { PaymentFlowEvent, PaymentFlowOutput } from '@district/contracts/payments/types';
import type { Payment, Person, TrainingFundApplication } from '@district/contracts/training-fund/types';

export interface TrainingFundProcessContext {
  application: TrainingFundApplication;
  approvers: Person[];
  requiredDecisions: number;
  decisions: { personId: string; decision: 'approve' | 'reject'; at: string }[];
  approvalTaskId?: string;
  paymentResult?: PaymentFlowOutput;
  appealTaskId?: string;
  appealResponseId?: string;
  trusteeAgendaMessageId?: string;
  payment?: Payment;
}

export type TrainingFundProcessEvent =
  | { type: 'START' }
  | { type: 'APPROVAL_SETUP_COMPLETED'; approvalTaskId: string; approvers: Person[] }
  | { type: 'APPROVE' | 'REJECT'; personId: string; at: string }
  | PaymentFlowEvent
  | { type: 'REJECTION_NOTIFIED' }
  | { type: 'APPEAL_REQUESTED'; requestId: string }
  | { type: 'APPEAL_RECEIVED'; responseId: string }
  | { type: 'TRUSTEE_AGENDA_EMAIL_SENT'; messageId: string };

const reference = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const hasMajority = (context: TrainingFundProcessContext, decision: 'approve' | 'reject') =>
  context.requiredDecisions > 0 && context.decisions.filter(item => item.decision === decision).length >= context.requiredDecisions;

/** Full agreed process. I/O acknowledgements are explicit events: this machine itself sends no emails or creates tasks. */
export const trainingFundMachine = setup({
  types: {
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    context: {} as TrainingFundProcessContext,
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    // oxlint-disable-next-line anti-slop/no-known-value-widening -- XState setup uses this declaration solely to supply machine types, not as runtime data.
    input: {} as { application: TrainingFundApplication },
    // SAFETY: XState setup uses these assertions only as type declarations; runtime data is provided by machine input.
    events: {} as TrainingFundProcessEvent,
  },
  actors: { paymentFlow: paymentFlowMachine },
  guards: {
    validApprovalSetup: ({ event }) => {
      if (event.type !== 'APPROVAL_SETUP_COMPLETED' || !reference(event.approvalTaskId) || event.approvers.length === 0) return false;
      const people = event.approvers;

      return people.every(person => person.id.trim() && person.name.trim() && person.email.trim())
        && new Set(people.map(person => person.id)).size === people.length
        && new Set(people.map(person => person.email.trim().toLowerCase())).size === people.length;
    },
    newAssignedDecision: ({ context, event }) => (event.type === 'APPROVE' || event.type === 'REJECT')
      && Number.isFinite(Date.parse(event.at))
      && context.approvers.some(person => person.id === event.personId)
      && !context.decisions.some(decision => decision.personId === event.personId),
    approvalMajority: ({ context }) => hasMajority(context, 'approve'),
    rejectionMajority: ({ context }) => hasMajority(context, 'reject'),
    validAppealRequest: ({ event }) => event.type === 'APPEAL_REQUESTED' && reference(event.requestId),
    matchingAppealResponse: ({ context, event }) => event.type === 'APPEAL_RECEIVED' && event.responseId === context.appealTaskId,
    acceptedAgendaEmail: ({ event }) => event.type === 'TRUSTEE_AGENDA_EMAIL_SENT' && event.messageId.trim().length > 0,
  },
  actions: {
    recordDecision: assign(({ context, event }) => (event.type === 'APPROVE' || event.type === 'REJECT') ? {
      decisions: [...context.decisions, { personId: event.personId, decision: event.type === 'APPROVE' ? 'approve' as const : 'reject' as const, at: event.at }],
    } : {}),
  },
}).createMachine({
  id: 'trainingFund',
  initial: 'received',
  description: 'Training Fund process definition: tag-based majority decisions, bank details, payment, rejection and appeal referral.',
  context: ({ input }) => ({ application: input.application, approvers: [], requiredDecisions: 0, decisions: [] }),
  states: {
    received: {
      description: 'Receive and validate the application with a stable submission reference.',
      on: { START: 'setup_approval' },
    },
    setup_approval: {
      description: 'Snapshot active users tagged training-fund-approvers. Create one shared approval task with individual assignments and simple Approve/Reject responses, respecting notification preferences.',
      meta: { roleResolutionActivity: 'resolveRoleUser', approverTag: 'training-fund-approvers', responseActivity: 'requestSimpleResponse', taskModel: 'shared-task-individual-assignments' },
      on: { APPROVAL_SETUP_COMPLETED: {
        guard: 'validApprovalSetup', target: 'awaiting_decisions',
        actions: assign(({ event }) => ({ approvers: event.approvers, approvalTaskId: event.approvalTaskId, requiredDecisions: Math.floor(event.approvers.length / 2) + 1 })),
      } },
    },
    awaiting_decisions: {
      description: 'Each assigned user decides once. A strict majority approves or rejects; missing responses remain pending. Close outstanding assignments once an outcome is reached.',
      on: {
        APPROVE: { guard: 'newAssignedDecision', actions: 'recordDecision' },
        REJECT: { guard: 'newAssignedDecision', actions: 'recordDecision' },
      },
      always: [
        { guard: 'approvalMajority', target: 'payment' },
        { guard: 'rejectionMajority', target: 'notify_rejection' },
      ],
    },
    payment: {
      description: 'Invoke the reusable payment workflow with a bank-details form for this approved Training Fund application.',
      invoke: {
        id: 'payment', src: 'paymentFlow',
        input: ({ context }) => ({
          reference: context.application.applicationId, amountPence: context.application.funding.requestedPence, currency: 'GBP' as const,
          payee: { name: context.application.applicant.name, email: context.application.applicant.email },
          detailsRequest: {
            purpose: 'bank-details', subject: 'Training Fund: bank details required', heading: 'Your application has been approved',
            instructions: 'Provide your bank details so the district treasurer can arrange payment.',
            fields: [
              { name: 'accountName', label: 'Account holder name', type: 'text' as const, required: true, maxLength: 200 },
              { name: 'sortCode', label: 'Sort code (6 digits)', type: 'text' as const, required: true, pattern: '^[0-9]{6}$', maxLength: 6 },
              { name: 'accountNumber', label: 'Account number (8 digits)', type: 'text' as const, required: true, pattern: '^[0-9]{8}$', maxLength: 8 },
            ],
          },
        }),
        onDone: { target: 'paid', actions: assign(({ event }) => ({ paymentResult: event.output, payment: event.output.payment })) },
      },
      on: {
        ROLE_USERS_RESOLVED: { actions: sendTo('payment', ({ event }) => event) },
        DETAILS_REQUESTED: { actions: sendTo('payment', ({ event }) => event) },
        DETAILS_RECEIVED: { actions: sendTo('payment', ({ event }) => event) },
        PAYMENT_TASK_CREATED: { actions: sendTo('payment', ({ event }) => event) },
        RECORD_PAYMENT: { actions: sendTo('payment', ({ event }) => event) },
      },
    },
    paid: { type: 'final', description: 'Payment recorded. The successful application is complete.' },
    notify_rejection: {
      description: 'Notify the applicant that a majority rejected the application.',
      meta: { notificationActivity: 'sendThemedEmail' },
      on: { REJECTION_NOTIFIED: 'offer_appeal' },
    },
    offer_appeal: {
      description: 'Email the applicant a complex response form for their appeal statement.',
      meta: { responseActivity: 'requestComplexResponse', purpose: 'appeal' },
      on: { APPEAL_REQUESTED: { guard: 'validAppealRequest', target: 'awaiting_appeal', actions: assign(({ event }) => ({ appealTaskId: event.requestId })) } },
    },
    awaiting_appeal: {
      description: 'Wait for an appeal statement. No automatic deadline or no-response rejection is defined.',
      on: { APPEAL_RECEIVED: { guard: 'matchingAppealResponse', target: 'email_trustee_agenda', actions: assign(({ event }) => ({ appealResponseId: event.responseId })) } },
    },
    email_trustee_agenda: {
      description: 'Email the saved appeal and application reference to TRAINING_FUND_TRUSTEE_AGENDA_EMAIL. Wait for email acceptance; exclude bank details.',
      meta: { notificationActivity: 'sendThemedEmail', recipientSetting: 'TRAINING_FUND_TRUSTEE_AGENDA_EMAIL' },
      on: { TRUSTEE_AGENDA_EMAIL_SENT: { guard: 'acceptedAgendaEmail', target: 'appeal_referred', actions: assign(({ event }) => ({ trusteeAgendaMessageId: event.messageId })) } },
    },
    appeal_referred: { type: 'final', description: 'Appeal referred to the Trustee Agenda by email. The later trustee decision is outside this process.' },
  },
});

// Preserve the existing state/query API until Temporal adopts the complete process.
export { initialTrainingFundState, transitionTrainingFund } from './runtime-machine';
