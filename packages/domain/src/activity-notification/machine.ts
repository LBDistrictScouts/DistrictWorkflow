import { createMachine, getNextSnapshot } from 'xstate';

export type ActivityNotificationStage = 'awaiting_approval' | 'approved';

export const activityNotificationMachine = createMachine({
  id: 'activity-notification', initial: 'awaiting_approval', states: {
    awaiting_approval: { description: 'Awaiting first approval', on: { APPROVE: 'approved' } },
    approved: { description: 'Activity approved', type: 'final' },
  },
});

export function approveActivityNotification(stage: ActivityNotificationStage): ActivityNotificationStage {
  const snapshot = activityNotificationMachine.resolveState({ value: stage, context: {} });

  if (!snapshot.can({ type: 'APPROVE' })) throw new TypeError('Activity has already been approved');

  // SAFETY: The flat machine has exactly the two states declared in ActivityNotificationStage.
  return getNextSnapshot(activityNotificationMachine, snapshot, { type: 'APPROVE' }).value as ActivityNotificationStage;
}
