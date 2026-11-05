
import { Client, Connection, ScheduleOverlapPolicy, ScheduleAlreadyRunning } from '@temporalio/client';
import { connectionOptions, namespace, taskQueue } from '@district/integrations/temporal/config';

async function main() {
  const connection = await Connection.connect(connectionOptions);

  try {
    const client = new Client({ connection, namespace });

    try {
      await client.schedule.create({
        scheduleId: 'district-award-reminders',
        spec: { intervals: [{ every: '15 minutes' }] },
        action: { type: 'startWorkflow', workflowType: 'awardRemindersWorkflow', taskQueue, args: [], workflowExecutionTimeout: '2 hours' },
        policies: { overlap: ScheduleOverlapPolicy.SKIP },
      });
      console.log('Created award reminder scan every 15 minutes');
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) throw error;
      console.log('Award reminder schedule already exists; left unchanged');
    }
  } finally { await connection.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
