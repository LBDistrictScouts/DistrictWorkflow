
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/member-sync';
const { syncDistrictMembers } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  retry: { maximumAttempts: 3 },
});
export async function memberSyncWorkflow() { return syncDistrictMembers(); }
