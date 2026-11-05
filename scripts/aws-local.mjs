import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/worker/package.json'));
const { parse } = require('dotenv');
const { SQSClient, CreateQueueCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const { SESv2Client, CreateEmailIdentityCommand } = require('@aws-sdk/client-sesv2');
const endpoint = 'http://127.0.0.1:4566';
const region = 'eu-west-2';
const config = { endpoint, region, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } };
const paths = ['apps/web/.env.local', 'apps/worker/.env'];
const files = paths.map(path => ({ path: resolve(root, path), text: readFileSync(resolve(root, path), 'utf8') }));
const envs = files.map(file => parse(file.text));

// Require an explicit edit before replacing any configured remote intake.
for (const env of envs) {
  if (env.TRAINING_FUND_QUEUE_URL && !['localhost', '127.0.0.1'].includes(new URL(env.TRAINING_FUND_QUEUE_URL).hostname)) {
    throw new Error('A remote Training Fund queue is configured. Clear it explicitly before selecting local AWS.');
  }
}

const keys = [...new Set(envs.flatMap(env => env.TRAINING_FUND_SIGNING_KEY ? [env.TRAINING_FUND_SIGNING_KEY] : []))];

if (keys.length > 1 || (keys[0] && Buffer.byteLength(keys[0]) < 32)) throw new Error('Repair mismatched or short signing keys before configuring local AWS.');

const signingKey = keys[0] || randomBytes(32).toString('hex');
const responseKeys = {};

for (const name of ['RESPONSE_TASK_SIGNING_KEY', 'RESPONSE_ENCRYPTION_KEY']) {
  const configured = [...new Set(envs.flatMap(env => env[name] ? [env[name]] : []))];

  if (configured.length > 1) throw new Error(`Repair mismatched ${name} values before local setup.`);
  const value = configured[0] || randomBytes(32).toString('hex');

  if (name === 'RESPONSE_ENCRYPTION_KEY' ? !/^[0-9a-f]{64}$/i.test(value) : Buffer.byteLength(value) < 32) throw new Error(`Invalid ${name}`);
  responseKeys[name] = value;
}

const sqs = new SQSClient(config);
const ses = new SESv2Client(config);

try {
  const deadLetter = await sqs.send(new CreateQueueCommand({ QueueName: 'training-fund-dlq' }));
  const { Attributes } = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: deadLetter.QueueUrl, AttributeNames: ['QueueArn'] }));

  const { QueueUrl } = await sqs.send(new CreateQueueCommand({ QueueName: 'training-fund', Attributes: {
    VisibilityTimeout: '120', ReceiveMessageWaitTimeSeconds: '20',
    RedrivePolicy: JSON.stringify({ deadLetterTargetArn: Attributes.QueueArn, maxReceiveCount: '5' }),
  } }));

  const sender = 'workflow@example.org';

  try { await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: sender })); }
  catch (error) { if (error.name !== 'AlreadyExistsException') throw error; }

  const values = {
    AWS_REGION: region, AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test', AWS_SESSION_TOKEN: '', AWS_PROFILE: '',
    AWS_ENDPOINT_URL: endpoint, AWS_ENDPOINT_URL_SQS: endpoint,
    TRAINING_FUND_QUEUE_URL: QueueUrl, TRAINING_FUND_SIGNING_KEY: signingKey, ...responseKeys,
  };

  for (const [index, file] of files.entries()) {
    const settings = index === 1 ? { ...values, NOTIFICATION_FROM_EMAIL: sender } : values;
    let text = file.text;

    for (const [key, value] of Object.entries(settings)) {
      const line = `${key}=${value}`;
      const pattern = new RegExp(`^${key}=.*$`, 'm');
      text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
    }

    writeFileSync(file.path, text, { mode: 0o600 });
  }

  console.log('Local SQS queue, DLQ and SES sender are ready. Web/worker env files now use Moto and test credentials.');
  console.log('Restart the local dev stack to load the configuration. Captured AWS resources: http://localhost:4566/moto-api/');
} finally { sqs.destroy(); ses.destroy(); }
