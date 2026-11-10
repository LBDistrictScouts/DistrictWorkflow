import { unstable_rethrow } from 'next/navigation';
import WorkflowDetail from '@/components/workflow-detail';
import { workflowCaseSummary } from '@/lib/workflow-tasks';

export const metadata = { title: 'Activity Approvals' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  let summary: Awaited<ReturnType<typeof workflowCaseSummary>> = { total: 0, open: 0, completed: 0, cancelled: 0 }; let unavailable = false;

  try { summary = await workflowCaseSummary('activity-notification'); }
  catch (error) { unstable_rethrow(error); unavailable = true; }

  return <WorkflowDetail slug="activity-notification" name="Activity Approvals" description="Review activity notifications and keep applicants informed of approval." summary={summary} unavailable={unavailable} />;
}
