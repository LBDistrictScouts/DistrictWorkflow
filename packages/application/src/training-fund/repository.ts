import type { TrainingFundApplication, TrainingFundState } from '@district/contracts/training-fund/types';

export interface TrainingFundRecord {
  workflowId: string;
  revision: number;
  state: TrainingFundState;
}

export class ProjectionConflict extends Error {}

/** Business ledger; implementations must atomically save a snapshot and its audit entry. */
export interface TrainingFundRepository {
  findPendingForEmail(email: string): Promise<TrainingFundRecord[]>;
  save(record: TrainingFundRecord): Promise<void>;
  findByApplicationId(applicationId: string): Promise<TrainingFundRecord | null>;
  findByWorkflowId(workflowId: string): Promise<TrainingFundRecord | null>;
  /** Rejects reused IDs with different application data. */
  alreadyRecorded(application: TrainingFundApplication): Promise<boolean>;
}
