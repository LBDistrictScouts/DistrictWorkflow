import { trainingFundRequest, boundedJson, memberAuthenticated, sameOrigin } from '@/lib/training-fund-server';

import { memberSubmission } from '@district/application/training-fund/registration';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    if (!await memberAuthenticated()) return Response.json({ error: 'Please sign in through the members website before applying.' }, { status: 401 });
    let body;
    try { body = memberSubmission(await boundedJson(request)); }
    catch { return Response.json({ error: 'Invalid or oversized request' }, { status: 400 }); }
    const response = await trainingFundRequest('/applications', body);
    return Response.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Applications are temporarily unavailable. Please try again.' }, { status: 503 }); }
}
