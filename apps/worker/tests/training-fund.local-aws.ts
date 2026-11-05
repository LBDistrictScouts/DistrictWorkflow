import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { SQSClient, CreateQueueCommand, ReceiveMessageCommand, DeleteMessageCommand, DeleteQueueCommand } from '@aws-sdk/client-sqs';
import { SESv2Client, CreateEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { createTestDatabase } from '@district/persistence/testing/postgres';
import { createTrainingFundRepository } from '@district/persistence/training-fund-repository';
import { submitApplication } from '@district/application/training-fund/service';
import { consumeApplication } from '@district/application/training-fund/intake';
import { trainingFundGateway } from '@district/integrations/training-fund/gateway';
import type { Person, TaskIdentity, TrainingFundState } from '@district/contracts/training-fund/types';
import { notifyTrainingFundTask } from '../src/activities/email-notifications/training-fund';
import { application, routing } from './fixtures';

// Real SDK calls to Moto, real Temporal, disposable PostgreSQL. No frontend auth bypass.
test('local AWS: submission → SQS → persisted workflow → captured SES → majority → payment', { timeout: 60000 }, async t => {
  const endpoint = 'http://127.0.0.1:4566';
  Object.assign(process.env, { AWS_ENDPOINT_URL: endpoint, AWS_ENDPOINT_URL_SQS: endpoint,
    AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', AWS_SESSION_TOKEN: '', AWS_REGION: 'eu-west-2',
    NOTIFICATION_FROM_EMAIL: 'workflow@example.org', TRAINING_FUND_SIGNING_KEY: 'local-smoke-test-key-'.repeat(3), TRAINING_FUND_PUBLIC_URL: 'http://localhost:3030',
  });
  const config = { endpoint, region: 'eu-west-2', credentials: { accessKeyId: 'test', secretAccessKey: 'test' } };
  const sqs = new SQSClient(config);
  const ses = new SESv2Client(config);

  try { await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: 'workflow@example.org' })); }
  catch (error) { if (!(error instanceof Error) || error.name !== 'AlreadyExistsException') throw error; }

  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: `training-fund-test-${randomUUID()}` }));
  assert.ok(QueueUrl);
  process.env.TRAINING_FUND_QUEUE_URL = QueueUrl;
  t.after(async () => {
    try { await sqs.send(new DeleteQueueCommand({ QueueUrl })); }
    finally { sqs.destroy(); ses.destroy(); }
  });
  const postgres = await createTestDatabase();
  t.after(() => postgres.close());
  await postgres.migrate();
  const repository = createTrainingFundRepository(postgres.db);
  const env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path: resolve('.bin/temporal') }, ui: false } });
  t.after(() => env.teardown());
  const taskQueue = `local-aws-${randomUUID()}`;
  const notifications: string[] = [];

  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, workflowsPath: require.resolve('../src/workflows/index'), activities: { resolveRoleUser: async (tag: string) => { assert.equal(tag, 'training-fund-approvers');

 return routing.approvers.map(person => ({ id: person.id, name: person.name, appointmentEmail: person.email })); },
    persistTrainingFundState: (input: Parameters<typeof repository.save>[0]) => repository.save(input),
    notifyTrainingFundTask: async (id: string, person: Person, role: TaskIdentity['role']) => {
      await notifyTrainingFundTask(id, person, role); notifications.push(`${role}:${person.id}`);
    },
  } });

  await worker.runUntil(async () => {
    const submission = { ...application, applicationId: randomUUID() };
    assert.deepEqual(await submitApplication(submission, trainingFundGateway), { applicationId: submission.applicationId, status: 'queued' });
    const { Messages } = await sqs.send(new ReceiveMessageCommand({ QueueUrl, WaitTimeSeconds: 5 }));
    assert.equal(Messages?.length, 1);
    const message = Messages![0];
    let workflowId = '';
    await consumeApplication(message.Body!, routing, {
      alreadyRecorded: input => repository.alreadyRecorded(input),
      start: async (input, route, id) => {
        workflowId = id;

        return env.client.workflow.start('trainingFundWorkflow', { workflowId: id, taskQueue, args: [input, route, { persistState: true }] });
      },
      acknowledge: () => sqs.send(new DeleteMessageCommand({ QueueUrl, ReceiptHandle: message.ReceiptHandle! })),
    });
    const handle = env.client.workflow.getHandle(workflowId);

    for (let i = 0; i < 100 && notifications.length < 3; i++) await delay(50);
    assert.equal(notifications.length, 3, 'all reviewer emails accepted by local SES');
    await handle.executeUpdate('approveTrainingFund', { args: ['reviewer-1'] });
    await handle.executeUpdate('approveTrainingFund', { args: ['reviewer-2'] });

    for (let i = 0; i < 100 && notifications.length < 4; i++) await delay(50);
    assert.ok(notifications.includes('treasurer:treasurer'));
    await handle.executeUpdate('recordTrainingFundPayment', { args: ['treasurer', 'LOCAL-TEST', '2026-01-01'] });
    // SAFETY: This test starts the registered workflow whose declared result is the asserted domain type.
    const result = await handle.result() as TrainingFundState;
    assert.equal(result.status, 'paid');
    assert.equal(result.approvals.length, 2);
    assert.deepEqual((await repository.findByWorkflowId(workflowId))?.state, result);
    assert.equal((await sqs.send(new ReceiveMessageCommand({ QueueUrl, WaitTimeSeconds: 1 }))).Messages?.length ?? 0, 0);
  });
});
