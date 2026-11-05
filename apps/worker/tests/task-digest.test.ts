import test from 'node:test';
import assert from 'node:assert/strict';
import { taskDigestEmail } from '@district/integrations/email/task-digest';
import { renderThemedEmail } from '@district/integrations/email/email-template';

test('digest renders every task in HTML and plain text, including more than the action-button limit', () => {
  const tasks = Array.from({ length: 35 }, (_, index) => ({ title: `Task <${index}>`, url: `https://example.org/responses#token=${index}` }));
  const notification = taskDigestEmail({ email: 'person@example.org', name: 'Person' }, tasks, 'https://example.org');
  const rendered = renderThemedEmail(notification);
  assert.equal(notification.subject, '35 outstanding district tasks');

  for (const task of tasks) { assert.ok(rendered.text.includes(task.title)); assert.ok(rendered.html.includes(task.url)); }

  assert.match(rendered.html, /Task &lt;34&gt;/);
  assert.match(rendered.text, /72 hours/);
  assert.throws(() => renderThemedEmail({ ...notification, taskList: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] }));
  assert.throws(() => renderThemedEmail({ ...notification, taskList: [] }));
});
