import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { application } from './fixtures';
import { parseApplication } from '@district/contracts/training-fund/validation';
import type { TrainingFundApplication } from '@district/contracts/training-fund/types';

async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return (server.address() as { port: number }).port;
}

test('Next.js registration routes enforce staff access and stamp trusted provenance', { timeout: 30000 }, async () => {
  const accepted: TrainingFundApplication[] = [];
  const staff = { id: 'verified-staff', name: 'Verified Registrar' };
  const mock = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/session') {
      const authorised = request.headers.cookie === 'session=staff';
      response.end(JSON.stringify({ authenticated: Boolean(request.headers.cookie), user: staff, permissions: authorised ? ['training-fund:register'] : [] })); return;
    }
    const parts: Buffer[] = []; for await (const part of request) parts.push(Buffer.from(part));
    try {
      const envelope = JSON.parse(Buffer.concat(parts).toString());
      const value = parseApplication(JSON.parse(envelope.MessageBody)); accepted.push(value);
      response.end(JSON.stringify({ MessageId: randomUUID(), MD5OfMessageBody: createHash('md5').update(envelope.MessageBody).digest('hex') }));
    } catch { response.statusCode = 400; response.end(JSON.stringify({ error: 'Invalid application' })); }
  });
  const mockPort = await listen(mock);
  const reservation = createServer(); const port = await listen(reservation); await new Promise<void>(done => reservation.close(() => done()));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: resolve('../web'), stdio: 'pipe', env: {
      ...process.env, PUBLIC_APP_ORIGIN: origin, TRAINING_FUND_QUEUE_URL: `http://127.0.0.1:${mockPort}/123/test`, AWS_ENDPOINT_URL_SQS: `http://127.0.0.1:${mockPort}`, AWS_REGION: 'eu-west-2', AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', AWS_SESSION_TOKEN: '',
      MEMBERS_SESSION_URL: `http://127.0.0.1:${mockPort}/session`, MEMBERS_SESSION_COOKIE_NAME: 'session',
      WORKFLOW_SESSION_URL: `http://127.0.0.1:${mockPort}/session`, WORKFLOW_SESSION_COOKIE_NAME: 'session',
    },
  });
  const post = (path: string, value: unknown, cookie = '', requestOrigin = origin) => fetch(`${origin}/api/training-fund/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin, Cookie: cookie }, body: JSON.stringify(value) });
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) { try { await fetch(origin); ready = true; break; } catch { await delay(50); } }
    assert.equal(ready, true);
    const registration = { receivedVia: 'email', receivedAt: '2026-01-01', reference: 'Email from applicant' };
    const value = { ...application, registration, submission: { channel: 'staff', registeredBy: { id: 'forged', name: 'Forged' } } };
    assert.equal((await post('registrations', value)).status, 403);
    assert.equal((await post('registrations', value, 'session=member')).status, 403);
    assert.equal((await post('registrations', value, 'session=staff', 'https://other.example')).status, 403);
    assert.equal(accepted.length, 0);
    assert.equal((await post('registrations', value, 'session=staff')).status, 202);
    assert.equal(accepted[0].submission?.channel, 'staff');
    if (accepted[0].submission?.channel === 'staff') assert.deepEqual(accepted[0].submission.registeredBy, staff);
    assert.equal((await post('applications', { ...application, submission: value.submission }, 'session=member')).status, 202);
    assert.deepEqual(accepted[1].submission, { channel: 'members' });
    assert.equal((await post('registrations', { ...application, registration: { ...registration, reference: '' } }, 'session=staff')).status, 400);
    const denied = await fetch(`${origin}/workflows/training-fund/register`, { headers: { Cookie: 'session=member' } });
    assert.match(await denied.text(), /Staff access required/);
    const allowed = await fetch(`${origin}/workflows/training-fund/register`, { headers: { Cookie: 'session=staff' } });
    const html = await allowed.text(); assert.match(html, /Verified Registrar/); assert.match(html, /Application source/);
  } finally {
    const exited = once(child, 'exit'); child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
    mock.closeAllConnections(); await new Promise<void>(done => mock.close(() => done()));
  }
});
