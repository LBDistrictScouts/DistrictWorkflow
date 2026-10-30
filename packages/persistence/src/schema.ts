import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { TrainingFundState } from '@district/contracts/training-fund/types';

export const trainingFundStatus = pgEnum('training_fund_status', ['awaiting_approvals', 'awaiting_payment', 'paid']);

export const trainingFundApplications = pgTable('training_fund_applications', {
  applicationId: uuid('application_id').primaryKey(),
  workflowId: text('workflow_id').notNull().unique(),
  status: trainingFundStatus('status').notNull(),
  revision: integer('revision').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  state: jsonb('state').$type<TrainingFundState>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index('training_fund_status_submitted_idx').on(table.status, table.submittedAt),
  check('training_fund_revision_nonnegative', sql`${table.revision} >= 0`),
  check('training_fund_state_id_matches', sql`(${table.state}->'application'->>'applicationId')::uuid = ${table.applicationId}`),
  check('training_fund_state_status_matches', sql`${table.state}->>'status' = ${table.status}::text`),
]);

export const trainingFundTransitions = pgTable('training_fund_transitions', {
  applicationId: uuid('application_id').notNull().references(() => trainingFundApplications.applicationId),
  revision: integer('revision').notNull(),
  status: trainingFundStatus('status').notNull(),
  state: jsonb('state').$type<TrainingFundState>().notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  primaryKey({ columns: [table.applicationId, table.revision] }),
  check('training_fund_transition_revision_nonnegative', sql`${table.revision} >= 0`),
  check('training_fund_transition_state_id_matches', sql`(${table.state}->'application'->>'applicationId')::uuid = ${table.applicationId}`),
  check('training_fund_transition_state_status_matches', sql`${table.state}->>'status' = ${table.status}::text`),
]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  active: integer('active').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
});
export const userEmails = pgTable('user_emails', {
  userId: uuid('user_id').notNull().references(() => users.id),
  email: text('email').notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.email] }),
  index('user_emails_email_idx').on(table.email),
]);
