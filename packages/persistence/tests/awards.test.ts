import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../src/testing/postgres';
import { createWorkflowOverviewRepository } from '../src/workflow-overview-repository';
import { createAwardsRepository } from '../src/awards-repository';
import { createTaskDigestRepository } from '../src/task-digest-repository';
import { createAwardReminderRepository } from '../src/award-reminder-repository';
import * as s from '../src/schema';

test('awards are idempotent, assignable, authorised, audited and complete without a deadline', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate(); const db = database.db;
    const coassignee = randomUUID(), dlv = randomUUID(), other = randomUUID(), outsider = randomUUID();

    for (const id of [dlv, other, outsider, coassignee]) {
      await db.insert(s.users).values({ id, name: id, active: 1, syncedAt: new Date() });
      await db.insert(s.userEmails).values({ userId: id, email: `${id}@example.org` });
    }

    const [tag] = await db.insert(s.userTags).values({ tagCode: 'DLV', tagName: 'DLV' }).returning();
    const emails = await db.select().from(s.userEmails);
    await db.insert(s.userTagMemberships).values({ userEmailId: emails.find(e => e.userId === dlv)!.id, userTagId: tag!.id });
    const repo = createAwardsRepository(db);
    const identity = { namespace: 'default', workflowId: randomUUID(), runId: randomUUID() };
    const execution = await repo.initialize(identity);
    assert.deepEqual(await repo.initialize(identity), execution);
    const input = { ...execution, occurrence: 1, assignees: [dlv, coassignee].map(id => ({ id, name: id, appointmentEmail: `${id}@example.org` })), createdBy: dlv, context: { membershipNumber: '1234', description: 'Award', awardDate: '2026-11-03', recipient: { id: other, name: 'Recipient', appointments: [] } } };
    await repo.createTask(input); await repo.createTask(input);
    const [task] = await repo.list(dlv); assert.ok(task); assert.equal((await repo.list(dlv)).length, 1);
    assert.equal((await repo.list(outsider)).length, 0);
    assert.equal((await repo.list(coassignee)).length, 1, 'resolved users do not require current tag membership');
    assert.deepEqual(task.progress.roleAssignees, input.assignees);
    await assert.rejects(repo.change(task.id, outsider, 'complete', null), /permission/);
    assert.equal(await repo.finishIfComplete(execution.executionId), false);
    await assert.rejects(repo.updateAssignees(task.id, outsider, 'add-assignee', outsider), /permission/);
    await repo.updateAssignees(task.id, dlv, 'add-assignee', outsider);
    await repo.updateAssignees(task.id, dlv, 'add-assignee', outsider);
    assert.equal(new Set((await repo.list(dlv))[0]!.progress.roleAssignees.map(person => person.id)).size, 3);
    await repo.updateAssignees(task.id, dlv, 'remove-assignee', outsider);
    const removals = await Promise.allSettled([repo.updateAssignees(task.id, dlv, 'remove-assignee', dlv), repo.updateAssignees(task.id, dlv, 'remove-assignee', coassignee)]);
    assert.equal(removals.filter(result => result.status === 'rejected').length, 1);
    assert.equal(new Set((await repo.list(dlv))[0]!.progress.roleAssignees.map(person => person.id)).size, 1);
    await repo.updateAssignees(task.id, dlv, 'add-assignee', dlv);
    await repo.updateAssignees(task.id, dlv, 'add-assignee', coassignee);
    await repo.change(task.id, dlv, 'assign', other);
    assert.equal((await repo.list(other)).length, 1);
    const digest = createTaskDigestRepository(db);
    assert.equal((await digest.tasks(dlv)).length, 0);
    assert.equal((await digest.tasks(coassignee)).length, 0, 'manual assignment replaces all initial assignees');
    assert.equal((await digest.tasks(other)).length, 1);
    await repo.change(task.id, other, 'assign', null);
    assert.equal((await repo.list(other)).length, 0);
    assert.equal((await digest.tasks(coassignee)).length, 1, 'digest uses resolved user assignments');
    await assert.rejects(repo.change(task.id, dlv, 'complete', null), /Cannot present/);
    await assert.rejects(repo.change(task.id, dlv, 'schedule', null, '2099-07-04'), /Cannot schedule/);
    await repo.createTask({ ...input, occurrence: 2 });
    const summary = createWorkflowOverviewRepository(db);
    assert.deepEqual(await summary.caseSummary('awards', dlv), { total: 2, open: 2, completed: 0, cancelled: 0 });
    assert.equal((await db.select().from(s.workflowExecutions)).length, 1, 'one import run represents two awards');
    assert.equal((await summary.caseSummary('awards', outsider)).total, 0);
    const taskIds = (await repo.list(dlv)).map(t => t.id);
    await assert.rejects(repo.receiveMany([...taskIds, randomUUID()], dlv), /unavailable/);
    assert.ok((await repo.list(dlv)).every(t => t.progress.stage === 'listed'));
    await repo.receiveMany(taskIds, dlv);
    await repo.receiveMany(taskIds, dlv); // Retry does not create duplicate receipt records.
    assert.ok((await repo.list(dlv)).every(t => t.progress.stage === 'received'));
    await assert.rejects(repo.change(task.id, dlv, 'schedule', null, '2099-02-30'), /date/);
    await repo.change(task.id, dlv, 'schedule', null, '2099-07-04');
    const reminders = createAwardReminderRepository(db);
    assert.deepEqual(await reminders.dueTaskIds(new Date('2099-07-01T07:59:00Z')), []);
    assert.deepEqual(await reminders.dueTaskIds(new Date('2099-07-01T08:00:00Z')), [task.id]);
    const concurrent = await Promise.all([reminders.claim(task.id, new Date('2099-07-01T08:00:00Z')), reminders.claim(task.id, new Date('2099-07-01T08:00:00Z'))]);
    assert.equal(concurrent.flat().length, 2);
    assert.deepEqual(new Set(concurrent.flat().map(claim => claim.person.id)), new Set([dlv, coassignee]));
    await repo.change(task.id, dlv, 'schedule', null, '2099-07-04');
    assert.deepEqual(await reminders.claim(task.id, new Date('2099-07-01T10:00:00Z')), []);
    await repo.change(task.id, dlv, 'assign', other);
    const reassigned = await reminders.claim(task.id, new Date('2099-07-01T10:00:00Z'));
    assert.equal(reassigned[0]!.person.id, other);
    await repo.change(task.id, dlv, 'schedule', null, '2099-07-05');
    assert.deepEqual(await reminders.claim(task.id, new Date('2099-07-04T08:00:00Z')), []);
    const onDay = await reminders.claim(task.id, new Date('2099-07-05T08:00:00Z'));
    assert.equal(onDay.length, 1); assert.equal(onDay[0]!.daysBefore, 0);
    await repo.change(task.id, dlv, 'complete', null);
    assert.deepEqual(await reminders.claim(task.id, new Date('2099-07-05T10:00:00Z')), []);
    const second = taskIds.find(id => id !== task.id)!;
    await repo.change(second, dlv, 'schedule', null, '2099-07-05');
    await repo.change(second, dlv, 'complete', null);
    assert.equal((await repo.list(dlv)).length, 0);
    assert.equal((await repo.list(dlv, true)).length, 2);
    assert.equal((await repo.list(outsider, true)).length, 0);
    assert.equal((await summary.caseSummary('awards', dlv)).completed, 2);
    await repo.createTask(input); // Delayed activity retry must not reopen the case.
    assert.equal((await summary.caseSummary('awards', dlv)).completed, 2);
    assert.equal(await repo.finishIfComplete(execution.executionId), true);
    assert.equal((await db.select().from(s.taskSubmissions)).filter(row => row.answers.action === 'receive').length, 2);
  } finally { await database.close(); }
});
