import { and, eq, or, sql, ne, isNull } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import type { createDatabase } from './client';
import { activityNotificationApplications as applications, workflowCases, workflows } from './schema';
import * as tables from './schema';
import { approveActivityNotification } from '@district/domain/activity-notification/machine';
import type { QueuedActivityNotification } from '@district/contracts/activity-notification/types';

function statisticsFor(caseId: string, submission: QueuedActivityNotification, approvedAt: Date, approvedBy: string): typeof tables.activityNotificationStatistics.$inferInsert {
  const form = submission.notification;

  return {
    workflowCaseId: caseId, environment: submission.environment, notificationType: form.notificationType,
    activity: form.activity, location: form.location, venueName: form.venueName, timeZone: form.timeZone,
    submittedAt: new Date(submission.submittedAt), startsAt: new Date(form.startsAt), endsAt: new Date(form.endsAt),
    approvedAt, approvedBy, groups: form.groups, sections: form.sections, sectionIds: form.sectionIds,
    sectionParticipants: form.sectionParticipants, youngPeople: form.youngPeople, youngLeaders: form.youngLeaders,
    adults: form.adults, externalProvider: form.externalProvider === undefined ? null : form.externalProvider === 'Yes' ? 1 : 0,
  };
}

export function createActivityNotificationRepository(db: ReturnType<typeof createDatabase>['db']) {
  return {
    async record(submission: QueuedActivityNotification) {
      return db.transaction(async tx => {
        // Lock the catalogue row so concurrent deliveries cannot race case creation.
        await tx.insert(workflows).values({ code: 'activity-notification', name: 'Activity notifications', description: 'Submitted activity notifications', temporalWorkflowType: 'activityNotificationWorkflow' }).onConflictDoNothing({ target: workflows.code });
        const [workflow] = await tx.select().from(workflows).where(eq(workflows.code, 'activity-notification')).for('update');

        if (!workflow) throw new Error('Activity notification workflow is unavailable');
        const existing = await tx.select().from(applications).where(and(eq(applications.environment, submission.environment), or(eq(applications.submissionId, submission.submissionId), eq(applications.idempotenceKey, submission.notification.idempotenceKey))));

        if (existing.length) {
          if (existing.length !== 1 || !isDeepStrictEqual(existing[0]!.submission, submission)) throw new Error('Activity submission identity conflicts with recorded content');

          return { caseId: existing[0]!.workflowCaseId, outcome: 'duplicate' as const };
        }

        const [created] = await tx.insert(workflowCases).values({ workflowId: workflow.id, reference: `${submission.environment}:${submission.notification.idempotenceKey}`, title: submission.notification.activity, openedAt: new Date(submission.submittedAt) }).returning();

        if (!created) throw new Error('Activity notification case was not created');
        await tx.insert(applications).values({ workflowCaseId: created.id, environment: submission.environment, submissionId: submission.submissionId, idempotenceKey: submission.notification.idempotenceKey, submission });

        return { caseId: created.id, outcome: 'created' as const };
      });
    },
    async initialize(caseId: string, identity: { workflowId: string; runId: string; namespace: string }) {
      return db.transaction(async tx => {
        const [c] = await tx.select().from(workflowCases).where(eq(workflowCases.id, caseId)).for('update');

        if (!c) throw new Error('Activity case is missing');
        // Serialise definition publication across all activity cases.
        await tx.select().from(workflows).where(eq(workflows.id, c.workflowId)).for('update');
        const [tag] = await tx.select().from(tables.userTags).where(eq(tables.userTags.tagCode, 'activity-out-of-district'));

        if (!tag) throw new Error('Sync the activity-out-of-district tag before enabling activity intake');
        let [definition] = await tx.select().from(tables.workflowDefinitions).where(and(eq(tables.workflowDefinitions.workflowId, c.workflowId), eq(tables.workflowDefinitions.version, 1)));

        if (!definition) {
          await tx.insert(tables.taskTypes).values({ code: 'approve-activity-notification', name: 'Approve activity notification' }).onConflictDoNothing();
          const [type] = await tx.select().from(tables.taskTypes).where(eq(tables.taskTypes.code, 'approve-activity-notification'));
          const [form] = await tx.insert(tables.taskTypeDefinitions).values({ taskTypeId: type!.id, version: 1, inputSchema: {}, outputSchema: { type: 'object', required: ['action'], properties: { action: { const: 'approve' } }, additionalProperties: false }, uiSchema: {}, publishedAt: new Date() }).returning();
          [definition] = await tx.insert(tables.workflowDefinitions).values({ workflowId: c.workflowId, version: 1 }).returning();
          await tx.insert(tables.workflowSteps).values({ workflowDefinitionId: definition!.id, taskTypeDefinitionId: form!.id, stepCode: 'approve-activity', name: 'Approve activity notification', description: 'First approval completes this shared task', userTagId: tag.id });
          await tx.update(tables.workflowDefinitions).set({ publishedAt: new Date() }).where(eq(tables.workflowDefinitions.id, definition!.id));
        }

        await tx.update(workflowCases).set({ workflowDefinitionId: definition!.id }).where(eq(workflowCases.id, caseId));
        await tx.insert(tables.workflowExecutions).values({ workflowDefinitionId: definition!.id, namespace: identity.namespace, temporalWorkflowId: identity.workflowId, temporalRunId: identity.runId, startedAt: new Date() }).onConflictDoNothing();
        const [run] = await tx.select().from(tables.workflowExecutions).where(and(eq(tables.workflowExecutions.namespace, identity.namespace), eq(tables.workflowExecutions.temporalWorkflowId, identity.workflowId), eq(tables.workflowExecutions.temporalRunId, identity.runId)));
        await tx.insert(tables.workflowCaseExecutions).values({ workflowCaseId: caseId, workflowExecutionId: run!.id }).onConflictDoNothing();
        const [existing] = await tx.select().from(tables.tasks).where(eq(tables.tasks.workflowCaseId, caseId));

        if (existing) return { taskId: existing.id };
        const [step] = await tx.select().from(tables.workflowSteps).where(and(eq(tables.workflowSteps.workflowDefinitionId, definition!.id), eq(tables.workflowSteps.stepCode, 'approve-activity')));
        const [task] = await tx.insert(tables.tasks).values({ workflowCaseId: caseId, workflowExecutionId: run!.id, workflowStepId: step!.id, userTagId: tag.id, context: { activity: c.title }, createdAt: new Date() }).returning();

        return { taskId: task!.id };
      });
    },
    async list(actorId: string, includeCompleted = false) {
      return db.select({ task: tables.tasks, submission: applications.submission }).from(tables.tasks)
        .innerJoin(applications, eq(applications.workflowCaseId, tables.tasks.workflowCaseId))
        .where(and(includeCompleted ? undefined : ne(tables.tasks.status, 'completed'), sql`exists (
          select 1 from user_tag_memberships m join user_emails e on e.id=m.user_email_id
          join users u on u.id=e.user_id where u.id=${actorId}::uuid and u.active=1 and m.user_tag_id=${tables.tasks.userTagId})`)).orderBy(tables.tasks.createdAt);
    },
    async approve(taskId: string, actorId: string) {
      return db.transaction(async tx => {
        const [task] = await tx.select().from(tables.tasks).innerJoin(applications, eq(applications.workflowCaseId, tables.tasks.workflowCaseId))
          .where(and(eq(tables.tasks.id, taskId), sql`exists (
            select 1 from user_tag_memberships m join user_emails e on e.id=m.user_email_id
            join users u on u.id=e.user_id where u.id=${actorId}::uuid and u.active=1 and m.user_tag_id=${tables.tasks.userTagId})`)).for('update', { of: tables.tasks });

        if (!task) throw new TypeError('Task unavailable or you do not have permission');

        if (task.tasks.status === 'completed') return { approvedBy: task.tasks.completedBy, alreadyApproved: true };
        approveActivityNotification('awaiting_approval');
        const now = new Date();
        await tx.update(tables.tasks).set({ status: 'completed', completedAt: now, completedBy: actorId, updatedAt: now, updatedBy: actorId }).where(eq(tables.tasks.id, taskId));
        await tx.insert(tables.taskSubmissions).values({ taskId, submittedBy: actorId, answers: { action: 'approve' } });
        await tx.insert(tables.activityNotificationStatistics).values(statisticsFor(task.activity_notification_applications.workflowCaseId, task.activity_notification_applications.submission, now, actorId));

        return { approvedBy: actorId, alreadyApproved: false };
      });
    },
    async finishIfApproved(caseId: string) {
      return db.transaction(async tx => {
        const [task] = await tx.select().from(tables.tasks).where(and(eq(tables.tasks.workflowCaseId, caseId), eq(tables.tasks.status, 'completed')));

        if (!task) return false;
        const [application] = await tx.select().from(applications).where(eq(applications.workflowCaseId, caseId));

        if (!application || !task.completedAt || !task.completedBy) throw new Error('Approved activity metadata is missing');
        await tx.insert(tables.activityNotificationStatistics).values(statisticsFor(caseId, application.submission, task.completedAt, task.completedBy)).onConflictDoNothing({ target: tables.activityNotificationStatistics.workflowCaseId });
        const outcome = approveActivityNotification('awaiting_approval');
        await tx.update(workflowCases).set({ status: 'completed', outcome, closedAt: task.completedAt }).where(eq(workflowCases.id, caseId));
        const runs = await tx.select().from(tables.workflowCaseExecutions).where(eq(tables.workflowCaseExecutions.workflowCaseId, caseId));

        for (const run of runs) await tx.update(tables.workflowExecutions).set({ status: 'completed', closedAt: task.completedAt }).where(eq(tables.workflowExecutions.id, run.workflowExecutionId));

        return true;
      });
    },
    async approvalNotification(caseId: string) {
      const [row] = await db.select({ submission: applications.submission, notifiedAt: applications.approvalNotifiedAt, approvedAt: tables.activityNotificationStatistics.approvedAt })
        .from(applications).innerJoin(tables.activityNotificationStatistics, eq(tables.activityNotificationStatistics.workflowCaseId, applications.workflowCaseId))
        .where(eq(applications.workflowCaseId, caseId));

      if (!row) throw new Error('Activity approval must be recorded before notifying the applicant');

      return row;
    },
    async recordApprovalNotification(caseId: string, messageId: string) {
      await db.update(applications).set({ approvalNotifiedAt: new Date(), approvalMessageId: messageId })
        .where(and(eq(applications.workflowCaseId, caseId), isNull(applications.approvalNotifiedAt)));
    },
  };
}
