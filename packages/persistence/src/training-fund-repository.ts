import { isDeepStrictEqual } from 'node:util';
import { and, eq, asc, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { ProjectionConflict, type TrainingFundRecord, type TrainingFundRepository } from '@district/application/training-fund/repository';
import type { TrainingFundApplication } from '@district/contracts/training-fund/types';
import { parseApplication } from '@district/contracts/training-fund/validation';
import { workflowIdFor } from '@district/contracts/training-fund/workflow';
import * as schema from './schema';

const { trainingFundApplications: applications, trainingFundTransitions: transitions } = schema;
const record = (row: typeof applications.$inferSelect): TrainingFundRecord => ({ workflowId: row.workflowId, revision: row.revision, state: row.state });

// A staff HTTP retry stamps a fresh server receipt time. It must retain the
// original ledger provenance without treating that timestamp as changed content.
function submissionForDedup(application: TrainingFundApplication) {
  if (application.submission?.channel !== 'staff') return application;
  return { ...application, submission: { ...application.submission, registeredAt: null } };
}

export function createTrainingFundRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof schema>): TrainingFundRepository {
  return {
    async findPendingForEmail(email) {
      const normalized = email.trim().toLowerCase();
      if (!normalized) return [];
      const rows = await db.select().from(applications).where(sql`
        (${applications.status} = 'awaiting_approvals' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(${applications.state}->'routing'->'approvers') AS person
          WHERE lower(trim(person->>'email')) = ${normalized}
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(${applications.state}->'approvals') AS approval
            WHERE approval->>'personId' = person->>'id'
          )
        )) OR (${applications.status} = 'awaiting_payment'
          AND lower(trim(${applications.state}->'routing'->'treasurer'->>'email')) = ${normalized})
      `).orderBy(asc(applications.submittedAt), asc(applications.workflowId));
      return rows.map(record);
    },
    async save(input) {
      const { workflowId, revision, state } = input;
      const application = parseApplication(state.application);
      if (workflowId !== workflowIdFor(application.applicationId) || !Number.isSafeInteger(revision) || revision < 0) {
        throw new ProjectionConflict('Invalid Training Fund projection identity or revision');
      }
      if (revision !== state.approvals.length + (state.payment ? 1 : 0)) throw new ProjectionConflict('Invalid projection revision');
      const applicationId = application.applicationId;
      await db.transaction(async tx => {
        if (revision === 0) {
          await tx.insert(applications).values({ applicationId, workflowId, revision, status: state.status, submittedAt: new Date(application.submittedAt), state })
            .onConflictDoNothing({ target: applications.applicationId });
        }
        // Serialize writers for this application, including activity retries.
        const [current] = await tx.select().from(applications).where(eq(applications.applicationId, applicationId)).for('update');
        if (!current) throw new ProjectionConflict('Initial application projection is required');
        if (current.workflowId !== workflowId || !isDeepStrictEqual(current.state.application, application) || !isDeepStrictEqual(current.state.routing, state.routing)) {
          throw new ProjectionConflict('Application identity, submitted data and routing are immutable');
        }
        const [previous] = await tx.select().from(transitions).where(and(eq(transitions.applicationId, applicationId), eq(transitions.revision, revision)));
        if (previous) {
          if (!isDeepStrictEqual(previous.state, state)) throw new ProjectionConflict('Revision already contains a different decision');
          return; // A delayed retry must never overwrite a newer snapshot.
        }
        const initial = current.revision === 0 && revision === 0;
        if (!initial && revision !== current.revision + 1) throw new ProjectionConflict('Projection revisions must be consecutive');
        await tx.insert(transitions).values({ applicationId, revision, status: state.status, state });
        await tx.update(applications).set({ revision, status: state.status, state, updatedAt: new Date() }).where(eq(applications.applicationId, applicationId));
      });
    },
    async findByApplicationId(applicationId) {
      const [row] = await db.select().from(applications).where(eq(applications.applicationId, applicationId));
      return row ? record(row) : null;
    },
    async findByWorkflowId(workflowId) {
      const [row] = await db.select().from(applications).where(eq(applications.workflowId, workflowId));
      return row ? record(row) : null;
    },
    async alreadyRecorded(application) {
      const saved = await this.findByApplicationId(application.applicationId);
      if (!saved) return false;
      if (!isDeepStrictEqual(submissionForDedup(saved.state.application), submissionForDedup(application))) throw new ProjectionConflict('Application ID already belongs to a different submission');
      return true;
    },
  };
}
