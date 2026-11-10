import { unstable_rethrow } from 'next/navigation';
import { workflowTasks } from '@/lib/workflow-tasks';
import WorkflowTaskList from '@/components/workflow-task-list';

export const metadata = { title: 'Activity Approvals · Tasks', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function Page() {
  let tasks: Awaited<ReturnType<typeof workflowTasks>> = []; let unavailable = false;

  try { tasks = await workflowTasks('activity-notification', true); }
  catch (error) { unstable_rethrow(error); unavailable = true; }

  return <><header className="page-hero"><div className="container"><p className="eyebrow">Activity Approvals / Tasks</p><h1>Activity approval tasks</h1><p>Review your team’s activity notifications. The first approval completes the shared task.</p></div></header><div className="section container">{unavailable ? <p role="alert">Tasks are temporarily unavailable. Refresh this page to try again.</p> : <WorkflowTaskList tasks={tasks} />}</div></>;
}
