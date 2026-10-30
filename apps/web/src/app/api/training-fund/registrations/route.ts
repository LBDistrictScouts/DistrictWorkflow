import { authenticatedRegistrar, trainingFundRequest, boundedJson, sameOrigin } from '@/lib/training-fund-server';
import { staffSubmission } from '@district/application/training-fund/registration';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  try {
    const staff = await authenticatedRegistrar();
    if (!staff) return Response.json({ error: 'A workflow staff session with application registration permission is required.' }, { status: 403 });
    let application;
    try { application = staffSubmission(await boundedJson(request), staff); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid registration' }, { status: 400 }); }
    const response = await trainingFundRequest('/applications', application);
    return Response.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Registration is temporarily unavailable. Please try again.' }, { status: 503 }); }
}
