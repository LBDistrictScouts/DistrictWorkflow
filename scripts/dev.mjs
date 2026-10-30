import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = resolve(root, 'apps/worker');
const webDir = resolve(root, 'apps/web');
const workerRequire = createRequire(resolve(workerDir, 'package.json'));
const persistenceRequire = createRequire(resolve(root, 'packages/persistence/package.json'));
const { parse } = workerRequire('dotenv');
const { Pool } = persistenceRequire('pg');
const { Connection } = workerRequire('@temporalio/client');
const checkOnly = process.argv.includes('--check');
const smoke = process.argv.includes('--smoke');
const processes = [];
let stopping = false;
let shuttingDown;

function envFile(file) {
  const path = resolve(root, file);
  if (!existsSync(path)) throw new Error(`Missing ${file}. Copy its .env.example and configure it first.`);
  return { ...parse(readFileSync(path)), ...process.env };
}
function log(message) { console.log(`[dev] ${message}`); }
function isListening(host, port) {
  return new Promise(resolveResult => {
    const socket = net.createConnection({ host, port });
    const finish = value => { socket.destroy(); resolveResult(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(false));
  });
}
async function waitUntil(name, ready, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (stopping) throw new Error('Startup stopped');
    if (await ready()) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${name}.`);
}
function start(name, command, args, { cwd = root, env = process.env, finite = false } = {}) {
  if (stopping) throw new Error('Startup stopped');
  log(`Starting ${name}`);
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { name, child, output: '', exited: false };
  processes.push(entry);
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => {
      const text = chunk.toString();
      entry.output = (entry.output + text).slice(-20000);
      process.stdout.write(text.split(/(?<=\n)/).map(line => `[${name}] ${line}`).join(''));
    });
  }
  entry.done = new Promise(resolveDone => {
    child.once('error', error => { entry.exited = true; resolveDone(1); log(`${name}: ${error.message}`); });
    child.once('close', code => { entry.exited = true; resolveDone(code ?? 1); });
  });
  if (!finite) void entry.done.then(code => {
    if (!stopping) { log(`${name} exited (${code}); stopping the dev stack.`); void shutdown(1); }
  });
  return entry;
}
async function run(name, args, options = {}) {
  const entry = start(name, 'corepack', ['yarn', ...args], { ...options, finite: true });
  if (await entry.done !== 0) throw new Error(`${name} failed. See its output above.`);
}
function signal(entry, signalName) {
  if (!entry.exited && entry.child.pid) {
    try { process.kill(-entry.child.pid, signalName); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
}
function shutdown(code = 0) {
  if (shuttingDown) return shuttingDown;
  stopping = true;
  shuttingDown = (async () => {
    log('Stopping processes started by this launcher…');
    for (const entry of processes.toReversed()) signal(entry, 'SIGINT');
    const timer = setTimeout(() => {
      for (const entry of processes) signal(entry, 'SIGKILL');
    }, 12000);
    await Promise.all(processes.map(entry => entry.done));
    clearTimeout(timer);
    process.exitCode = code;
  })();
  return shuttingDown;
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

async function main() {
  if (![22, 24].includes(Number(process.versions.node.split('.')[0]))) {
    throw new Error('Use the Node version in .nvmrc. scripts/dev.sh selects its installed executable automatically.');
  }
  const workerEnv = envFile('apps/worker/.env');
  const webEnv = envFile('apps/web/.env.local');
  const migrationEnv = envFile('packages/persistence/.env');
  for (const [label, env] of [['worker', workerEnv], ['web', webEnv], ['migrations', migrationEnv]]) {
    if (!env.DATABASE_URL) throw new Error(`DATABASE_URL is missing for ${label}.`);
    if (new URL(env.DATABASE_URL).toString() !== new URL(workerEnv.DATABASE_URL).toString()) {
      throw new Error('Web, worker and migrations must use the same DATABASE_URL.');
    }
  }
  const database = new Pool({ connectionString: workerEnv.DATABASE_URL, connectionTimeoutMillis: 5000, max: 1 });
  try { await database.query('select 1'); log('PostgreSQL is ready (using the existing server).'); }
  catch { throw new Error('Cannot connect to PostgreSQL. Check DATABASE_URL and your running local server.'); }
  finally { await database.end(); }

  const temporal = new URL(`tcp://${workerEnv.TEMPORAL_ADDRESS || 'localhost:7233'}`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(temporal.hostname) || workerEnv.TEMPORAL_TLS === 'true' || workerEnv.TEMPORAL_API_KEY) {
    throw new Error('This launcher requires a local Temporal endpoint without TLS/API key.');
  }
  if ((webEnv.TEMPORAL_ADDRESS || 'localhost:7233') !== (workerEnv.TEMPORAL_ADDRESS || 'localhost:7233') || (webEnv.TEMPORAL_NAMESPACE || 'default') !== (workerEnv.TEMPORAL_NAMESPACE || 'default')) {
    throw new Error('Web and worker must use the same Temporal address and namespace.');
  }
  const cli = resolve(workerDir, '.bin/temporal');
  if (!existsSync(cli)) throw new Error('Temporal CLI missing. Run: corepack yarn workspace @district/worker setup:cli');
  const origin = new URL(webEnv.PUBLIC_APP_ORIGIN || 'http://localhost:3030');
  if (!['localhost', '127.0.0.1'].includes(origin.hostname) || origin.protocol !== 'http:') throw new Error('Use a localhost HTTP PUBLIC_APP_ORIGIN for this dev launcher.');
  const webPort = Number(origin.port || 80);
  if (await isListening('127.0.0.1', webPort)) throw new Error(`Port ${webPort} is already in use; stop the existing web process before launching Local Dev.`);

  const intake = Boolean(workerEnv.TRAINING_FUND_QUEUE_URL?.trim());
  if (intake) {
    if (workerEnv.TRAINING_FUND_QUEUE_URL !== webEnv.TRAINING_FUND_QUEUE_URL) throw new Error('Web and worker must use the same TRAINING_FUND_QUEUE_URL.');
    const routingFile = workerEnv.TRAINING_FUND_ROUTING_FILE;
    if (!routingFile || !existsSync(resolve(workerDir, routingFile))) throw new Error('Configure an existing TRAINING_FUND_ROUTING_FILE before enabling intake.');
    if (!workerEnv.TRAINING_FUND_SIGNING_KEY || Buffer.byteLength(workerEnv.TRAINING_FUND_SIGNING_KEY) < 32 || workerEnv.TRAINING_FUND_SIGNING_KEY !== webEnv.TRAINING_FUND_SIGNING_KEY) {
      throw new Error('Web and worker need the same TRAINING_FUND_SIGNING_KEY (at least 32 bytes) before enabling intake.');
    }
    if (!workerEnv.NOTIFICATION_FROM_EMAIL && !workerEnv.TRAINING_FUND_FROM_EMAIL) throw new Error('Configure the worker SES sender before enabling intake.');
  } else {
    log('SQS intake disabled: TRAINING_FUND_QUEUE_URL is empty. Configure it to include the consumer.');
  }
  if (!webEnv.MEMBERS_SESSION_URL || !webEnv.WORKFLOW_SESSION_URL) log('Member/staff session validators are not fully configured; protected forms remain unavailable.');
  if (checkOnly) { log('Local Dev preflight passed. No application processes were started.'); return; }

  await run('packages', ['build:packages']);
  await run('migrations', ['db:migrate'], { env: migrationEnv });
  const temporalPort = Number(temporal.port || 7233);
  if (await isListening(temporal.hostname, temporalPort)) {
    log('Using the existing Temporal server; it will be left running when you stop.');
  } else {
    if (await isListening('127.0.0.1', temporalPort + 1000)) throw new Error(`Temporal UI port ${temporalPort + 1000} is already in use.`);
    mkdirSync(resolve(workerDir, '.data'), { recursive: true });
    start('temporal', cli, ['server', 'start-dev', '--ip', '127.0.0.1', '--port', String(temporalPort), '--ui-port', String(temporalPort + 1000), '--namespace', workerEnv.TEMPORAL_NAMESPACE || 'default', '--db-filename', '.data/temporal.db'], { cwd: workerDir, env: workerEnv });
  }
  await waitUntil('Temporal', () => isListening(temporal.hostname, temporalPort));
  const connection = await Connection.connect({ address: workerEnv.TEMPORAL_ADDRESS || 'localhost:7233', connectTimeout: '10 seconds' });
  await connection.close();

  const compiler = workerRequire.resolve('typescript/bin/tsc');
  const watchers = [];
  for (const name of ['contracts', 'domain', 'application', 'persistence', 'integrations']) {
    watchers.push(start(`watch:${name}`, process.execPath, [compiler, '--watch', '--preserveWatchOutput', '--project', `packages/${name}/tsconfig.json`]));
  }
  await waitUntil('shared package watchers', () => watchers.every(entry => entry.output.includes('Found 0 errors. Watching for file changes.')), 60000);
  const tsx = workerRequire.resolve('tsx/cli');
  const worker = start('worker', process.execPath, [tsx, 'watch', '--include', '../../packages/**/dist/**/*.{js,json}', 'src/worker.ts'], { cwd: workerDir, env: workerEnv });
  await waitUntil('worker', () => worker.output.includes("state: 'RUNNING'") || worker.output.includes('"state":"RUNNING"'));
  if (intake) start('intake', process.execPath, [tsx, 'watch', '--include', '../../packages/**/dist/**/*.{js,json}', 'src/intake/training-fund.ts'], { cwd: workerDir, env: workerEnv });
  const next = createRequire(resolve(webDir, 'package.json')).resolve('next/dist/bin/next');
  start('web', process.execPath, [next, 'dev', '--hostname', '127.0.0.1', '--port', String(webPort)], { cwd: webDir, env: webEnv });
  await waitUntil('Next.js', async () => {
    try { return (await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok; }
    catch { return false; }
  }, 60000);
  log(`Ready: ${origin.origin} · Temporal UI: http://localhost:${temporalPort + 1000}`);
  log('Use WebStorm Stop or Ctrl+C to stop the processes started here.');
  if (smoke) await shutdown();
}
main().catch(async error => {
  if (!stopping) console.error(`[dev] ${error.message}`);
  await shutdown(1);
});
