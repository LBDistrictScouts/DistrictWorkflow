import { Client, Connection, WorkflowIdReusePolicy, WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { connectionOptions, namespace, taskQueue } from '@district/integrations/temporal/config';
import { required } from '@district/integrations/training-fund/settings';

async function main() {
  required('ACTIVITY_NOTIFICATION_QUEUE_URL');
  const environment = required('ACTIVITY_NOTIFICATION_ENVIRONMENT');

  if (environment !== 'dev' && environment !== 'test' && environment !== 'prod') throw new Error('Invalid activity notification environment');
  const connection = await Connection.connect(connectionOptions);

  try {
    const client = new Client({ connection, namespace });

    try {
      await client.workflow.start('activityNotificationIntakeWorkflow', { workflowId: `activity-notification-intake-${environment}`, taskQueue, args: [environment], workflowIdReusePolicy: WorkflowIdReusePolicy.ALLOW_DUPLICATE });
      console.info('Activity notification Temporal intake started');
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
      console.info('Activity notification Temporal intake is already running');
    }
  } finally { await connection.close(); }
}

main().catch(() => { console.error('Activity notification intake could not start; check Temporal and configuration'); process.exitCode = 1; });
