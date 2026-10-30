export interface TrainingFundApplication {
  schemaVersion: '1.0';
  type: 'district.training-fund.application';
  applicationId: string;
  submittedAt: string;
  applicant: { name: string; email: string; membershipNumber?: string; group: string; role: string };
  course: { title: string; provider: string; startDate: string; location: string; costPence: number };
  funding: { requestedPence: number; reason: string; benefit: string; otherFunding?: string };
  declaration: true;
  submission?: { channel: 'members' } | {
    channel: 'staff'; receivedVia: 'email' | 'phone' | 'post' | 'other';
    receivedAt: string; reference: string;
    registeredBy: { id: string; name: string }; registeredAt: string;
  };
}
export interface Person { id: string; name: string; email: string }
export interface TrainingFundRouting { approvers: Person[]; treasurer: Person }
export interface Approval { personId: string; approvedAt: string }
export interface Payment { personId: string; reference: string; paidAt: string; recordedAt: string }
export interface TrainingFundState {
  application: TrainingFundApplication;
  routing: TrainingFundRouting;
  status: 'awaiting_approvals' | 'awaiting_payment' | 'paid';
  approvals: Approval[];
  payment?: Payment;
}
export interface TaskIdentity { workflowId: string; personId: string; role: 'approver' | 'treasurer'; expiresAt: number }
export type TaskAction = { action: 'view' } | { action: 'approve' } | { action: 'record-payment'; reference: string; paidAt: string };
export interface TaskView { state: TrainingFundState; personId: string; role: TaskIdentity['role'] }
