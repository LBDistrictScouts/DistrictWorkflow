import { trainingFundMachine } from '@district/domain/training-fund/machine';
import { paymentFlowMachine } from '@district/domain/payments/machine';
import { machineToGraph } from '@/vendor/sketch/machine';
import WorkflowFlow from '@/components/workflow-flow';

// The definition is deployment code, so reuse its graph for this server module's lifetime.
const graph = machineToGraph(trainingFundMachine);
const paymentGraph = machineToGraph(paymentFlowMachine);

export default function TrainingFundFlow() {
  return <><p className="fund-hint">This chart shows the agreed process definition. Rejection, bank-details and appeal steps are awaiting integration with the running workflow.</p><WorkflowFlow id="training-fund-flow" graph={graph} title="Training Fund workflow" /><details><summary>Reusable payment workflow: details request → receipt → treasurer payment</summary><WorkflowFlow id="training-fund-payment-flow" graph={paymentGraph} title="Reusable payment workflow" /></details></>;
}
