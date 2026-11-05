import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createTestDatabase } from '../src/testing/postgres';
import { createResponseTaskFixture } from '../src/testing/response-task';
import { createResponseRepository } from '../src/response-repository';
import { createResponseReminderRepository } from '../src/response-reminder-repository';
import { createProfileRepository } from '../src/profile-repository';
import * as s from '../src/schema';

test('reminders honour dispatch time, preference, completion and an atomic two-reminder limit', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const execution = { namespace: 'default', workflowId: randomUUID(), runId: randomUUID() };
    const fixture = await createResponseTaskFixture(database.db, execution);
    await createResponseRepository(database.db).create({ ...execution, taskId: fixture.taskId, recipient: { name: 'Recipient', email: fixture.actor.email }, subject: 'Choose', heading: 'Respond', instructions: 'Choose one', expiresAt: '2099-01-01T00:00:00Z', definition: { kind: 'simple', choices: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }] } });
    const undatedTaskId = await fixture.anotherTask(); // Ordinary task with no response deadline.
    const reminders = createResponseReminderRepository(database.db);
    const start = new Date('2030-01-01T00:00:00Z');
    const after = (hours: number) => new Date(start.getTime() + hours * 3600000);
    assert.deepEqual(await reminders.dueTaskIds(after(200)), []); // Historical dispatch is unknown.
    await reminders.recordInitialSent(fixture.taskId, start);
    await reminders.recordInitialSent(fixture.taskId, after(10));
    assert.deepEqual(await reminders.initialSent(fixture.taskId), start);
    assert.deepEqual(await reminders.dueTaskIds(after(71)), []);
    assert.deepEqual(await reminders.dueTaskIds(after(72)), [fixture.taskId]);
    assert.equal(await reminders.claim(undatedTaskId, after(200)), null);
    await database.db.update(s.responseRequests).set({ expiresAt: after(72) }).where(eq(s.responseRequests.taskId, fixture.taskId));
    assert.deepEqual(await reminders.dueTaskIds(after(72)), []); // Deadline reached exactly.
    assert.equal(await reminders.claim(fixture.taskId, after(72)), null);
    await database.db.update(s.responseRequests).set({ expiresAt: sql`'infinity'::timestamptz` }).where(eq(s.responseRequests.taskId, fixture.taskId));
    assert.deepEqual(await reminders.dueTaskIds(after(72)), []); // No effective deadline.
    assert.equal(await reminders.claim(fixture.taskId, after(72)), null);
    await database.db.update(s.responseRequests).set({ expiresAt: new Date('2099-01-01') }).where(eq(s.responseRequests.taskId, fixture.taskId));
    const profiles = createProfileRepository(database.db);
    await profiles.save(fixture.actor.id, { displayName: null, taskResponsePreference: 'task-notification' });
    assert.equal(await reminders.claim(fixture.taskId, after(72)), null);
    await profiles.save(fixture.actor.id, { displayName: null, taskResponsePreference: 'response-links' });
    await database.db.update(s.tasks).set({ status: 'completed' }).where(eq(s.tasks.id, fixture.taskId));
    assert.equal(await reminders.claim(fixture.taskId, after(72)), null);
    await database.db.update(s.tasks).set({ status: 'pending' }).where(eq(s.tasks.id, fixture.taskId));
    const [task] = await database.db.select().from(s.tasks).where(eq(s.tasks.id, fixture.taskId));
    await database.db.update(s.workflowExecutions).set({ status: 'canceled' }).where(eq(s.workflowExecutions.id, task!.workflowExecutionId));
    assert.equal(await reminders.claim(fixture.taskId, after(72)), null);
    await database.db.update(s.workflowExecutions).set({ status: 'running' }).where(eq(s.workflowExecutions.id, task!.workflowExecutionId));
    await database.db.update(s.responseRequests).set({ expiresAt: start }).where(eq(s.responseRequests.taskId, fixture.taskId));
    assert.equal(await reminders.claim(fixture.taskId, after(72)), null);
    await database.db.update(s.responseRequests).set({ expiresAt: new Date('2099-01-01') }).where(eq(s.responseRequests.taskId, fixture.taskId));
    await database.db.update(s.users).set({ active: 0 }).where(eq(s.users.id, fixture.actor.id));
    assert.equal(await reminders.claim(fixture.taskId, after(72)), null);
    await database.db.update(s.users).set({ active: 1 }).where(eq(s.users.id, fixture.actor.id));
    const claims = await Promise.all([reminders.claim(fixture.taskId, after(72)), reminders.claim(fixture.taskId, after(72))]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean)!.attempt, 1);
    assert.deepEqual(await reminders.dueTaskIds(after(143)), []);
    assert.equal((await reminders.claim(fixture.taskId, after(144)))?.attempt, 2);
    assert.equal(await reminders.claim(fixture.taskId, after(300)), null);
    assert.deepEqual(await reminders.dueTaskIds(after(300)), []);
  } finally { await database.close(); }
});
