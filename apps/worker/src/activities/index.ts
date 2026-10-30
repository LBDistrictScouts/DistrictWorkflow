// Only registered activity functions belong in this registry.
// Keep exported names stable: Temporal records them in workflow history.
export { greet } from './greeting';
export { sendThemedEmail } from './email-notifications';
export { notifyTrainingFundTask } from './email-notifications/training-fund';
export { persistTrainingFundState } from './training-fund-persistence';

export { syncDistrictMembers } from './member-sync';
