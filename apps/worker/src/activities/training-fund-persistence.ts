import { ApplicationFailure } from '@temporalio/common';
import { ProjectionConflict, type TrainingFundRecord } from '@district/application/training-fund/repository';
import { trainingFundRepository } from '@district/persistence/runtime';

export async function persistTrainingFundState(record: TrainingFundRecord): Promise<void> {
  try { await trainingFundRepository().save(record); }
  catch (error) {
    if (error instanceof ProjectionConflict) throw ApplicationFailure.nonRetryable(error.message, 'ProjectionConflict');
    throw error; // Connectivity failures remain retryable.
  }
}
