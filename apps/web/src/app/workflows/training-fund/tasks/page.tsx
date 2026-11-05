import { unstable_rethrow } from 'next/navigation';
import { workflowTasks } from '@/lib/workflow-tasks';
import WorkflowTaskList from '@/components/workflow-task-list';

export const metadata = { title: 'Training Fund · Tasks' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  let tasks: Awaited<ReturnType<typeof workflowTasks>> = []; let unavailable = false;

  try { tasks = await workflowTasks('training-fund', true); } catch (error) { unstable_rethrow(error); unavailable = true; }

  return <><header className="page-hero"><div className="container"><p className="eyebrow">Training Fund / Tasks</p><h1>Training Fund tasks</h1><p>All approval and payment tasks for this workflow. You can act on tasks assigned to you.</p></div></header><div className="section container">{unavailable ? <p role="alert">Tasks are temporarily unavailable. Refresh this page to try again.</p> : <WorkflowTaskList tasks={tasks} />}</div></>;
}
