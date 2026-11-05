import { isDeepStrictEqual } from 'node:util';
import { eq } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { ResponseRepository } from '@district/application/responses/repository';
import { ResponseError, validateResponseRequest, validateResponseAnswers } from '@district/contracts/responses/validation';
import { encryptResponse, decryptResponse } from './response-crypto';
import * as s from './schema';

export function createResponseRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof s>): ResponseRepository {
  return {
    async create(request) {
      validateResponseRequest(request);
      await db.transaction(async tx => {
        const [task] = await tx.select().from(s.tasks).where(eq(s.tasks.id, request.taskId)).for('update');

        if (!task) throw new ResponseError(409, 'The response task does not exist');
        const [run] = await tx.select().from(s.workflowExecutions).where(eq(s.workflowExecutions.id, task.workflowExecutionId));

        if (!run || run.namespace !== request.namespace || run.temporalWorkflowId !== request.workflowId || run.temporalRunId !== request.runId) throw new ResponseError(409, 'The task belongs to another workflow execution');
        const [existing] = await tx.select().from(s.responseRequests).where(eq(s.responseRequests.taskId, request.taskId));

        if (existing) {
          if (!isDeepStrictEqual(existing.request, request)) throw new ResponseError(409, 'The response task already has a different request');

          return;
        }

        if (task.status === 'completed' || Date.parse(request.expiresAt) <= Date.now()) throw new ResponseError(409, 'The response task is completed or expired');
        await tx.insert(s.responseRequests).values({ taskId: request.taskId, request, expiresAt: new Date(request.expiresAt) });
      });
    },
    async find(requestId) {
      const [row] = await db.select().from(s.responseRequests).where(eq(s.responseRequests.taskId, requestId));

      return row ? { ...row.request, completed: row.completedAt !== null } : null;
    },
    async complete(requestId, actor, answers, now = new Date()) {
      await db.transaction(async tx => {
        // Always lock task before request, matching create() and avoiding lock inversions.
        const [task] = await tx.select().from(s.tasks).where(eq(s.tasks.id, requestId)).for('update');
        const [row] = await tx.select().from(s.responseRequests).where(eq(s.responseRequests.taskId, requestId)).for('update');

        if (!task || !row) throw new ResponseError(403, 'Response task not found');

        if (row.request.recipient.email.trim().toLowerCase() !== actor.email.trim().toLowerCase()) throw new ResponseError(403, 'This response is assigned to another recipient');
        const validated = validateResponseAnswers(row.request.definition, answers);

        if (row.completedAt) {
          if (row.completedBy !== actor.id || !isDeepStrictEqual(decryptResponse(requestId, row.answerCiphertext!), validated)) throw new ResponseError(409, 'A different response has already been recorded');

          return;
        }

        if (row.expiresAt <= now) throw new ResponseError(410, 'This response task has expired');

        if (task.status === 'completed') throw new ResponseError(409, 'This task has already been completed');
        await tx.update(s.responseRequests).set({ answerCiphertext: encryptResponse(requestId, validated), completedBy: actor.id, completedAt: now }).where(eq(s.responseRequests.taskId, requestId));
        await tx.insert(s.taskSubmissions).values({ taskId: requestId, submittedBy: actor.id, answers: { responseId: requestId } });
        await tx.update(s.tasks).set({ status: 'completed', completedBy: actor.id, completedAt: now, updatedBy: actor.id, updatedAt: now }).where(eq(s.tasks.id, requestId));
      });
    },
    async result(requestId) {
      const [row] = await db.select().from(s.responseRequests).where(eq(s.responseRequests.taskId, requestId));

      if (!row) throw new ResponseError(403, 'Response task not found');

      if (!row.completedAt) return { requestId, status: row.expiresAt.getTime() <= Date.now() ? 'expired' : 'pending' };

      return { requestId, responseId: requestId, status: 'completed',
        // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
        ...(row.request.definition.kind === 'simple' ? { choice: decryptResponse(requestId, row.answerCiphertext!).choice } : {}),
      };
    },
  };
}
