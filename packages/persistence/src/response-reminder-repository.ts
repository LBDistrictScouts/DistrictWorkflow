import { and, eq, isNull, sql } from 'drizzle-orm';
import type { createDatabase } from './client';
import * as s from './schema';

export function createResponseReminderRepository(db: ReturnType<typeof createDatabase>['db']) {
  // Only explicitly dated, still-open response tasks qualify for individual reminders.
  function due(now: Date) {
    return sql`${s.responseRequests.initialEmailSentAt} is not null
      and ${s.responseRequests.completedAt} is null
      and ${s.responseRequests.expiresAt} is not null
      and isfinite(${s.responseRequests.expiresAt})
      and ${s.responseRequests.expiresAt} > ${now}
      and ${s.responseRequests.reminderAttempts} < 2
      and coalesce(${s.responseRequests.lastReminderAttemptAt}, ${s.responseRequests.initialEmailSentAt}) <= ${now}::timestamptz - interval '72 hours'
      and exists (select 1 from tasks t join workflow_executions w on w.id = t.workflow_execution_id
        where t.id = ${s.responseRequests.taskId} and t.status <> 'completed' and w.status = 'running')
      and exists (select 1 from user_emails e join users u on u.id = e.user_id
        left join user_profiles p on p.user_id = u.id
        where e.email = lower(trim(${s.responseRequests.request}->'recipient'->>'email'))
        and u.active = 1 and coalesce(p.task_response_preference, 'response-links') = 'response-links'
        and (select count(*) from user_emails owners where owners.email = e.email) = 1)`;
  }

  return {
    async initialSent(taskId: string) {
      const [row] = await db.select({ sentAt: s.responseRequests.initialEmailSentAt }).from(s.responseRequests).where(eq(s.responseRequests.taskId, taskId));

      return row?.sentAt ?? null;
    },
    async recordInitialSent(taskId: string, now = new Date()) {
      await db.update(s.responseRequests).set({ initialEmailSentAt: now })
        .where(and(eq(s.responseRequests.taskId, taskId), isNull(s.responseRequests.initialEmailSentAt)));
    },
    async dueTaskIds(now = new Date()) {
      return (await db.select({ id: s.responseRequests.taskId }).from(s.responseRequests).where(due(now)).orderBy(s.responseRequests.taskId)).map(row => row.id);
    },
    /** Reserve before SES: concurrent scans and retries cannot send more than two reminders.
     * An ambiguous delivery failure consumes its slot rather than risking a duplicate. */
    async claim(taskId: string, now = new Date()) {
      const [row] = await db.update(s.responseRequests).set({
        reminderAttempts: sql`${s.responseRequests.reminderAttempts} + 1`, lastReminderAttemptAt: now,
      }).where(and(eq(s.responseRequests.taskId, taskId), due(now))).returning({ request: s.responseRequests.request, attempt: s.responseRequests.reminderAttempts });

      return row ?? null;
    },
  };
}
