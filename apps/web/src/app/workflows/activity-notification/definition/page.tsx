import { activityNotificationMachine } from '@district/domain/activity-notification/machine';
import { machineToGraph } from '@/vendor/sketch/machine';
import WorkflowFlow from '@/components/workflow-flow';

export const metadata = { title: 'Activity Approvals · Definition' };
const graph = machineToGraph(activityNotificationMachine);

export default function Page() {
  return <><header className="page-hero"><div className="container"><p className="eyebrow">Activity Approvals / Definition</p><h1>Activity approval definition</h1><p>From a submitted notification to the first team approval.</p></div></header>
    <div className="section container"><p>Each submitted notification opens a case and creates one shared approval task for the activity out-of-district team. The first team member to approve completes that task for everyone.</p>
      <WorkflowFlow id="activity-approval-flow" graph={graph} title="Activity approval lifecycle · XState" />
      <aside className="welcome-note"><div><h3>After approval</h3><p>The applicant receives an approval email. Activity details, dates, groups, sections and participant counts are retained for future statistics.</p></div></aside>
    </div></>;
}
