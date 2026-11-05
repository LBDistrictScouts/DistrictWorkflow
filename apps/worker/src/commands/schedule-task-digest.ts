
import { Client, Connection, ScheduleOverlapPolicy, ScheduleAlreadyRunning } from '@temporalio/client';
import { connectionOptions, namespace, taskQueue } from '@district/integrations/temporal/config';

async function main() {
  const connection = await Connection.connect(connectionOptions);

  try {
    const client = new Client({ connection, namespace });

    try {
      await client.schedule.create({
        scheduleId: 'district-task-digest-72h',
        spec: { intervals: [{ every: '72 hours', offset: Date.now() % (72 * 60 * 60 * 1000) }], startAt: new Date(Date.now() + 72 * 60 * 60 * 1000) },
        action: { type: 'startWorkflow', workflowType: 'taskDigestWorkflow', taskQueue, args: [], workflowExecutionTimeout: '2 hours' },
        policies: { overlap: ScheduleOverlapPolicy.SKIP },
      });
      console.log('Created task digest schedule every 72 hours; initial window starts in 72 hours');
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) throw error;
      console.log('Task digest schedule already exists; left unchanged');
    }
  } finally { await connection.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
