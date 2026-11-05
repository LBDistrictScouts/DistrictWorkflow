import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { createTestDatabase } from './postgres';
import * as s from '../schema';

/** Published platform task fixture for response repository and Temporal integration tests. */
export async function createResponseTaskFixture(db: Awaited<ReturnType<typeof createTestDatabase>>['db'], execution: { namespace: string; workflowId: string; runId: string }, recipientEmail?: string) {
  const suffix = randomUUID();
  const actor = { id: randomUUID(), email: recipientEmail ?? `recipient-${suffix}@example.org` };
  await db.insert(s.users).values({ id: actor.id, name: 'Recipient', active: 1, syncedAt: new Date() });
  await db.insert(s.userEmails).values({ userId: actor.id, email: actor.email });
  const [tag] = await db.insert(s.userTags).values({ tagCode: `response-${suffix}`, tagName: 'Response recipients' }).returning();
  const [type] = await db.insert(s.taskTypes).values({ code: `response-${suffix}`, name: 'Response' }).returning();
  const [form] = await db.insert(s.taskTypeDefinitions).values({ taskTypeId: type!.id, version: 1, inputSchema: {}, outputSchema: {}, uiSchema: {}, publishedAt: new Date() }).returning();
  const [workflow] = await db.insert(s.workflows).values({ code: `response-${suffix}`, name: 'Response test', description: 'Test response requests', temporalWorkflowType: 'responseTestWorkflow' }).returning();
  const [definition] = await db.insert(s.workflowDefinitions).values({ workflowId: workflow!.id, version: 1 }).returning();
  const [step] = await db.insert(s.workflowSteps).values({ workflowDefinitionId: definition!.id, taskTypeDefinitionId: form!.id, stepCode: 'respond', name: 'Respond', description: 'Provide a response', userTagId: tag!.id }).returning();
  await db.update(s.workflowDefinitions).set({ publishedAt: new Date() }).where(eq(s.workflowDefinitions.id, definition!.id));
  const [run] = await db.insert(s.workflowExecutions).values({ workflowDefinitionId: definition!.id, namespace: execution.namespace, temporalWorkflowId: execution.workflowId, temporalRunId: execution.runId, startedAt: new Date() }).returning();
  const [task] = await db.insert(s.tasks).values({ workflowExecutionId: run!.id, workflowStepId: step!.id, userTagId: tag!.id }).returning();

  return { actor, taskId: task!.id, async anotherTask() {
    const [next] = await db.insert(s.tasks).values({ workflowExecutionId: run!.id, workflowStepId: step!.id, userTagId: tag!.id, occurrence: 2 }).returning();

    return next!.id;
  } };
}
