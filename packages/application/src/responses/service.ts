import { parseObject } from '@district/contracts/boundary';
import type { ResponseRepository } from './repository';
import type { ResponseView } from '@district/contracts/responses/types';
import { ResponseError } from '@district/contracts/responses/validation';

export interface ResponseDependencies {
  repository: ResponseRepository;
  verifyLink(token: string): string;
  notify(request: { namespace: string; workflowId: string; runId: string; taskId: string }): Promise<void>;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export async function executeResponse(body: unknown, actor: { id: string; email: string }, dependencies: ResponseDependencies): Promise<ResponseView> {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ResponseError(400, 'Invalid response request');
  const command = parseObject(body);

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (typeof command.token !== 'string' || !['view', 'submit'].includes(String(command.action))) throw new ResponseError(400, 'Invalid response request');
  const requestId = dependencies.verifyLink(command.token);
  const request = await dependencies.repository.find(requestId);

  if (!request || request.recipient.email.trim().toLowerCase() !== actor.email.trim().toLowerCase()) throw new ResponseError(403, 'This response is assigned to another recipient');

  if (Date.parse(request.expiresAt) <= Date.now()) throw new ResponseError(410, 'This response task has expired');

  if (command.action === 'submit') {
    await dependencies.repository.complete(requestId, actor, command.answers);

    // Persistence is authoritative. A lost signal is repaired by the workflow helper's periodic read.
    try { await dependencies.notify(request); }
    catch { console.warn('Response saved; workflow completion notification deferred to polling'); }
  }

  return { requestId, heading: request.heading, instructions: request.instructions, definition: request.definition,
    completed: command.action === 'submit' || request.completed, expiresAt: request.expiresAt };
}
