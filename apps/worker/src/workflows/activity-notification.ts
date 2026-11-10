import { condition, continueAsNew, defineSignal, defineQuery, ParentClosePolicy, patched, proxyActivities, setHandler, sleep, startChild, workflowInfo, WorkflowIdReusePolicy } from '@temporalio/workflow';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/common';
import { approveActivityNotification, type ActivityNotificationStage } from '@district/domain/activity-notification/machine';
import type { QueuedActivityNotification } from '@district/contracts/activity-notification/types';
import type * as activities from '../activities/activity-notification';
import type { notifyActivityApprovalApplicant } from '../activities/email-notifications/activity-notification';

const queue = proxyActivities<Pick<typeof activities, 'receiveActivityNotification' | 'acknowledgeActivityNotification' | 'recordActivityNotification'>>({ startToCloseTimeout: '40 seconds', retry: { maximumAttempts: 1 } });
const notifications = proxyActivities<{ notifyActivityApprovalApplicant: typeof notifyActivityApprovalApplicant }>({ startToCloseTimeout: '30 seconds', retry: { initialInterval: '10 seconds', maximumInterval: '10 minutes' } });
const cases = proxyActivities<Pick<typeof activities, 'initializeActivityApproval' | 'finishActivityIfApproved'>>({ startToCloseTimeout: '30 seconds' });

export async function activityNotificationIntakeWorkflow(environment: QueuedActivityNotification['environment']): Promise<void> {
  for (let received = 0; received < 100; received++) {
    try {
      const message = await queue.receiveActivityNotification(environment);

      if (!message) continue;
      const result = await queue.recordActivityNotification(message.submission);

      try {
        await startChild(activityNotificationWorkflow, {
          workflowId: `activity-notification-${environment}-${message.submission.notification.idempotenceKey}`,
          args: [result.caseId], parentClosePolicy: ParentClosePolicy.ABANDON,
          workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
        });
      } catch (error) {
        if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      }

      // The case is committed and Temporal durably owns its approval lifecycle.
      await queue.acknowledgeActivityNotification(message.receiptHandle);
    } catch {
      // Failed or conflicting receipts stay on SQS for retry/redrive. Keep polling other submissions.
      await sleep('5 seconds');
    }
  }

  await continueAsNew<typeof activityNotificationIntakeWorkflow>(environment);
}

export async function activityNotificationWorkflow(caseId: string): Promise<ActivityNotificationStage> {
  let stage: ActivityNotificationStage = 'awaiting_approval';
  let changed = false;
  setHandler(defineSignal('activityApprovalChanged'), () => { changed = true; });
  setHandler(defineQuery<ActivityNotificationStage>('activityNotificationState'), () => stage);
  const info = workflowInfo();
  await cases.initializeActivityApproval(caseId, { workflowId: info.workflowId, runId: info.runId, namespace: info.namespace });

  for (let polls = 0; !await cases.finishActivityIfApproved(caseId); polls++) {
    if (polls >= 1000) return continueAsNew<typeof activityNotificationWorkflow>(caseId);
    await condition(() => changed, '30 seconds');
    changed = false;
  }

  stage = approveActivityNotification(stage);

  // Preserve replay for histories that completed before applicant notifications existed.
  if (patched('activity-approval-notification-v1')) await notifications.notifyActivityApprovalApplicant(caseId);

  return stage;
}
