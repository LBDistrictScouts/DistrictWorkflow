import { parseAwardContext } from '@district/contracts/awards/validation';
import { and, eq, sql } from 'drizzle-orm';
import type { createDatabase } from './client';
import type { AwardContext } from '@district/contracts/awards/types';
import * as s from './schema';

export function createAwardReminderRepository(db: ReturnType<typeof createDatabase>['db']) {
  // Calendar dates and 09:00 are evaluated in London, including DST changes.
  const due = (now: Date) => sql`${s.awardProgress.stage} = 'scheduled' and ${s.tasks.status} <> 'completed'
    and (${now}::timestamptz at time zone 'Europe/London')::time >= time '09:00'
    and (${s.awardProgress.presentationDate} - (${now}::timestamptz at time zone 'Europe/London')::date) in (0, 3)`;

  return {
    async dueTaskIds(now = new Date()) {
      return (await db.select({ id: s.tasks.id }).from(s.tasks).innerJoin(s.awardProgress, eq(s.awardProgress.taskId, s.tasks.id)).where(due(now)).orderBy(s.tasks.id)).map(row => row.id);
    },
    async claim(taskId: string, now = new Date()) {
      return db.transaction(async tx => {
        // Same lock as transitions: a reschedule/completion before claim cancels the old reminder.
        const [row] = await tx.select({ task: s.tasks, progress: s.awardProgress, daysBefore: sql<number>`(${s.awardProgress.presentationDate} - (${now}::timestamptz at time zone 'Europe/London')::date)` })
          .from(s.tasks).innerJoin(s.awardProgress, eq(s.awardProgress.taskId, s.tasks.id)).where(and(eq(s.tasks.id, taskId), due(now))).for('update', { of: s.tasks });

        if (!row) return [];

        const people = await tx.select({ id: s.users.id, name: s.users.name, email: s.userEmails.email }).from(s.users)
          .innerJoin(s.userEmails, eq(s.userEmails.userId, s.users.id)).where(and(eq(s.users.active, 1),
            sql`(select count(*) from user_emails owners where owners.email=${s.userEmails.email}) = 1`,
            row.task.assignedUserId ? eq(s.users.id, row.task.assignedUserId) : sql`exists(select 1 from jsonb_array_elements(${JSON.stringify(row.progress.roleAssignees)}::jsonb) a where a->>'id'=${s.users.id}::text and lower(trim(a->>'appointmentEmail'))=${s.userEmails.email})`)).orderBy(s.users.id, s.userEmails.email);

        const recipients = [...new Map(people.map(person => [person.id, person])).values()];

        if (!recipients.length) throw new Error('Scheduled award has no reachable active assignee');
        const claimed = [];

        for (const person of recipients) {
          const [reminder] = await tx.insert(s.awardReminders).values({ taskId, scheduleRevision: row.progress.scheduleRevision, daysBefore: row.daysBefore, userId: person.id, email: person.email, attemptedAt: now }).onConflictDoNothing().returning();

          if (reminder) claimed.push({ reminderId: reminder.id, taskId, person, daysBefore: row.daysBefore, presentationDate: row.progress.presentationDate!, context: parseAwardContext(row.task.context) });
        }

        return claimed;
      });
    },
    async deliveryResult(id: string, status: 'sent' | 'uncertain') {
      await db.update(s.awardReminders).set({ status }).where(eq(s.awardReminders.id, id));
    },
    async completedImports() {
      return db.select({ workflowId: s.workflowExecutions.temporalWorkflowId }).from(s.workflowExecutions)
        .where(and(eq(s.workflowExecutions.status, 'running'), sql`exists(select 1 from tasks t join award_progress a on a.task_id=t.id where t.workflow_execution_id=${s.workflowExecutions.id})`,
          sql`not exists(select 1 from tasks t where t.workflow_execution_id=${s.workflowExecutions.id} and t.status <> 'completed')`));
    },
  };
}
