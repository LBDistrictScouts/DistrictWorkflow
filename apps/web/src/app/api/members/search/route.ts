import { userRepository } from '@district/persistence/runtime';
import { authenticatedRegistrar } from '@/lib/training-fund-server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };

  try {
    if (!await authenticatedRegistrar()) return Response.json({ error: 'Please sign in to search members.' }, { status: 401, headers });
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';

    if (query.length < 2) return Response.json({ members: [] }, { headers });

    if (query.length > 100) return Response.json({ error: 'Search must be at most 100 characters.' }, { status: 400, headers });

    return Response.json({ members: await userRepository().searchActiveUsers(query) }, { headers });
  } catch { return Response.json({ error: 'Member search is temporarily unavailable. Please try again.' }, { status: 503, headers }); }
}
