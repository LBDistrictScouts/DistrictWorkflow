import { closeDatabase } from '@district/persistence/runtime';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities/index';
import { connectionOptions, namespace, taskQueue } from '@district/integrations/temporal/config';

async function main(): Promise<void> {
  const connection = await NativeConnection.connect(connectionOptions);
  try {
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue,
      workflowsPath: require.resolve('./workflows/index'),
      activities,
    });
    // The SDK handles SIGINT/SIGTERM and drains in-flight work.
    await worker.run();
  } finally {
    await connection.close();
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
