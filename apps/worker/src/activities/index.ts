// Only registered activity functions belong in this registry.
// Keep exported names stable: Temporal records them in workflow history.
export { greet } from './greeting';

export { sendThemedEmail } from './email-notifications';

export { notifyTrainingFundTask } from './email-notifications/training-fund';

export { persistTrainingFundState } from './training-fund-persistence';

export { syncDistrictMembers } from './member-sync';

export { requestSimpleResponse, requestComplexResponse, getResponseResult } from './responses';

export { resolvePaymentTreasurer } from './payments';

export { resolveRoleUser, getMemberProfileByMembershipNumber } from './directory';

export { listTaskDigestRecipients, sendTaskDigest } from './email-notifications/task-digest';

export { listDueResponseReminders, sendResponseReminder } from './email-notifications/response-reminders';

export { initializeAwards, createAwardTask, finishAwardsIfComplete } from './awards';

export { listDueAwardReminders, wakeCompletedAwardImports, sendAwardReminder } from './email-notifications/award-reminders';
