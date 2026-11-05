import { condition, defineSignal, setHandler } from '@temporalio/workflow';
import { responseActivities } from '../../src/workflows/responses';

export async function responseTestWorkflow(recipient: { name: string; email: string }, expiresAt: string) {
  let taskIds: string[] = [];
  const responses = responseActivities();
  setHandler(defineSignal<[string[]]>('setResponseTestTasks'), ids => { taskIds = ids; });
  await condition(() => taskIds.length === 2);
  const common = { recipient, subject: 'Response needed', heading: 'Your response', instructions: 'Please respond.', expiresAt };
  const simple = await responses.requestSimpleResponse({ ...common, taskId: taskIds[0]!, choices: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] });
  const decision = await responses.waitForResponse(simple.requestId);
  const complex = await responses.requestComplexResponse({ ...common, taskId: taskIds[1]!, fields: [{ name: 'account', label: 'Account number', type: 'text', required: true, pattern: '^[0-9]{8}$' }] });
  const details = await responses.waitForResponse(complex.requestId);

  return { decision, details };
}
