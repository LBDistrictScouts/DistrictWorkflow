import { ApplicationFailure, condition, defineSignal, patched, continueAsNew, defineQuery, proxyActivities, setHandler, sleep, workflowInfo } from '@temporalio/workflow';
import type { AwardRow, AwardImportStatus } from '@district/contracts/awards/types';
import type * as awards from '../activities/awards';
import type { getMemberProfileByMembershipNumber, resolveRoleUser } from '../activities/directory';

const tasks = proxyActivities<typeof awards>({ startToCloseTimeout: '30 seconds' });
const directory = proxyActivities<{ getMemberProfileByMembershipNumber: typeof getMemberProfileByMembershipNumber; resolveRoleUser: typeof resolveRoleUser }>({ startToCloseTimeout: '40 seconds', retry: { maximumAttempts: 3 } });

interface Input { rows: AwardRow[]; createdBy: string; resumed?: { execution: { executionId: string; stepId: string; tagId: string }; status: AwardImportStatus } }

export async function awardsWorkflow(input: Input): Promise<AwardImportStatus> {
  let changed = false;
  setHandler(defineSignal('awardsProgressChanged'), () => { changed = true; });
  const status: AwardImportStatus = input.resumed?.status ?? { processed: 0, total: input.rows.length, errors: [], ready: false };
  setHandler(defineQuery<AwardImportStatus>('awardImportStatus'), () => status);
  const info = workflowInfo();
  const execution = input.resumed?.execution ?? await tasks.initializeAwards({ workflowId: info.workflowId, runId: info.runId, namespace: info.namespace });
  const assignees = !input.resumed && patched('awards-resolve-assignees-v1') ? await directory.resolveRoleUser('DLV') : undefined;

  if (assignees && !assignees.length) throw ApplicationFailure.nonRetryable('DLV has no active users to assign awards to', 'MissingAwardAssignees');

  if (!input.resumed) for (const [index, row] of input.rows.entries()) {
    let recipient;

    try { recipient = await directory.getMemberProfileByMembershipNumber(row.membershipNumber); }
    catch { status.errors.push({ row: row.sourceRow ?? index + 2, message: 'Member lookup failed. Retry this row in a new import.' }); }

    if (recipient === null) status.errors.push({ row: row.sourceRow ?? index + 2, message: 'Membership number not found.' });

    // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
    if (recipient) await tasks.createAwardTask({ ...execution, occurrence: index + 1, context: { ...row, recipient }, ...(assignees ? { assignees } : {}), createdBy: input.createdBy });
    status.processed++;
  }

  status.ready = true;

  for (let polls = 0; !await tasks.finishAwardsIfComplete(execution.executionId); polls++) {
    if (patched('awards-signal-wait-v1')) {
      await condition(() => changed);
      changed = false;
      continue;
    }

    if (polls >= 1000) return continueAsNew<typeof awardsWorkflow>({ ...input, rows: [], resumed: { execution, status } });
    await sleep('1 minute');
  }

  return status;
}
