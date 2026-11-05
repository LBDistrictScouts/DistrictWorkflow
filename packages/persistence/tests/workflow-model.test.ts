import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from '../src/testing/postgres';
import * as s from '../src/schema';

test('published versions, execution identity, repeated tasks, submissions and shared payments', async () => {
  const database = await createTestDatabase();
  const db = database.db;

  try {
    await database.migrate();
    const [user] = await db.insert(s.users).values({ id: randomUUID(), name: 'Reviewer', active: 1, syncedAt: new Date() }).returning();
    const [tag] = await db.insert(s.userTags).values({ tagName: 'Treasurers', tagCode: 'treasurers' }).returning();
    const [type] = await db.insert(s.taskTypes).values({ code: 'record-payment', name: 'Record payment' }).returning();

    const [form] = await db.insert(s.taskTypeDefinitions).values({ taskTypeId: type!.id, version: 1,
      inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, uiSchema: {}, publishedAt: new Date() }).returning();

    await assert.rejects(db.update(s.taskTypeDefinitions).set({ outputSchema: {} }).where(eq(s.taskTypeDefinitions.id, form!.id)));
    const [workflow] = await db.insert(s.workflows).values({ code: 'fund', name: 'Fund', description: 'Training fund', temporalWorkflowType: 'TrainingFundWorkflow' }).returning();
    const [definition] = await db.insert(s.workflowDefinitions).values({ workflowId: workflow!.id, version: 1 }).returning();

    const [step] = await db.insert(s.workflowSteps).values({ workflowDefinitionId: definition!.id, taskTypeDefinitionId: form!.id,
      stepCode: 'pay', name: 'Pay', description: 'Record the payment', userTagId: tag!.id }).returning();

    const executionValues = { workflowDefinitionId: definition!.id, namespace: 'default', temporalWorkflowId: 'fund-123', temporalRunId: randomUUID(), startedAt: new Date() };
    await assert.rejects(db.insert(s.workflowExecutions).values(executionValues));
    await db.update(s.workflowDefinitions).set({ publishedAt: new Date() }).where(eq(s.workflowDefinitions.id, definition!.id));
    await assert.rejects(db.update(s.workflowSteps).set({ name: 'Changed' }).where(eq(s.workflowSteps.id, step!.id)));
    const [run] = await db.insert(s.workflowExecutions).values(executionValues).returning();
    await assert.rejects(db.insert(s.workflowExecutions).values(executionValues));
    const [secondRun] = await db.insert(s.workflowExecutions).values({ ...executionValues, temporalRunId: randomUUID() }).returning();
    const values = { workflowExecutionId: run!.id, workflowStepId: step!.id, userTagId: tag!.id };
    const [task] = await db.insert(s.tasks).values(values).returning();
    assert.equal(task!.completedBy, null);
    await assert.rejects(db.insert(s.tasks).values(values));
    const [repeated] = await db.insert(s.tasks).values({ ...values, occurrence: 2 }).returning();
    await db.insert(s.tasks).values({ ...values, workflowExecutionId: secondRun!.id });
    const [otherDefinition] = await db.insert(s.workflowDefinitions).values({ workflowId: workflow!.id, version: 2, publishedAt: new Date() }).returning();
    const [otherRun] = await db.insert(s.workflowExecutions).values({ ...executionValues, workflowDefinitionId: otherDefinition!.id, temporalRunId: randomUUID() }).returning();
    await assert.rejects(db.insert(s.tasks).values({ ...values, workflowExecutionId: otherRun!.id }));
    const [submission] = await db.insert(s.taskSubmissions).values({ taskId: task!.id, submittedBy: user!.id, answers: { reference: 'TX-1' } }).returning();
    await assert.rejects(db.delete(s.taskSubmissions).where(eq(s.taskSubmissions.id, submission!.id)));
    const [payment] = await db.insert(s.payments).values({ workflowExecutionId: run!.id, payeeName: 'Applicant', amountPence: 5000 }).returning();
    await db.insert(s.taskPayments).values([task!, repeated!].map(t => ({ taskId: t.id, paymentId: payment!.id })));
    await assert.rejects(db.insert(s.payments).values({ workflowExecutionId: run!.id, payeeName: 'Applicant', amountPence: -1 }));
  } finally { await database.close(); }
});
