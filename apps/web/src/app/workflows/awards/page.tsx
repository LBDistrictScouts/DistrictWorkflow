import { unstable_rethrow } from 'next/navigation';
import type { Metadata } from 'next';
import WorkflowDetail from '@/components/workflow-detail';
import { workflowCaseSummary } from '@/lib/workflow-tasks';

export const metadata: Metadata = { title: 'Awards' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  let summary: Awaited<ReturnType<typeof workflowCaseSummary>> = { total: 0, open: 0, completed: 0, cancelled: 0 }; let unavailable = false;

  try { summary = await workflowCaseSummary('awards'); } catch (error) { unstable_rethrow(error); unavailable = true; }

  return <WorkflowDetail slug="awards" name="Awards" description="Import awards and organise their presentation." summary={summary} unavailable={unavailable} />;
}
