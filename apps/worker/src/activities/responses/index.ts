import { Context } from '@temporalio/activity';
import { ApplicationFailure } from '@temporalio/common';
import { profileRepository, userRepository, responseRepository, responseReminderRepository } from '@district/persistence/runtime';
import { responseEncryptionKey } from '@district/persistence/response-crypto';
import type { ResponseRequestInput, ResponseRequest, ResponseResult } from '@district/contracts/responses/types';
import { ResponseError, validateResponseRequest } from '@district/contracts/responses/validation';
import { signResponseLink } from '@district/integrations/responses/tokens';
import { responseTaskEmail } from '@district/integrations/responses/email';
import { sendThemedEmail } from '../email-notifications';

function workflowIdentity() {
  const info = Context.current().info;

  if (!info.workflowExecution || !info.workflowNamespace) throw ApplicationFailure.nonRetryable('Response activities require a workflow execution', 'InvalidResponseRequest');

  return { namespace: info.workflowNamespace, workflowId: info.workflowExecution.workflowId, runId: info.workflowExecution.runId };
}

type SimpleInput = Omit<ResponseRequestInput, 'definition'> & { choices: Extract<ResponseRequestInput['definition'], { kind: 'simple' }>['choices'] };

type ComplexInput = Omit<ResponseRequestInput, 'definition'> & { fields: Extract<ResponseRequestInput['definition'], { kind: 'complex' }>['fields'] };

async function requestResponse(input: ResponseRequestInput): Promise<{ requestId: string }> {
  try { validateResponseRequest(input); }
  catch { throw ApplicationFailure.nonRetryable('Invalid response task request', 'InvalidResponseRequest'); }

  // Fail before notifying if completed answers could not be encrypted.
  responseEncryptionKey();
  const origin = new URL(process.env.PUBLIC_APP_ORIGIN || process.env.TRAINING_FUND_PUBLIC_URL || '');

  if (origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error('Configure PUBLIC_APP_ORIGIN for response links');
  const request: ResponseRequest = { ...input, ...workflowIdentity() };
  const token = signResponseLink(input.taskId, input.expiresAt);

  try { await responseRepository().create(request); }
  catch (error) {
    if (error instanceof ResponseError) throw ApplicationFailure.nonRetryable(error.message, 'InvalidResponseRequest');
    throw error;
  }

  if (!(await responseReminderRepository().initialSent(input.taskId)) && Date.parse(input.expiresAt) > Date.now() && !(await responseRepository().find(input.taskId))?.completed) {
    const recipient = await userRepository().findByEmail(input.recipient.email);
    const preference = recipient ? (await profileRepository().findByUserId(recipient.id)).taskResponsePreference : 'response-links';
    await sendThemedEmail(responseTaskEmail(input, `${origin.origin}/responses#token=${encodeURIComponent(token)}`, preference));
    await responseReminderRepository().recordInitialSent(input.taskId);
  }

  return { requestId: input.taskId };
}

export async function requestSimpleResponse({ choices, ...input }: SimpleInput) {
  return requestResponse({ ...input, definition: { kind: 'simple', choices } });
}

export async function requestComplexResponse({ fields, ...input }: ComplexInput) {
  return requestResponse({ ...input, definition: { kind: 'complex', fields } });
}

export async function getResponseResult(requestId: string): Promise<ResponseResult> {
  const repository = responseRepository();
  const request = await repository.find(requestId);
  const info = workflowIdentity();

  if (!request || request.namespace !== info.namespace || request.workflowId !== info.workflowId || request.runId !== info.runId) {
    throw ApplicationFailure.nonRetryable('Response belongs to another workflow execution', 'InvalidResponseRequest');
  }

  return repository.result(requestId);
}
