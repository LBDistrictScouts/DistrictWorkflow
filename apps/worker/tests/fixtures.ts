import type { TrainingFundApplication, TrainingFundRouting, TrainingFundState } from '@district/contracts/training-fund/types';
export const application: TrainingFundApplication = {
  schemaVersion: '1.0', type: 'district.training-fund.application',
  applicationId: '10000000-0000-4000-8000-000000000001', submittedAt: '2026-10-05T10:00:00Z',
  applicant: { name: 'Example Volunteer', email: 'volunteer@example.org', group: 'Example Scout Group', role: 'Team member' },
  course: { title: 'Outdoor first aid', provider: 'Example Training', startDate: '2026-11-01', location: 'Hertfordshire', costPence: 15000 },
  funding: { requestedPence: 10000, reason: 'Support with course fees', benefit: 'Provide first aid cover for activities', otherFunding: 'Group contributes £50' },
  declaration: true,
};
export const routing: TrainingFundRouting = {
  approvers: [1, 2, 3].map(n => ({ id: `reviewer-${n}`, name: `Reviewer ${n}`, email: `reviewer-${n}@example.org` })),
  treasurer: { id: 'treasurer', name: 'Treasurer', email: 'treasurer@example.org' },
};
export const makeState = (): TrainingFundState => structuredClone({ application, routing, status: 'awaiting_approvals', approvals: [] });
