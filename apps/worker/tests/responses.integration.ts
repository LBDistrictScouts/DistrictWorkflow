import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { createTestDatabase } from '@district/persistence/testing/postgres';
import { createResponseTaskFixture } from '@district/persistence/testing/response-task';
import { profileRepository, responseRepository, closeDatabase } from '@district/persistence/runtime';
import { executeResponse } from '@district/application/responses/service';
import { signResponseLink, verifyResponseLink } from '@district/integrations/responses/tokens';
import { responseCompletedSignal, type ResponseResult } from '@district/contracts/responses/types';
import { requestSimpleResponse, requestComplexResponse, getResponseResult } from '../src/activities/responses';

async function eventually(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(50); }

  assert.fail('Expected response request email was not sent');
}

for (const preference of ['response-links', 'task-notification'] as const) test(`standard responses (${preference}): real activities, encrypted forms, durable waiting and replay`, { timeout: 60000 }, async () => {
  const emails: unknown[] = [];

  const emailServer = createServer(async (req, res) => {
    const chunks: Buffer[] = [];

 for await (const chunk of req) chunks.push(Buffer.from(chunk));
    emails.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ MessageId: randomUUID() }));
  });

  emailServer.listen(0, '127.0.0.1'); await once(emailServer, 'listening');
  // SAFETY: The server has finished listening on a TCP port, so its address is AddressInfo rather than a Unix socket path.
  const endpoint = `http://127.0.0.1:${(emailServer.address() as { port: number }).port}`;
  const postgres = await createTestDatabase();
  await postgres.migrate();
  Object.assign(process.env, { DATABASE_URL: postgres.connectionString, RESPONSE_TASK_SIGNING_KEY: 'test-response-key-'.repeat(3), RESPONSE_ENCRYPTION_KEY: '42'.repeat(32),
    PUBLIC_APP_ORIGIN: 'http://localhost:3030', NOTIFICATION_FROM_EMAIL: 'workflow@example.org', AWS_REGION: 'eu-west-2',
    AWS_ENDPOINT_URL: endpoint, AWS_ENDPOINT_URL_SESV2: endpoint, AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', AWS_SESSION_TOKEN: '',
  });
  const env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path: resolve('.bin/temporal') }, ui: false } });
  const taskQueue = `responses-${randomUUID()}`;
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, workflowsPath: require.resolve('./workflows/responses'), activities: { requestSimpleResponse, requestComplexResponse, getResponseResult } });

  try {
    await worker.runUntil(async () => {
      const id = `responses-${randomUUID()}`;
      const expiresAt = new Date(Date.now() + 60000).toISOString();
      const recipient = { name: 'Response Recipient', email: 'responses@example.org' };
      const handle = await env.client.workflow.start('responseTestWorkflow', { workflowId: id, taskQueue, args: [recipient, expiresAt] });
      const fixture = await createResponseTaskFixture(postgres.db, { namespace: 'default', workflowId: id, runId: handle.firstExecutionRunId }, recipient.email);
      const actor = { id: fixture.actor.id, email: recipient.email };
      await profileRepository().save(fixture.actor.id, { displayName: null, taskResponsePreference: preference });
      const secondTask = await fixture.anotherTask();
      await handle.signal('setResponseTestTasks', [fixture.taskId, secondTask]);
      const repository = responseRepository();

      const dependencies = { repository, verifyLink: verifyResponseLink, notify: async (request: { taskId: string; workflowId: string; runId: string }) => {
        await env.client.workflow.getHandle(request.workflowId, request.runId).signal(responseCompletedSignal, request.taskId);
      } };

      await eventually(() => emails.length === 1);
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Transport test helper must accept malformed payloads to exercise input rejection.
      const command = (taskId: string, action: string, answers?: unknown) => ({ token: signResponseLink(taskId, expiresAt), action, answers });
      await executeResponse(command(fixture.taskId, 'view'), actor, dependencies);
      assert.equal((await repository.find(fixture.taskId))?.completed, false);
      assert.equal(JSON.stringify(emails[0]).includes('choice=yes'), preference === 'response-links');

      if (preference === 'task-notification') assert.ok(JSON.stringify(emails[0]).includes('Open task'));
      await executeResponse(command(fixture.taskId, 'submit', { choice: 'yes' }), actor, dependencies);
      await executeResponse(command(fixture.taskId, 'submit', { choice: 'yes' }), actor, dependencies);
      await eventually(() => emails.length === 2);
      const secret = { account: '92837465' };
      await executeResponse(command(secondTask, 'submit', secret), actor, dependencies);
      // SAFETY: This test starts the registered workflow whose declared result is the asserted domain type.
      const result = await handle.result() as { decision: ResponseResult; details: ResponseResult };
      assert.deepEqual(result.decision, { requestId: fixture.taskId, responseId: fixture.taskId, status: 'completed', choice: 'yes' });
      assert.deepEqual(result.details, { requestId: secondTask, responseId: secondTask, status: 'completed' });
      const history = await handle.fetchHistory();
      assert.ok(!JSON.stringify(history).includes(secret.account), 'complex answers stay outside Temporal history');
      await Worker.runReplayHistory({ workflowsPath: require.resolve('./workflows/responses') }, history);
    });
  } finally {
    await closeDatabase(); await env.teardown(); await postgres.close();
    emailServer.closeAllConnections(); await new Promise<void>(resolveClose => emailServer.close(() => resolveClose()));
  }
});
