export interface TrainingFundApplication {
  schemaVersion: '1.0' | '1.1';
  type: 'district.training-fund.application';
  applicationId: string;
  submittedAt: string;
  applicant: { userId?: string; name: string; email: string; membershipNumber?: string; group?: string; role?: string };
  course: { title: string; provider: string; startDate: string; location: string; costPence: number };
  funding: { requestedPence: number; reason: string; benefit: string; otherFunding?: string };
  declaration: true;
  submission?: { channel: 'members' } | {
    channel: 'staff'; receivedVia: 'email' | 'phone' | 'post' | 'other';
    receivedAt: string; reference?: string;
    registeredBy: { id: string; name: string }; registeredAt: string;
  };
}

export interface Person { id: string; name: string; email: string }

export interface TrainingFundRouting { approvers: Person[]; treasurer: Person }

export interface Approval { personId: string; approvedAt: string }

export type Payment = import('../payments/types').PaymentRecord;

export interface TrainingFundState {
  application: TrainingFundApplication;
  routing: TrainingFundRouting;
  status: 'awaiting_approvals' | 'awaiting_payment' | 'paid';
  /** Missing on legacy workflows, which require every assigned approver. */
  requiredApprovals?: number;
  approvals: Approval[];
  payment?: Payment;
}

export interface TaskIdentity { workflowId: string; personId: string; role: 'approver' | 'treasurer'; expiresAt: number }

export type TaskAction = { action: 'view' } | { action: 'approve' } | { action: 'record-payment'; reference: string; paidAt: string };

export interface TaskView { state: TrainingFundState; personId: string; role: TaskIdentity['role'] }

/** Browser submission: the server resolves directory-owned applicant details. */
export type TrainingFundFormInput = Omit<TrainingFundApplication, 'schemaVersion' | 'applicant'> & {
  schemaVersion: '1.1';
  applicant: { userId: string };
};
