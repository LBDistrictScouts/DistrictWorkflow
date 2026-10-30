import type { TrainingFundApplication, TrainingFundRouting } from '@district/contracts/training-fund/types';
import { parseApplication } from '@district/contracts/training-fund/validation';
import { workflowIdFor } from '@district/contracts/training-fund/workflow';

export interface IntakeDependencies {
  start(application: TrainingFundApplication, routing: TrainingFundRouting, workflowId: string): Promise<unknown>;
  alreadyRecorded?(application: TrainingFundApplication): Promise<boolean>;
  isDuplicate(error: unknown): boolean;
  acknowledge(): Promise<unknown>;
}
export async function consumeApplication(body: string, routing: TrainingFundRouting, dependencies: IntakeDependencies): Promise<'started' | 'duplicate'> {
  const application = parseApplication(JSON.parse(body));
  let outcome: 'started' | 'duplicate' = 'started';
  if (await dependencies.alreadyRecorded?.(application)) {
    outcome = 'duplicate';
  } else {
    try {
      await dependencies.start(application, routing, workflowIdFor(application.applicationId));
    } catch (error) {
      if (!dependencies.isDuplicate(error)) throw error;
      outcome = 'duplicate';
    }
  }
  // Once Temporal owns the application, never hold an SQS receipt during human review.
  await dependencies.acknowledge();
  return outcome;
}
