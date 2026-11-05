/** New workflow runs use <workflow-code>-<UUID>; callers retain the UUID across retries. */
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function workflowIdForUuid(code: string, id: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(code) || !uuidPattern.test(id)) throw new TypeError('Invalid workflow identifier');

  return `${code}-${id.toLowerCase()}`;
}
