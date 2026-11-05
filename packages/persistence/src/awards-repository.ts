import { parseAwardContext } from '@district/contracts/awards/validation';
import type { RoleUser } from '@district/contracts/directory/types';
import { transitionAward } from '@district/domain/awards/machine';
import { and, eq, ne, inArray, sql } from 'drizzle-orm';
import type { createDatabase } from './client';
import type { AwardContext } from '@district/contracts/awards/types';
import * as s from './schema';

export function createAwardsRepository(db: ReturnType<typeof createDatabase>['db']) {
  const isDLV = (userId: string) => sql`exists(select 1 from user_tag_memberships m join user_emails e on e.id=m.user_email_id join user_tags t on t.id=m.user_tag_id where e.user_id=${userId} and t.tag_code='DLV')`;
  const isAssigned = (userId: string) => sql`(${s.tasks.assignedUserId}=${userId} or (${s.tasks.assignedUserId} is null and exists(select 1 from jsonb_array_elements(${s.awardProgress.roleAssignees}) a where a->>'id'=${userId})))`;

  return {
    async backfillAssignees(assignees: RoleUser[]) {
      if (!assignees.length) throw new TypeError('DLV resolved to no award assignees');

      return db.update(s.awardProgress).set({ roleAssignees: assignees }).where(sql`jsonb_array_length(${s.awardProgress.roleAssignees}) = 0`).returning({ taskId: s.awardProgress.taskId });
    },
    async checkConfigured() {
      const [tag] = await db.select({ id: s.userTags.id }).from(s.userTags).where(eq(s.userTags.tagCode, 'DLV'));

      if (!tag) throw new TypeError('Sync the DLV tag before importing awards');
    },
    async initialize(identity: { workflowId: string; runId: string; namespace: string }) {
      return db.transaction(async tx => {
        await tx.execute(sql`select pg_advisory_xact_lock(7281942)`);
        const [tag] = await tx.select().from(s.userTags).where(eq(s.userTags.tagCode, 'DLV'));

        if (!tag) throw new Error('DLV tag must be synced before importing awards');
        let [workflow] = await tx.select().from(s.workflows).where(eq(s.workflows.code, 'awards'));

        if (!workflow) [workflow] = await tx.insert(s.workflows).values({ code: 'awards', name: 'Awards', description: 'Present awards to district members', temporalWorkflowType: 'awardsWorkflow' }).returning();
        let [definition] = await tx.select().from(s.workflowDefinitions).where(eq(s.workflowDefinitions.workflowId, workflow!.id));

        if (!definition) {
          const [type] = await tx.insert(s.taskTypes).values({ code: 'present-award', name: 'Present Award' }).returning();
          const [form] = await tx.insert(s.taskTypeDefinitions).values({ taskTypeId: type!.id, version: 1, inputSchema: {}, outputSchema: {}, uiSchema: {}, publishedAt: new Date() }).returning();
          [definition] = await tx.insert(s.workflowDefinitions).values({ workflowId: workflow!.id, version: 1 }).returning();
          await tx.insert(s.workflowSteps).values({ workflowDefinitionId: definition!.id, taskTypeDefinitionId: form!.id, stepCode: 'present-award', name: 'Present Award', description: 'Present the award and record completion', userTagId: tag.id });
          await tx.update(s.workflowDefinitions).set({ publishedAt: new Date() }).where(eq(s.workflowDefinitions.id, definition!.id));
        }

        await tx.insert(s.workflowExecutions).values({ workflowDefinitionId: definition!.id, namespace: identity.namespace, temporalWorkflowId: identity.workflowId, temporalRunId: identity.runId, startedAt: new Date() }).onConflictDoNothing();
        const [run] = await tx.select().from(s.workflowExecutions).where(and(eq(s.workflowExecutions.namespace, identity.namespace), eq(s.workflowExecutions.temporalWorkflowId, identity.workflowId), eq(s.workflowExecutions.temporalRunId, identity.runId)));
        const [step] = await tx.select().from(s.workflowSteps).where(eq(s.workflowSteps.workflowDefinitionId, definition!.id));

        return { executionId: run!.id, stepId: step!.id, tagId: tag.id };
      });
    },
    async createTask(input: { executionId: string; stepId: string; tagId: string; occurrence: number; assignees?: RoleUser[]; context: AwardContext; createdBy: string }) {
      if (!input.assignees?.length) throw new TypeError('DLV resolved to no award assignees');
      await db.transaction(async tx => {
      await tx.insert(s.tasks).values({ workflowExecutionId: input.executionId, workflowStepId: input.stepId, userTagId: input.tagId, occurrence: input.occurrence, context: { ...input.context }, createdAt: new Date(), createdBy: input.createdBy }).onConflictDoNothing();
      const [task] = await tx.select({ id: s.tasks.id }).from(s.tasks).where(and(eq(s.tasks.workflowExecutionId, input.executionId), eq(s.tasks.workflowStepId, input.stepId), eq(s.tasks.occurrence, input.occurrence)));
      await tx.insert(s.awardProgress).values({ taskId: task!.id, roleAssignees: input.assignees }).onConflictDoNothing();
      });
    },
    async finishIfComplete(executionId: string) {
      const [pending] = await db.select({ id: s.tasks.id }).from(s.tasks).where(and(eq(s.tasks.workflowExecutionId, executionId), ne(s.tasks.status, 'completed'))).limit(1);

      if (pending) return false;
      await db.update(s.workflowExecutions).set({ status: 'completed', closedAt: new Date() }).where(eq(s.workflowExecutions.id, executionId));

      return true;
    },
    async list(userId: string, includeCompleted = false) {
      const rows = await db.select({ task: s.tasks, progress: s.awardProgress }).from(s.tasks).innerJoin(s.awardProgress, eq(s.awardProgress.taskId, s.tasks.id)).innerJoin(s.workflowSteps, eq(s.workflowSteps.id, s.tasks.workflowStepId))
        .where(and(eq(s.workflowSteps.stepCode, 'present-award'), includeCompleted ? undefined : ne(s.tasks.status, 'completed'), sql`(${isDLV(userId)} or ${isAssigned(userId)})`)).orderBy(s.tasks.createdAt, s.tasks.id);

      return rows.map(({ task, progress }) => ({ ...task, progress, context: parseAwardContext(task.context) }));
    },
    async assignees() { return db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(eq(s.users.active, 1)).orderBy(s.users.name); },
    async receiveMany(taskIds: string[], actorId: string) {
      const ids = [...new Set(taskIds)].sort();

      if (!ids.length || ids.length > 500) throw new TypeError('Select between 1 and 500 awards');
      await db.transaction(async tx => {
        const rows = await tx.select({ task: s.tasks, progress: s.awardProgress }).from(s.tasks)
          .innerJoin(s.awardProgress, eq(s.awardProgress.taskId, s.tasks.id))
          .where(and(inArray(s.tasks.id, ids), sql`(${isDLV(actorId)} or ${isAssigned(actorId)})`)).orderBy(s.tasks.id).for('update', { of: s.tasks });

        if (rows.length !== ids.length) throw new TypeError('One or more awards are unavailable or not assigned to you');

        for (const { task, progress } of rows) {
          if (progress.stage === 'received') continue; // Safe request retry.
          const stage = transitionAward(progress.stage, { type: 'RECEIVE' });
          await tx.update(s.awardProgress).set({ stage, receivedAt: new Date() }).where(eq(s.awardProgress.taskId, task.id));
          await tx.update(s.tasks).set({ status: 'in_progress', updatedAt: new Date(), updatedBy: actorId }).where(eq(s.tasks.id, task.id));
          await tx.insert(s.taskSubmissions).values({ taskId: task.id, submittedBy: actorId, answers: { action: 'receive', from: progress.stage, to: stage } });
        }
      });
    },
    async updateAssignees(taskId: string, actorId: string, action: 'add-assignee' | 'remove-assignee', userId: string) {
      await db.transaction(async tx => {
        const [row] = await tx.select({ task: s.tasks, progress: s.awardProgress }).from(s.tasks)
          .innerJoin(s.awardProgress, eq(s.awardProgress.taskId, s.tasks.id))
          .where(and(eq(s.tasks.id, taskId), sql`(${isDLV(actorId)} or ${isAssigned(actorId)})`)).for('update', { of: s.tasks });

        if (!row) throw new TypeError('Task unavailable or you do not have permission');
        transitionAward(row.progress.stage, { type: 'REASSIGN' });

        const person = async (id: string, active: boolean): Promise<RoleUser> => {
          const [user] = await tx.select().from(s.users).where(and(eq(s.users.id, id), active ? eq(s.users.active, 1) : undefined));

          if (!user) throw new TypeError('Choose an active district member');
          const [address] = await tx.select({ email: s.userEmails.email }).from(s.userEmails).where(and(eq(s.userEmails.userId, id), sql`(select count(*) from user_emails owners where owners.email=${s.userEmails.email}) = 1`)).orderBy(s.userEmails.email);

          if (active && !address) throw new TypeError('This member needs an unambiguous email address before assignment');

          return { id, name: user.name, appointmentEmail: address?.email ?? '' };
        };

        const current = row.task.assignedUserId ? [await person(row.task.assignedUserId, false)] : row.progress.roleAssignees;
        const exists = current.some(user => user.id === userId);

        if ((action === 'add-assignee' && exists) || (action === 'remove-assignee' && !exists)) return;
        const next = action === 'add-assignee' ? [...current, await person(userId, true)] : current.filter(user => user.id !== userId);

        if (!next.length) throw new TypeError('A task must have at least one assignee');
        await tx.update(s.awardProgress).set({ roleAssignees: next }).where(eq(s.awardProgress.taskId, taskId));
        await tx.update(s.tasks).set({ assignedUserId: null, updatedAt: new Date(), updatedBy: actorId }).where(eq(s.tasks.id, taskId));
        await tx.insert(s.taskSubmissions).values({ taskId, submittedBy: actorId, answers: { action, userId, previousAssigneeIds: [...new Set(current.map(user => user.id))], assigneeIds: [...new Set(next.map(user => user.id))] } });
      });
    },
    async change(taskId: string, actorId: string, action: 'complete' | 'assign' | 'schedule', assignee: string | null, presentationDate?: string) {
      return db.transaction(async tx => {
        const [row] = await tx.select({ task: s.tasks, progress: s.awardProgress }).from(s.tasks)
          .innerJoin(s.awardProgress, eq(s.awardProgress.taskId, s.tasks.id))
          .where(and(eq(s.tasks.id, taskId), sql`(${isDLV(actorId)} or ${isAssigned(actorId)})`)).for('update', { of: s.tasks });

        if (!row) throw new TypeError('Task unavailable or you do not have permission');
        const [execution] = await tx.select({ workflowId: s.workflowExecutions.temporalWorkflowId }).from(s.workflowExecutions).where(eq(s.workflowExecutions.id, row.task.workflowExecutionId));

        if (action === 'complete' && row.progress.stage === 'presented') return execution!.workflowId;
        const stage = transitionAward(row.progress.stage, { type: action === 'assign' ? 'REASSIGN' : action === 'schedule' ? 'SCHEDULE' : 'PRESENT' });

        if (action === 'assign' && !assignee && !row.progress.roleAssignees.length) throw new TypeError('A task must have at least one assignee');

        if (action === 'assign' && assignee) {
          const [user] = await tx.select().from(s.users).where(and(eq(s.users.id, assignee), eq(s.users.active, 1)));

          if (!user) throw new TypeError('Choose an active district member');
        }

        if (action === 'schedule') {
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

          if (!presentationDate || !/^\d{4}-\d{2}-\d{2}$/.test(presentationDate) || !Number.isFinite(Date.parse(presentationDate)) || new Date(presentationDate).toISOString().slice(0, 10) !== presentationDate || presentationDate < today) throw new TypeError('Choose today or a future presentation date');
        }

        // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
        await tx.update(s.awardProgress).set({ stage, ...(action === 'schedule' ? { presentationDate, scheduleRevision: row.progress.presentationDate === presentationDate ? row.progress.scheduleRevision : row.progress.scheduleRevision + 1 } : {}) }).where(eq(s.awardProgress.taskId, taskId));
        await tx.update(s.tasks).set({ updatedAt: new Date(), updatedBy: actorId, ...(action === 'assign' ? { assignedUserId: assignee } : action === 'schedule' ? { status: 'in_progress' as const } : { status: 'completed' as const, completedAt: new Date(), completedBy: actorId }) }).where(eq(s.tasks.id, taskId));
        await tx.insert(s.taskSubmissions).values({ taskId, submittedBy: actorId, answers: { action, from: row.progress.stage, to: stage, ...(action === 'assign' ? { assignedUserId: assignee, previousAssignedUserId: row.task.assignedUserId } : action === 'schedule' ? { presentationDate, previousPresentationDate: row.progress.presentationDate } : {}) } });

        return execution!.workflowId;
      });
    },
  };
}
