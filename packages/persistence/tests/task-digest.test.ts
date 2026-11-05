import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from '../src/testing/postgres';
import { createResponseTaskFixture } from '../src/testing/response-task';
import { createTaskDigestRepository } from '../src/task-digest-repository';
import { createProfileRepository } from '../src/profile-repository';
import { createResponseRepository } from '../src/response-repository';
import * as s from '../src/schema';

test('digest selects opted-in active users and only their outstanding assignments', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const execution = { namespace: 'default', workflowId: randomUUID(), runId: randomUUID() };
    const fixture = await createResponseTaskFixture(database.db, execution);
    const repository = createTaskDigestRepository(database.db);
    assert.deepEqual(await repository.recipients(), []);
    await createProfileRepository(database.db).save(fixture.actor.id, { displayName: 'Preferred', taskResponsePreference: 'task-notification' });
    assert.deepEqual(await repository.recipients(), [{ id: fixture.actor.id, name: 'Preferred', emails: [fixture.actor.email] }]);
    assert.deepEqual(await repository.tasks(fixture.actor.id), []);
    await createResponseRepository(database.db).create({ ...execution, taskId: fixture.taskId, recipient: { name: 'Recipient', email: fixture.actor.email }, subject: 'Task', heading: 'Please respond', instructions: 'Choose', expiresAt: '2099-01-01T00:00:00Z', definition: { kind: 'simple', choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] } });
    assert.equal((await repository.tasks(fixture.actor.id)).length, 1);
    assert.deepEqual(await repository.tasks(randomUUID()), []);
    await database.db.update(s.tasks).set({ status: 'completed' }).where(eq(s.tasks.id, fixture.taskId));
    assert.deepEqual(await repository.tasks(fixture.actor.id), []);
    await database.db.update(s.tasks).set({ status: 'pending' }).where(eq(s.tasks.id, fixture.taskId));
    await database.db.update(s.responseRequests).set({ expiresAt: new Date('2000-01-01') }).where(eq(s.responseRequests.taskId, fixture.taskId));
    assert.deepEqual(await repository.tasks(fixture.actor.id), []);
    const [task] = await database.db.select().from(s.tasks).where(eq(s.tasks.id, fixture.taskId));
    const [email] = await database.db.select().from(s.userEmails).where(eq(s.userEmails.userId, fixture.actor.id));
    await database.db.insert(s.userTagMemberships).values({ userEmailId: email!.id, userTagId: task!.userTagId });
    const genericTask = await fixture.anotherTask();
    assert.deepEqual((await repository.tasks(fixture.actor.id)).map(item => item.id), [genericTask]);
    await database.db.update(s.workflowExecutions).set({ status: 'canceled' }).where(eq(s.workflowExecutions.id, task!.workflowExecutionId));
    assert.deepEqual(await repository.tasks(fixture.actor.id), []);
    const otherId = randomUUID();
    await database.db.insert(s.users).values({ id: otherId, name: 'Shared', active: 1, syncedAt: new Date() });
    await database.db.insert(s.userEmails).values({ userId: otherId, email: fixture.actor.email });
    assert.deepEqual(await repository.recipients(), []);
    await database.db.update(s.users).set({ active: 0 }).where(eq(s.users.id, fixture.actor.id));
    assert.deepEqual(await repository.recipients(), []);
  } finally { await database.close(); }
});
