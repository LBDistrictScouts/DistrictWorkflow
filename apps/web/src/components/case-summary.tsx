import { cookies } from 'next/headers';
import { sessionCookie } from '@/lib/cognito';
import { verifyUserSession } from '@/lib/current-user';
import { workflowOverviewRepository } from '@district/persistence/runtime';

export default async function CaseSummary() {
  const token = (await cookies()).get(sessionCookie)?.value;
  const actor = token ? await verifyUserSession(token).catch(() => null) : null;

  if (!actor) return null;

  let summaries;

  try {
    const repository = workflowOverviewRepository();

    summaries = await Promise.all([
      repository.caseSummary('training-fund', actor.userId), repository.caseSummary('awards', actor.userId),
    ]);

  } catch {
    return <section className="section container"><p role="alert">Workflow summaries are temporarily unavailable.</p></section>;
  }

  const [applications, awards] = summaries;

  return <section className="section container"><h2>Workflow overview</h2><p>Applications and awards, counted once regardless of their tasks or processing runs.</p>
      <dl className="workflow-metrics"><div><dt>Applications</dt><dd>{applications.total}</dd></div><div><dt>Awards</dt><dd>{awards.total}</dd></div><div><dt>Open cases</dt><dd>{applications.open + awards.open}</dd></div><div><dt>Completed cases</dt><dd>{applications.completed + awards.completed}</dd></div></dl></section>;
}
