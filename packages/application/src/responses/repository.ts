import type { ResponseRequest, ResponseResult, ResponseView } from '@district/contracts/responses/types';

export interface ResponseRepository {
  create(request: ResponseRequest): Promise<void>;
  find(requestId: string): Promise<ResponseRequest & { completed: boolean } | null>;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Response fields are dynamic; completion validates answers against the stored definition.
  complete(requestId: string, actor: { id: string; email: string }, answers: unknown, now?: Date): Promise<void>;
  result(requestId: string): Promise<ResponseResult>;
}

export type { ResponseView };
