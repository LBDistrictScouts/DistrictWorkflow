import { parseObject } from '@district/contracts/boundary';
import { uuidPattern } from '@district/contracts/workflows/identity';
import { authenticatedRegistrar, boundedJson, sameOrigin } from '@/lib/training-fund-server';
import { parseAwardsFile } from '@district/integrations/awards/import';
import { notifyAwardsProgress, startAwards, awardImportStatus } from '@district/integrations/awards/gateway';
import { awardsRepository } from '@district/persistence/runtime';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const actor = await authenticatedRegistrar();

  if (!actor) return Response.json({ error: 'Please sign in' }, { status: 401, headers });

  try {
    const taskId = new URL(request.url).searchParams.get('task');

    if (taskId) {
      if (!uuidPattern.test(taskId)) return Response.json({ error: 'Invalid task' }, { status: 400, headers });
      const task = (await awardsRepository().list(actor.id, true)).find(task => task.id === taskId);

      if (!task) return Response.json({ error: 'Task unavailable or you do not have access.' }, { status: 404, headers });

      return Response.json({ task, people: await awardsRepository().assignees() }, { headers });
    }

    const id = new URL(request.url).searchParams.get('import');

    return Response.json(id ? await awardImportStatus(id) : { tasks: await awardsRepository().list(actor.id, new URL(request.url).searchParams.get('history') === 'all'), people: await awardsRepository().assignees() }, { headers });
  } catch { return Response.json({ error: 'Awards are temporarily unavailable. Please retry.' }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const actor = await authenticatedRegistrar();

  if (!actor) return Response.json({ error: 'Please sign in' }, { status: 401, headers });

  try {
    const reader = request.body?.getReader();

    if (!reader) throw new TypeError('Choose a file');
    const chunks: Uint8Array[] = []; let length = 0;

    while (true) {
      const { done, value } = await reader.read();

 if (done) break;
      length += value.length;

      if (length > 2 * 1024 * 1024) { await reader.cancel(); throw new TypeError('File must be smaller than 2 MB'); }

      chunks.push(value);
    }

    const importId = request.headers.get('x-import-id') ?? '';

    if (!uuidPattern.test(importId)) throw new TypeError('Invalid import identifier');
    const rows = await parseAwardsFile(Buffer.concat(chunks), decodeURIComponent(request.headers.get('x-filename') ?? ''));
    await awardsRepository().checkConfigured();
    const workflowId = await startAwards(rows, actor.id, importId);

    return Response.json({ workflowId }, { status: 202, headers });
  } catch (error) { return Response.json({ error: error instanceof TypeError ? error.message : 'Import could not start. Please retry.' }, { status: error instanceof TypeError ? 400 : 503, headers }); }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const actor = await authenticatedRegistrar();

  if (!actor) return Response.json({ error: 'Please sign in' }, { status: 401, headers });

  try {
    const body = parseObject(await boundedJson(request));

    if (body.action === 'receive') {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
      if (!Array.isArray(body.taskIds) || !body.taskIds.every(id => typeof id === 'string' && uuidPattern.test(id))) throw new TypeError('Select valid awards');
      await awardsRepository().receiveMany(body.taskIds, actor.id);
    } else if (body.action === 'add-assignee' || body.action === 'remove-assignee') {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
      if (typeof body.taskId !== 'string' || !uuidPattern.test(body.taskId) || typeof body.assignee !== 'string' || !uuidPattern.test(body.assignee)) throw new TypeError('Invalid assignee request');
      await awardsRepository().updateAssignees(body.taskId, actor.id, body.action, body.assignee);
    } else {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
      if (typeof body.taskId !== 'string' || !uuidPattern.test(body.taskId) || (body.action !== 'assign' && body.action !== 'complete' && body.action !== 'schedule') || (body.action === 'assign' && body.assignee !== null && (typeof body.assignee !== 'string' || !uuidPattern.test(body.assignee))) || (body.action === 'schedule' && typeof body.presentationDate !== 'string')) throw new TypeError('Invalid task request');
      const workflowId = await awardsRepository().change(body.taskId, actor.id, body.action, body.action === 'assign' ? (body.assignee === null ? null : String(body.assignee)) : null, body.action === 'schedule' ? String(body.presentationDate) : undefined);

      if (body.action === 'complete') {
        try { await notifyAwardsProgress(workflowId); } catch { /* The shared reminder scan repairs a missed post-commit signal. */ }
      }
    }

    return Response.json({ ok: true }, { headers });
  } catch (error) { return Response.json({ error: error instanceof TypeError ? error.message : 'Task could not be updated. Please retry.' }, { status: error instanceof TypeError ? 400 : 503, headers }); }
}
