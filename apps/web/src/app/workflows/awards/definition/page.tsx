import { awardsMachine } from '@district/domain/awards/machine';
import { awardsImportMachine } from '@district/domain/awards/import-machine';
import { machineToGraph } from '@/vendor/sketch/machine';
import WorkflowFlow from '@/components/workflow-flow';

export const metadata = { title: 'Awards · Definition' };
const importGraph = machineToGraph(awardsImportMachine);
const taskGraph = machineToGraph(awardsMachine);

export default function Page() {
  return <><header className="page-hero"><div className="container"><p className="eyebrow">Awards / Definition</p><h1>Awards definition</h1><p>The import process and the lifecycle of each award task.</p></div></header>
    <div className="section container">
      <nav className="workflow-navigation" aria-label="Awards definition sections"><a href="#awards-import-flow-title">Import workflow</a><a href="#awards-flow-title">Award task lifecycle</a></nav>
      <p>The Temporal import workflow resolves assignees, enriches each recipient and creates the award tasks. This diagram summarises that orchestration.</p>
      <WorkflowFlow id="awards-import-flow" graph={importGraph} title="Import workflow · Temporal" />
      <aside className="welcome-note"><div><h3>From import to presentation</h3><p>Each successful row creates a task at <strong>Award listed</strong> in the lifecycle below. Those tasks progress independently. The import finishes once every created task has been presented; failed rows are reported separately.</p></div></aside>
      <p>This XState definition controls the transitions available on each award task, including receipt, scheduling, reassignment and presentation.</p>
      <WorkflowFlow id="awards-flow" graph={taskGraph} title="Award task lifecycle · XState" />
      <aside className="welcome-note"><div><h3>Presentation reminders</h3><p>A shared scheduled workflow checks for reminders every 15 minutes. It notifies the assignees at or after 9am London time, three days before the presentation and on the day. It uses the saved presentation date and assignments, without a timer for each award.</p></div></aside>
    </div></>;
}
