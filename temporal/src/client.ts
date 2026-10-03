import { randomUUID } from 'node:crypto';
import { Client, Connection } from '@temporalio/client';
import { connectionOptions, namespace, taskQueue } from './config';
import type { greetingWorkflow } from './workflows';

async function main(): Promise<void> {
  const connection = await Connection.connect(connectionOptions);
  try {
    const client = new Client({ connection, namespace });
    const handle = await client.workflow.start<typeof greetingWorkflow>('greetingWorkflow', {
      taskQueue,
      workflowId: `greeting-${randomUUID()}`,
      args: [process.argv[2] || 'DistrictWorkflow'],
      workflowExecutionTimeout: '1 minute',
    });
    console.log(`Started workflow: ${handle.workflowId}`);
    console.log(await handle.result());
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
