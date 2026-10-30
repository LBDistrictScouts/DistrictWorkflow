import { trainingFundRequest, boundedJson, sameOrigin } from '@/lib/training-fund-server';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    let body;
    try { body = await boundedJson(request); }
    catch { return Response.json({ error: 'Invalid or oversized request' }, { status: 400 }); }
    const response = await trainingFundRequest('/task', body);
    return Response.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'This task is temporarily unavailable. Please try again.' }, { status: 503 }); }
}
