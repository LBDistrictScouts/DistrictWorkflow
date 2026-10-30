import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { application, routing } from './fixtures';
import { signTask } from '@district/integrations/training-fund/tokens';
import type { TaskIdentity } from '@district/contracts/training-fund/types';

async function listen(server: Server): Promise<number> {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return (server.address() as { port: number }).port;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

test('HTTP intake and task APIs validate credentials, schema, role and durable decisions', { timeout: 60000 }, async () => {
  const messages: unknown[] = [];
  const fakeSqs = createServer(async (req, res) => {
    if (req.url === '/session') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ authenticated: req.headers.cookie === 'session=member' })); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    messages.push(JSON.parse(body.MessageBody));
    res.writeHead(200, { 'Content-Type': 'application/x-amz-json-1.0' });
    res.end(JSON.stringify({ MessageId: randomUUID(), MD5OfMessageBody: createHash('md5').update(body.MessageBody).digest('hex') }));
  });
  const sqsPort = await listen(fakeSqs);
  const reservation = createServer(); const apiPort = await listen(reservation); await new Promise<void>(done => reservation.close(() => done()));
  const env = await TestWorkflowEnvironment.createLocal({ server: { executable: { type: 'existing-path', path: resolve('.bin/temporal') }, ui: false } });
  const signingKey = 'test-signing-key-'.repeat(3);
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(apiPort)], { cwd: resolve('../web'), env: {
    ...process.env, TEMPORAL_ADDRESS: env.address, TEMPORAL_NAMESPACE: 'default', TEMPORAL_API_KEY: '', TEMPORAL_TLS: 'false',
    PUBLIC_APP_ORIGIN: `http://127.0.0.1:${apiPort}`, TRAINING_FUND_SIGNING_KEY: signingKey,
    MEMBERS_SESSION_URL: `http://127.0.0.1:${sqsPort}/session`, MEMBERS_SESSION_COOKIE_NAME: 'session',
    TRAINING_FUND_QUEUE_URL: `http://127.0.0.1:${sqsPort}/123/test`, AWS_ENDPOINT_URL_SQS: `http://127.0.0.1:${sqsPort}`, AWS_REGION: 'eu-west-2', AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', AWS_SESSION_TOKEN: '',
  }, stdio: 'pipe' });
  const post = (path: string, body: unknown, cookie = 'session=member') => fetch(`http://127.0.0.1:${apiPort}/api/training-fund${path}`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${apiPort}`, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const taskQueue = `api-test-${randomUUID()}`;
  const worker = await Worker.create({ connection: env.nativeConnection, taskQueue, workflowsPath: require.resolve('../src/workflows/index'), activities: { notifyTrainingFundTask: async () => {} } });
  try {
    await worker.runUntil(async () => {
      let ready = false;
      for (let i = 0; i < 100; i++) { try { await post('/task', {}); ready = true; break; } catch { await delay(50); } }
      assert.equal(ready, true);
      assert.equal((await post('/applications', application, 'wrong')).status, 401);
      assert.equal((await post('/applications', { ...application, declaration: false })).status, 400);
      assert.equal(messages.length, 0);
      assert.equal((await post('/applications', application)).status, 202);
      assert.deepEqual(messages, [{ ...application, submission: { channel: 'members' } }]);
      assert.equal((await post('/task', { token: 'forged', command: { action: 'view' } })).status, 403);
      const workflowId = `training-fund-${randomUUID()}`;
      const handle = await env.client.workflow.start('trainingFundWorkflow', { workflowId, taskQueue, args: [application, routing] });
      const token = (personId: string, role: TaskIdentity['role']) => signTask({ workflowId, personId, role, expiresAt: Date.now() + 60000 }, signingKey);
      const task = (personId: string, role: TaskIdentity['role'], command: unknown) => post('/task', { token: token(personId, role), command });
      assert.equal((await task('unassigned', 'approver', { action: 'view' })).status, 403);
      assert.equal((await task('reviewer-1', 'approver', { action: 'record-payment', reference: 'REF', paidAt: '2026-01-01' })).status, 403);
      assert.equal((await task('treasurer', 'treasurer', { action: 'record-payment', reference: 'REF', paidAt: '2026-01-01' })).status, 409);
      assert.equal((await task('reviewer-1', 'approver', { action: 'view' })).status, 200);
      for (const id of ['reviewer-1', 'reviewer-1', 'reviewer-2', 'reviewer-3']) assert.equal((await task(id, 'approver', { action: 'approve' })).status, 200);
      const pay = { action: 'record-payment', reference: 'REF', paidAt: '2026-01-01' };
      assert.equal((await task('treasurer', 'treasurer', pay)).status, 200);
      await handle.result();
      assert.equal((await task('treasurer', 'treasurer', pay)).status, 200);
      assert.equal((await task('treasurer', 'treasurer', { ...pay, reference: 'CHANGED' })).status, 409);
    });
  } finally { await stop(child); await env.teardown(); fakeSqs.closeAllConnections(); await new Promise<void>(done => fakeSqs.close(() => done())); }
});
