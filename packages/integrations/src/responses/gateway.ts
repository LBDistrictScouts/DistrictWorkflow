import { Client, Connection } from '@temporalio/client';
import { responseRepository } from '@district/persistence/runtime';
import { executeResponse } from '@district/application/responses/service';
import { responseCompletedSignal } from '@district/contracts/responses/types';
import { connectionOptions } from '../temporal/config';
import { verifyResponseLink } from './tokens';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export async function responseTaskRequest(body: unknown, actor: { id: string; email: string }) {
  return executeResponse(body, actor, { repository: responseRepository(), verifyLink: verifyResponseLink,
    async notify(request) {
      const connection = await Connection.connect({ ...connectionOptions, connectTimeout: '5 seconds' });

      try {
        const client = new Client({ connection, namespace: request.namespace });
        await connection.withDeadline(Date.now() + 5000, () => client.workflow.getHandle(request.workflowId, request.runId).signal(responseCompletedSignal, request.taskId));
      } finally { await connection.close(); }
    },
  });
}
