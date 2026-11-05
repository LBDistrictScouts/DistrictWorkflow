import type { createDatabase } from './client';
import { sql } from 'drizzle-orm';
import { trainingFundApplications } from './schema';
import type { WorkflowTaskRow } from '@district/contracts/workflows/tasks';

export function createWorkflowOverviewRepository(db: ReturnType<typeof createDatabase>['db']) {
  return {
    async caseSummary(slug: string, userId: string) {
      const result = await db.execute(sql`
        select count(*)::int as total,
          count(*) filter(where c.status='open')::int as open,
          count(*) filter(where c.status='completed')::int as completed,
          count(*) filter(where c.status='cancelled')::int as cancelled
        from workflow_cases c join workflows w on w.id=c.workflow_id
        where w.code=${slug} and (${slug} <> 'awards' or exists (
          select 1 from tasks t join award_progress a on a.task_id=t.id
          where t.workflow_case_id=c.id and (
            t.assigned_user_id=${userId}::uuid or
            (t.assigned_user_id is null and exists(select 1 from jsonb_array_elements(a.role_assignees) p where p->>'id'=${userId})) or
            exists(select 1 from user_tag_memberships m join user_emails e on e.id=m.user_email_id join user_tags tag on tag.id=m.user_tag_id where e.user_id=${userId}::uuid and tag.tag_code='DLV')
          )
        ))`);

      // SAFETY: The aggregate SELECT always returns one row with these four aliases explicitly cast to PostgreSQL int.
      return result.rows[0] as { total: number; open: number; completed: number; cancelled: number };
    },
    /** Workflow-wide overview. Action links and mutation permissions are checked separately. */
    async trainingFundTasks(): Promise<WorkflowTaskRow[]> {
      const records = await db.select().from(trainingFundApplications);

      return records.flatMap(({ workflowId, state }) => {
        const common = { executionId: workflowId, subject: `${state.application.applicant.name} · ${state.application.course.title}`, createdAt: state.application.submittedAt };

        const rows: WorkflowTaskRow[] = state.routing.approvers.map(person => {
          const approval = state.approvals.find(item => item.personId === person.id);

          return { ...common, id: `${workflowId}:approver:${person.id}`, title: 'Review Training Fund application', assignee: person.name, status: approval ? 'completed' : state.status === 'awaiting_approvals' ? 'pending' : 'not_required', completedAt: approval?.approvedAt };
        });

        if (state.status !== 'awaiting_approvals') rows.push({ ...common, id: `${workflowId}:treasurer:${state.routing.treasurer.id}`, title: 'Record Training Fund payment', assignee: state.routing.treasurer.name, status: state.status === 'paid' ? 'completed' : 'pending', completedAt: state.payment?.recordedAt });

        return rows;
      });
    },
  };
}
