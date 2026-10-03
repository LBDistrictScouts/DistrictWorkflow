import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { connectionOptions, namespace, taskQueue } from './config';

async function main(): Promise<void> {
  const connection = await NativeConnection.connect(connectionOptions);
  try {
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue,
      workflowsPath: require.resolve('./workflows'),
      activities,
    });
    // The SDK handles SIGINT/SIGTERM and drains in-flight work.
    await worker.run();
  } finally {
    await connection.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
