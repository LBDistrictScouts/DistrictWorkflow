
import { Client, Connection, ScheduleOverlapPolicy, ScheduleAlreadyRunning } from '@temporalio/client';
import { connectionOptions, namespace, taskQueue } from '@district/integrations/temporal/config';
async function main() {
  const connection = await Connection.connect(connectionOptions);
  try {
    const client = new Client({ connection, namespace });
    try {
      await client.schedule.create({
        scheduleId: 'district-member-sync-daily',
        spec: { calendars: [{ hour: 3, minute: 0 }], timezone: 'Europe/London' },
        action: { type: 'startWorkflow', workflowType: 'memberSyncWorkflow', taskQueue, args: [], workflowExecutionTimeout: '2 hours' },
        policies: { overlap: ScheduleOverlapPolicy.SKIP },
        state: { triggerImmediately: true },
      });
      console.log('Created daily member sync at 03:00 Europe/London and triggered initial sync');
    } catch (error) {
      if (!(error instanceof ScheduleAlreadyRunning)) throw error;
      console.log('Member sync schedule already exists; left unchanged');
    }
  } finally { await connection.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
