import { condition, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';
import { responseCompletedSignal } from '@district/contracts/responses/types';
import type { requestSimpleResponse, requestComplexResponse, getResponseResult } from '../activities/responses';

/** Initialise once at workflow start, before requesting any response tasks. */
export function responseActivities() {
  const completed = new Set<string>();
  setHandler(defineSignal<[string]>(responseCompletedSignal), id => { completed.add(id); });

  const activities = proxyActivities<{
    requestSimpleResponse: typeof requestSimpleResponse;
    requestComplexResponse: typeof requestComplexResponse;
    getResponseResult: typeof getResponseResult;
  }>({ startToCloseTimeout: '30 seconds', retry: { initialInterval: '5 seconds', maximumInterval: '5 minutes' } });

  // Temporal's proxy resolves properties lazily and cannot be object-spread.
  return {
    requestSimpleResponse: activities.requestSimpleResponse,
    requestComplexResponse: activities.requestComplexResponse,
    getResponseResult: activities.getResponseResult,
    async waitForResponse(requestId: string) {
      while (true) {
        const result = await activities.getResponseResult(requestId);

        if (result.status !== 'pending') { completed.delete(requestId);

 return result; }

        // Signalling is a latency optimisation. Polling repairs a lost post-commit signal.
        await condition(() => completed.has(requestId), '5 minutes');
        completed.delete(requestId);
      }
    },
  };
}
