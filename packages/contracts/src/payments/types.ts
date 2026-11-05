import type { RoleUser } from '../directory/types';
import type { ResponseField } from '../responses/types';

export interface PaymentTreasurer { id: string; name: string; email: string }

export interface PaymentRecord { personId: string; reference: string; paidAt: string; recordedAt: string }

export interface PaymentDetailsRequest {
  purpose: string;
  subject: string;
  heading: string;
  instructions: string;
  fields: ResponseField[];
}

export interface PaymentFlowInput {
  reference: string;
  amountPence: number;
  currency: 'GBP';
  payee: { name: string; email: string };
  detailsRequest: PaymentDetailsRequest;
}

export interface PaymentFlowOutput {
  reference: string;
  amountPence: number;
  currency: 'GBP';
  detailsResponseId: string;
  paymentTaskId: string;
  payment: PaymentRecord;
}

export type PaymentFlowEvent =
  | { type: 'ROLE_USERS_RESOLVED'; users: RoleUser[] }
  | { type: 'DETAILS_REQUESTED'; requestId: string }
  | { type: 'DETAILS_RECEIVED'; responseId: string }
  | { type: 'PAYMENT_TASK_CREATED'; taskId: string }
  | { type: 'RECORD_PAYMENT'; payment: PaymentRecord };
