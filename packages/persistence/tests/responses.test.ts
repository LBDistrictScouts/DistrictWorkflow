import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ResponseRequest } from '@district/contracts/responses/types';
import { createTestDatabase } from '../src/testing/postgres';
import { createResponseTaskFixture } from '../src/testing/response-task';
import { createResponseRepository } from '../src/response-repository';
import { decryptResponse } from '../src/response-crypto';
import * as s from '../src/schema';

test('response tasks: immutable requests, validation, recipient checks, encrypted answers and atomic retry-safe completion', async () => {
  process.env.RESPONSE_ENCRYPTION_KEY = '11'.repeat(32);
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const execution = { namespace: 'default', workflowId: 'responses-test', runId: randomUUID() };
    const fixture = await createResponseTaskFixture(database.db, execution);
    const repository = createResponseRepository(database.db);

    const input: ResponseRequest = { ...execution, taskId: fixture.taskId, recipient: { email: fixture.actor.email, name: 'Recipient' },
      heading: 'Your details', subject: 'Response requested', instructions: 'Provide your account details.', expiresAt: new Date(Date.now() + 60000).toISOString(),
      definition: { kind: 'complex', fields: [{ name: 'account', label: 'Account number', type: 'text', required: true, pattern: '^[0-9]{8}$' }] },
    };

    await repository.create(input); await repository.create(input);
    await assert.rejects(repository.create({ ...input, instructions: 'Changed' }));
    await assert.rejects(repository.create({ ...input, taskId: await fixture.anotherTask(), runId: randomUUID() }));
    await assert.rejects(repository.complete(input.taskId, { ...fixture.actor, email: 'other@example.org' }, { account: '12345678' }));
    await assert.rejects(repository.complete(input.taskId, fixture.actor, { account: 'not-an-account' }));
    assert.equal((await repository.find(input.taskId))?.completed, false);
    const answers = { account: '12345678' };
    await assert.rejects(repository.complete(input.taskId, fixture.actor, answers, new Date(Date.parse(input.expiresAt) + 1)));
    await Promise.all([repository.complete(input.taskId, fixture.actor, answers), repository.complete(input.taskId, fixture.actor, answers)]);
    await assert.rejects(repository.complete(input.taskId, fixture.actor, { account: '87654321' }));
    const [stored] = await database.db.select().from(s.responseRequests).where(eq(s.responseRequests.taskId, input.taskId));
    assert.ok(stored!.answerCiphertext && !JSON.stringify(stored).includes(answers.account));
    assert.deepEqual(decryptResponse(input.taskId, stored!.answerCiphertext!), answers);
    await assert.rejects(async () => decryptResponse(randomUUID(), stored!.answerCiphertext!));
    const submissions = await database.db.select().from(s.taskSubmissions).where(eq(s.taskSubmissions.taskId, input.taskId));
    assert.equal(submissions.length, 1);
    assert.deepEqual(submissions[0]!.answers, { responseId: input.taskId });
    const [task] = await database.db.select().from(s.tasks).where(eq(s.tasks.id, input.taskId));
    assert.equal(task!.status, 'completed');
    assert.deepEqual(await repository.result(input.taskId), { requestId: input.taskId, status: 'completed', responseId: input.taskId });
  } finally { await database.close(); }
});
