import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateResponseRequest, validateResponseAnswers } from '@district/contracts/responses/validation';
import type { ResponseRequest } from '@district/contracts/responses/types';
import { executeResponse } from '@district/application/responses/service';
import { signResponseLink, verifyResponseLink } from '@district/integrations/responses/tokens';
import { responseTaskEmail } from '@district/integrations/responses/email';
import { renderThemedEmail } from '@district/integrations/email/email-template';

const request: ResponseRequest = { taskId: randomUUID(), namespace: 'default', workflowId: 'test', runId: randomUUID(), recipient: { name: 'Recipient', email: 'recipient@example.org' },
  subject: 'Choose', heading: 'Make a choice', instructions: 'Choose A, B or C.', expiresAt: '2099-01-01T00:00:00Z',
  definition: { kind: 'simple', choices: ['A', 'B', 'C'].map(value => ({ value, label: `Choice ${value}` })) },
};

test('response definitions and answers enforce allowed choices and field schemas', () => {
  validateResponseRequest(request);
  assert.deepEqual(validateResponseAnswers(request.definition, { choice: 'A' }), { choice: 'A' });

  for (const input of [{ choice: 'D' }, {}, { choice: 'A', extra: 'x' }]) assert.throws(() => validateResponseAnswers(request.definition, input));
  assert.throws(() => validateResponseRequest({ ...request, definition: { kind: 'simple', choices: [{ value: 'A', label: 'A' }, { value: 'A', label: 'Again' }] } }));
  const definition = { kind: 'complex' as const, fields: [{ name: 'email', type: 'email' as const, label: 'Email', required: true }] };
  assert.throws(() => validateResponseAnswers(definition, { email: 'invalid' }));
  assert.deepEqual(validateResponseAnswers(definition, { email: 'a@example.org' }), { email: 'a@example.org' });
});

test('response links are scoped, signed and expiring; simple emails contain one real link per option', () => {
  process.env.RESPONSE_TASK_SIGNING_KEY = 'local-response-test-'.repeat(3);
  const token = signResponseLink(request.taskId, request.expiresAt);
  assert.equal(verifyResponseLink(token), request.taskId);
  assert.throws(() => verifyResponseLink(`${token}x`));
  assert.throws(() => verifyResponseLink(token, Date.parse('2100-01-01')));
  const email = renderThemedEmail(responseTaskEmail(request, `https://example.org/responses#token=${token}`));

  for (const option of ['A', 'B', 'C']) {
    assert.ok(email.html.includes(`&amp;choice=${option}`));
    assert.ok(email.text.includes(`&choice=${option}`));
  }

  assert.throws(() => renderThemedEmail({ to: request.recipient, heading: 'Test', subject: 'Test', paragraphs: ['Test'], actions: [{ label: 'Bad', url: 'javascript:alert(1)' }] }));
});

test('view is read-only and response access requires the intended authenticated recipient', async () => {
  let completions = 0;
  let signals = 0;

  const dependencies = { verifyLink: () => request.taskId,
    repository: { create: async () => {}, find: async () => ({ ...request, completed: false }), complete: async () => { completions++; }, result: async () => ({ requestId: request.taskId, status: 'pending' as const }) },
    notify: async () => { signals++; },
  };

  const actor = { id: randomUUID(), email: request.recipient.email };
  await executeResponse({ token: 'token', action: 'view' }, actor, dependencies);
  assert.equal(completions, 0); assert.equal(signals, 0);
  await assert.rejects(executeResponse({ token: 'token', action: 'submit', answers: { choice: 'A' } }, { ...actor, email: 'stranger@example.org' }, dependencies));
  assert.equal(completions, 0);
  const view = await executeResponse({ token: 'token', action: 'submit', answers: { choice: 'A' } }, actor, dependencies);
  assert.equal(view.completed, true); assert.equal(completions, 1); assert.equal(signals, 1);
  assert.equal('answers' in view, false);
});

test('task-notification preference replaces choice links with one open-task link for both response types', () => {
  const url = 'https://example.org/responses#token=personal';
  const notification = responseTaskEmail(request, url, 'task-notification');
  assert.equal(notification.actions, undefined);
  assert.deepEqual(notification.action, { label: 'Open task', url });
  const rendered = renderThemedEmail(notification);
  assert.ok(!rendered.html.includes('choice='));
  assert.ok(rendered.text.includes('Open task'));
  const complex = { ...request, definition: { kind: 'complex' as const, fields: [{ name: 'statement', label: 'Statement', type: 'textarea' as const }] } };
  assert.deepEqual(responseTaskEmail(complex, url, 'task-notification').action, { label: 'Open task', url });
  assert.equal(responseTaskEmail(complex, url).action?.label, 'Complete response form');
});

test('both response email formats receive shared status treatment with isolated read-only tokens', async () => {
  const { prepareTaskEmail, statusTaskId, emailTaskStatus } = await import('@district/integrations/email/task-status');
  process.env.RESPONSE_TASK_SIGNING_KEY = 'local-response-test-'.repeat(3);

  for (const definition of [request.definition, { kind: 'complex' as const, fields: [{ name: 'answer', label: 'Answer', type: 'text' as const }] }]) {
    const notification = prepareTaskEmail(responseTaskEmail({ ...request, definition }, 'https://example.org/responses#token=private-response-token'));
    const token = new URL(notification.statusImageUrl!).searchParams.get('token')!;
    assert.equal(statusTaskId(token), request.taskId);
    assert.throws(() => verifyResponseLink(token));
    assert.throws(() => statusTaskId(signResponseLink(request.taskId, request.expiresAt)));
    assert.throws(() => statusTaskId(`${token.slice(0, 10)}!${token.slice(11)}`));
    assert.ok(!notification.statusImageUrl!.includes('private-response-token'));
    const rendered = renderThemedEmail(notification);
    assert.match(rendered.html, /<img /);
    assert.match(rendered.text, /Already completed this task/);
    assert.match(rendered.text, /View current status/);
    const repository = { find: async () => ({ ...request, completed: false }), create: async () => {}, complete: async () => {}, result: async () => ({ requestId: request.taskId, status: 'pending' as const }) };
    assert.equal(await emailTaskStatus(token, repository), 'Action required');
    assert.equal(await emailTaskStatus(token, { ...repository, find: async () => ({ ...request, completed: true }) }), 'Completed - no further action needed');
    assert.match(await emailTaskStatus(token, { ...repository, find: async () => ({ ...request, completed: false, expiresAt: '2000-01-01' }) }), /Expired/);
    assert.match(await emailTaskStatus(token, { ...repository, find: async () => null }), /unavailable/);
  }
});

test('reminders preface both response formats and preserve original instructions and links', async () => {
  const { responseReminderEmail } = await import('@district/integrations/responses/email');

  for (const definition of [request.definition, { kind: 'complex' as const, fields: [{ name: 'answer', label: 'Answer', type: 'text' as const }] }]) {
    const notification = responseReminderEmail({ ...request, definition }, 'https://example.org/responses#token=test');
    assert.equal(notification.subject, `Reminder: ${request.subject}`);
    assert.equal(notification.paragraphs[0], `Remember, you have an action to complete: ${request.heading}`);
    assert.ok(notification.paragraphs.includes(request.instructions));
    assert.ok(notification.taskStatus);
    const rendered = renderThemedEmail(notification);
    assert.match(rendered.text, /Remember, you have an action to complete/);
    assert.match(rendered.html, /Remember, you have an action to complete/);

    if (definition.kind === 'simple') assert.equal(notification.actions?.length, definition.choices.length);
    else assert.equal(notification.action?.label, 'Complete response form');
  }
});
