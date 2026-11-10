import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { parseActivityNotification } from '@district/contracts/activity-notification/validation';
import type { QueuedActivityNotification } from '@district/contracts/activity-notification/types';
import { activityNotificationRepository } from '@district/persistence/runtime';

function queueUrl() {
  const url = process.env.ACTIVITY_NOTIFICATION_QUEUE_URL;

  if (!url) throw new Error('ACTIVITY_NOTIFICATION_QUEUE_URL is required');

  return url;
}

export async function receiveActivityNotification(environment: QueuedActivityNotification['environment']) {
  const sqs = new SQSClient({});

  try {
    const result = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl(), WaitTimeSeconds: 20, MaxNumberOfMessages: 1, VisibilityTimeout: 120 }));
    const message = result.Messages?.[0];

    if (!message?.Body || !message.ReceiptHandle) return null;

    try {
      const submission = parseActivityNotification(JSON.parse(message.Body));

      if (submission.environment !== environment) throw new Error('Environment mismatch');

      return { submission, receiptHandle: message.ReceiptHandle };
    } catch {
      console.error('Invalid activity notification retained for retry/DLQ', { messageId: message.MessageId });

      return null;
    }
  } finally { sqs.destroy(); }
}

export async function acknowledgeActivityNotification(receiptHandle: string) {
  const sqs = new SQSClient({});

  try { await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl(), ReceiptHandle: receiptHandle })); }
  finally { sqs.destroy(); }
}

export async function recordActivityNotification(submission: QueuedActivityNotification) {
  return activityNotificationRepository().record(parseActivityNotification(submission));
}

export async function initializeActivityApproval(caseId: string, identity: { workflowId: string; runId: string; namespace: string }) {
  return activityNotificationRepository().initialize(caseId, identity);
}

export async function finishActivityIfApproved(caseId: string) {
  return activityNotificationRepository().finishIfApproved(caseId);
}
