import test from 'node:test';
import { randomUUID } from 'node:crypto';
import * as s from '../src/schema';
import assert from 'node:assert/strict';
import { createWorkflowOverviewRepository } from '../src/workflow-overview-repository';
import { createTestDatabase } from '../src/testing/postgres';
import { createActivityNotificationRepository } from '../src/activity-notification-repository';
import { workflowCases, activityNotificationApplications } from '../src/schema';
import { parseActivityNotification } from '@district/contracts/activity-notification/validation';
import fixture from './activity-notification.fixture.json';

const submission = parseActivityNotification(fixture);

test('concurrent queue deliveries create one case; conflicting retries preserve original submission', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const repository = createActivityNotificationRepository(database.db);
    const results = await Promise.all([repository.record(submission), repository.record(submission)]);
    assert.deepEqual(results.map(r => r.outcome).sort(), ['created', 'duplicate']);
    assert.equal(results[0]!.caseId, results[1]!.caseId);

    for (const changed of [
      { ...submission, notification: { ...submission.notification, activity: 'Changed' } },
      { ...submission, submissionId: 'another-id' },
      { ...submission, notification: { ...submission.notification, idempotenceKey: '12345678-1234-4123-8123-123456789abd' } },
    ]) await assert.rejects(repository.record(changed));
    const cases = await database.db.select().from(workflowCases);
    assert.equal(cases.length, 1);
    assert.equal(cases[0]!.status, 'open');
    const applications = await database.db.select().from(activityNotificationApplications);
    assert.deepEqual(applications[0]!.submission, submission);
  } finally { await database.close(); }
});

test('shared tag approval is idempotent, authorized and first-wins under concurrent reviewers', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const repository = createActivityNotificationRepository(database.db);
    const { caseId } = await repository.record(submission);
    const [tag] = await database.db.insert(s.userTags).values({ tagCode: 'activity-out-of-district', tagName: 'Activity reviewers' }).returning();
    const reviewers = [randomUUID(), randomUUID(), randomUUID()];

    for (const [index, id] of reviewers.entries()) {
      await database.db.insert(s.users).values({ id, name: `Reviewer ${index}`, active: 1, syncedAt: new Date() });
      const [email] = await database.db.insert(s.userEmails).values({ userId: id, email: `reviewer${index}@example.org` }).returning();

      if (index < 2) await database.db.insert(s.userTagMemberships).values({ userEmailId: email!.id, userTagId: tag!.id });
    }

    const identity = { workflowId: 'activity-notification-test', runId: randomUUID(), namespace: 'default' };
    const { taskId } = await repository.initialize(caseId, identity);
    assert.equal((await repository.initialize(caseId, identity)).taskId, taskId);
    assert.equal((await repository.list(reviewers[0]!)).length, 1);
    assert.equal((await repository.list(reviewers[1]!)).length, 1);
    assert.equal((await repository.list(reviewers[2]!)).length, 0);
    const overview = createWorkflowOverviewRepository(database.db);
    assert.deepEqual(await overview.caseSummary('activity-notification', reviewers[0]!), { total: 1, open: 1, completed: 0, cancelled: 0 });
    assert.deepEqual(await overview.caseSummary('activity-notification', reviewers[2]!), { total: 0, open: 0, completed: 0, cancelled: 0 });
    await assert.rejects(repository.approve(taskId, reviewers[2]!));
    assert.equal(await repository.finishIfApproved(caseId), false);
    assert.equal((await database.db.select().from(s.activityNotificationStatistics)).length, 0);
    await assert.rejects(repository.approvalNotification(caseId));
    const decisions = await Promise.all(reviewers.slice(0, 2).map(id => repository.approve(taskId, id)));
    assert.equal(decisions.filter(d => !d.alreadyApproved).length, 1);
    assert.equal(decisions[0]!.approvedBy, decisions[1]!.approvedBy);
    assert.equal((await repository.list(reviewers[0]!)).length, 0);
    assert.equal((await repository.list(reviewers[1]!)).length, 0);
    const audit = await database.db.select().from(s.taskSubmissions);
    assert.equal(audit.length, 1);
    assert.equal(audit[0]!.submittedBy, decisions[0]!.approvedBy);
    const [statistics] = await database.db.select().from(s.activityNotificationStatistics);
    assert.equal(statistics!.approvedBy, decisions[0]!.approvedBy);
    assert.equal(statistics!.environment, submission.environment);
    assert.equal(statistics!.notificationType, submission.notification.notificationType);
    assert.equal(statistics!.youngPeople, submission.notification.youngPeople);
    assert.equal(statistics!.youngLeaders, submission.notification.youngLeaders);
    assert.equal(statistics!.adults, submission.notification.adults);
    assert.deepEqual(statistics!.sectionParticipants, submission.notification.sectionParticipants);
    assert.deepEqual(statistics!.groups, submission.notification.groups);
    assert.deepEqual(statistics!.sections, submission.notification.sections);
    assert.equal(statistics!.startsAt.toISOString(), submission.notification.startsAt);
    assert.equal(statistics!.externalProvider, null);
    assert.equal(await repository.finishIfApproved(caseId), true);
    assert.equal(await repository.finishIfApproved(caseId), true);
    const [c] = await database.db.select().from(workflowCases);
    assert.equal(c!.status, 'completed');
    assert.equal(c!.outcome, 'approved');
    assert.deepEqual(await overview.caseSummary('activity-notification', reviewers[1]!), { total: 1, open: 0, completed: 1, cancelled: 0 });
    assert.equal((await database.db.select().from(s.tasks)).length, 1);
    assert.equal((await database.db.select().from(s.activityNotificationStatistics)).length, 1);
    const notification = await repository.approvalNotification(caseId);
    assert.equal(notification.notifiedAt, null);
    assert.deepEqual(notification.submission, submission);
    await repository.recordApprovalNotification(caseId, 'ses-message-1');
    await repository.recordApprovalNotification(caseId, 'later-retry');
    assert.ok((await repository.approvalNotification(caseId)).notifiedAt);
    const [application] = await database.db.select().from(activityNotificationApplications);
    assert.equal(application!.approvalMessageId, 'ses-message-1');
    assert.deepEqual(application!.submission, submission);
  } finally { await database.close(); }
});
