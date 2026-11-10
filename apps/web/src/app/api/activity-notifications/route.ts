import { parseObject } from '@district/contracts/boundary';
import { uuidPattern } from '@district/contracts/workflows/identity';
import { activityNotificationRepository } from '@district/persistence/runtime';
import { authenticatedRegistrar, boundedJson, sameOrigin } from '@/lib/training-fund-server';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request) {
  const actor = await authenticatedRegistrar();

  if (!actor) return Response.json({ error: 'Please sign in' }, { status: 401, headers });

  try {
    const taskId = new URL(request.url).searchParams.get('task');

    if (taskId && !uuidPattern.test(taskId)) return Response.json({ error: 'Invalid task' }, { status: 400, headers });
    const tasks = await activityNotificationRepository().list(actor.id, true);

    if (taskId) {
      const task = tasks.find(row => row.task.id === taskId);

      return task ? Response.json(task, { headers }) : Response.json({ error: 'Task unavailable or you do not have access.' }, { status: 404, headers });
    }

    return Response.json({ tasks }, { headers });
  }
  catch { return Response.json({ error: 'Activity tasks are temporarily unavailable' }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const actor = await authenticatedRegistrar();

  if (!actor) return Response.json({ error: 'Please sign in' }, { status: 401, headers });

  try {
    const body = parseObject(await boundedJson(request));

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate task identity at the HTTP boundary.
    if (typeof body.taskId !== 'string' || !uuidPattern.test(body.taskId) || body.action !== 'approve') throw new TypeError('Invalid approval request');
    const result = await activityNotificationRepository().approve(body.taskId, actor.id);

    return Response.json(result, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof TypeError ? error.message : 'Approval could not be saved. Please retry.' }, { status: error instanceof TypeError ? 400 : 503, headers });
  }
}
