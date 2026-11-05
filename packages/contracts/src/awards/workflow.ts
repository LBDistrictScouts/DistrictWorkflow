import { uuidPattern, workflowIdForUuid } from '../workflows/identity';

export const awardsWorkflowIdFor = (importId: string) => workflowIdForUuid('awards', importId);

/** Existing hash-based executions remain queryable, but new runs use UUIDs. */
export function isAwardsWorkflowId(id: string): boolean {
  return id.startsWith('awards-') && (uuidPattern.test(id.slice(7)) || /^[a-f0-9]{64}$/.test(id.slice(7)));
}
