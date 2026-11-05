import { and, eq, ne, sql } from 'drizzle-orm';
import type { createDatabase } from './client';
import * as s from './schema';

export function createTaskDigestRepository(db: ReturnType<typeof createDatabase>['db']) {
  return {
    async recipients() {
      const rows = await db.select({ id: s.users.id, name: s.users.name, displayName: s.userProfiles.displayName, email: s.userEmails.email })
        .from(s.userProfiles).innerJoin(s.users, eq(s.users.id, s.userProfiles.userId))
        .innerJoin(s.userEmails, eq(s.userEmails.userId, s.users.id))
        .where(and(eq(s.users.active, 1), eq(s.userProfiles.taskResponsePreference, 'task-notification'),
          sql`(select count(*) from user_emails owners where owners.email = ${s.userEmails.email}) = 1`))
        .orderBy(s.users.id, s.userEmails.email);

      const recipients = new Map<string, { id: string; name: string; emails: string[] }>();

      for (const row of rows) {
        const person = recipients.get(row.id) ?? { id: row.id, name: row.displayName ?? row.name, emails: [] };
        person.emails.push(row.email); recipients.set(row.id, person);
      }

      return [...recipients.values()];
    },
    async tasks(userId: string) {
      // Response assignments are recipient-specific; tag membership must not broaden them.
      const rows = await db.select({ id: s.tasks.id, title: s.workflowSteps.name, status: s.tasks.status, request: s.responseRequests.request })
        .from(s.tasks).innerJoin(s.workflowSteps, eq(s.workflowSteps.id, s.tasks.workflowStepId))
        .innerJoin(s.workflowExecutions, eq(s.workflowExecutions.id, s.tasks.workflowExecutionId))
        .leftJoin(s.responseRequests, eq(s.responseRequests.taskId, s.tasks.id))
        .where(and(ne(s.tasks.status, 'completed'), eq(s.workflowExecutions.status, 'running'),
          sql`exists (select 1 from user_emails e where e.user_id = ${userId}
            and (select count(*) from user_emails owners where owners.email = e.email) = 1
            and ((${s.responseRequests.taskId} is not null and lower(trim(${s.responseRequests.request}->'recipient'->>'email')) = e.email)
              or (${s.responseRequests.taskId} is null and (${s.tasks.assignedUserId} = ${userId} or (${s.tasks.assignedUserId} is null and (exists(select 1 from award_progress a, jsonb_array_elements(a.role_assignees) person where a.task_id=${s.tasks.id} and person->>'id'=${userId} and lower(trim(person->>'appointmentEmail'))=e.email) or (not exists(select 1 from award_progress a where a.task_id=${s.tasks.id}) and exists (select 1 from user_tag_memberships m where m.user_email_id = e.id and m.user_tag_id = ${s.tasks.userTagId}))))))))`,
          sql`(${s.responseRequests.taskId} is null or (${s.responseRequests.completedAt} is null and ${s.responseRequests.expiresAt} > now()))`))
        .orderBy(s.tasks.id);

      return rows;
    },
  };
}
