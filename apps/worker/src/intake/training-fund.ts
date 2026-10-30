import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { Client, Connection, WorkflowIdReusePolicy, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { setTimeout as delay } from 'node:timers/promises';
import { connectionOptions, namespace, taskQueue } from '@district/integrations/temporal/config';
import { trainingFundRepository, closeDatabase } from '@district/persistence/runtime';
import { consumeApplication } from '@district/application/training-fund/intake';
import { loadRouting, required } from '@district/integrations/training-fund/settings';

async function main() {
  const queueUrl = required('TRAINING_FUND_QUEUE_URL');
  const repository = trainingFundRepository();
  loadRouting(); // Fail fast on invalid initial routing; reload for each new message.
  const connection = await Connection.connect(connectionOptions);
  const client = new Client({ connection, namespace });
  const sqs = new SQSClient({});
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    while (!stopping) {
      try {
        const result = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 20, MaxNumberOfMessages: 1, VisibilityTimeout: 120 }));
        for (const message of result.Messages ?? []) {
          if (!message.Body || !message.ReceiptHandle) continue;
          try {
            const outcome = await consumeApplication(message.Body, loadRouting(), {
              alreadyRecorded: application => repository.alreadyRecorded(application),
              isDuplicate: error => error instanceof WorkflowExecutionAlreadyStartedError,
              start: (application, routing, workflowId) => connection.withDeadline(Date.now() + 30000, () => client.workflow.start('trainingFundWorkflow', {
                workflowId, taskQueue, args: [application, routing, { persistState: true }], workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
              })),
              acknowledge: () => sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle })),
            });
            console.info('Training Fund intake', { messageId: message.MessageId, outcome });
          } catch {
            // Leave failed/invalid messages for retry and the queue's redrive policy.
            // Do not print payloads, applicant information or capability tokens.
            console.error('Training Fund intake failed; message retained for retry/DLQ', { messageId: message.MessageId });
          }
        }
      } catch {
        console.error('SQS polling failed; retrying in five seconds');
        if (!stopping) await delay(5000);
      }
    }
  } finally { sqs.destroy(); await connection.close(); await closeDatabase(); }
}
main().catch(() => { console.error('Training Fund consumer failed to start; check configuration and connectivity'); process.exitCode = 1; });
