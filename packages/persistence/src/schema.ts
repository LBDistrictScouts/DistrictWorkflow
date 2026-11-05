import { sql } from 'drizzle-orm';
import { check, date, index, integer, jsonb, pgEnum, pgTable, unique, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { TrainingFundState } from '@district/contracts/training-fund/types';

export const trainingFundStatus = pgEnum('training_fund_status', ['awaiting_approvals', 'awaiting_payment', 'paid']);

export const trainingFundApplications = pgTable('training_fund_applications', {
  workflowCaseId: uuid('workflow_case_id').references(() => workflowCases.id),
  applicationId: uuid('application_id').primaryKey(),
  workflowId: text('workflow_id').notNull().unique(),
  applicantUserId: uuid('applicant_user_id').references(() => users.id),
  status: trainingFundStatus('status').notNull(),
  revision: integer('revision').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  state: jsonb('state').$type<TrainingFundState>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check('training_fund_applicant_user_matches', sql`${table.applicantUserId} IS NOT DISTINCT FROM (${table.state}->'application'->'applicant'->>'userId')::uuid`),
  index('training_fund_status_submitted_idx').on(table.status, table.submittedAt),
  check('training_fund_revision_nonnegative', sql`${table.revision} >= 0`),
  check('training_fund_state_id_matches', sql`(${table.state}->'application'->>'applicationId')::uuid = ${table.applicationId}`),
  check('training_fund_state_status_matches', sql`${table.state}->>'status' = ${table.status}::text`),
]);

export const trainingFundTransitions = pgTable('training_fund_transitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  applicationId: uuid('application_id').notNull().references(() => trainingFundApplications.applicationId),
  revision: integer('revision').notNull(),
  status: trainingFundStatus('status').notNull(),
  state: jsonb('state').$type<TrainingFundState>().notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  unique().on(table.applicationId, table.revision),
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

// Tag definitions: workflows look these up by code rather than display name.
export const userTags = pgTable('user_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  tagName: text('tag_name').notNull(),
  tagCode: text('tag_code').notNull().unique(),
}, table => [
  check('user_tags_name_not_blank', sql`${table.tagName} ~ '[^[:space:]]'`),
  check('user_tags_code_format', sql`${table.tagCode} ~ '^[A-Za-z0-9-]+$'`),
]);

export const userEmails = pgTable('user_emails', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  email: text('email').notNull(),
}, table => [
  unique().on(table.userId, table.email),
  index('user_emails_email_idx').on(table.email),
]);

export const userTagMemberships = pgTable('user_tag_memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userEmailId: uuid('user_email_id').notNull().references(() => userEmails.id, { onDelete: 'cascade' }),
  userTagId: uuid('user_tag_id').notNull().references(() => userTags.id),
}, table => [
  unique().on(table.userEmailId, table.userTagId),
  index('user_tag_memberships_tag_idx').on(table.userTagId),
]);

export const taskStatus = pgEnum('task_status', ['pending', 'in_progress', 'completed']);

// Published definitions are immutable; enforced by migration triggers.
export const workflows = pgTable('workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  temporalWorkflowType: text('temporal_workflow_type').notNull(),
}, table => [check('workflows_code_format', sql`${table.code} ~ '^[A-Za-z0-9-]+$'`)]);

export const workflowDefinitions = pgTable('workflow_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').notNull().references(() => workflows.id),
  version: integer('version').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, table => [unique().on(table.workflowId, table.version), check('workflow_definition_positive_version', sql`${table.version} > 0`)]);

export const taskTypes = pgTable('task_types', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
}, table => [check('task_types_code_format', sql`${table.code} ~ '^[A-Za-z0-9-]+$'`)]);

export const taskTypeDefinitions = pgTable('task_type_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskTypeId: uuid('task_type_id').notNull().references(() => taskTypes.id),
  version: integer('version').notNull(),
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- JSONB stores schema-defined documents with runtime keys; domain readers validate their contents.
  inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- JSONB stores schema-defined documents with runtime keys; domain readers validate their contents.
  outputSchema: jsonb('output_schema').$type<Record<string, unknown>>().notNull(),
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- JSONB stores schema-defined documents with runtime keys; domain readers validate their contents.
  uiSchema: jsonb('ui_schema').$type<Record<string, unknown>>().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, table => [
  unique().on(table.taskTypeId, table.version),
  check('task_type_definition_positive_version', sql`${table.version} > 0`),
  check('task_type_definition_schema_objects', sql`jsonb_typeof(${table.inputSchema}) = 'object' AND jsonb_typeof(${table.outputSchema}) = 'object' AND jsonb_typeof(${table.uiSchema}) = 'object'`),
]);

export const workflowSteps = pgTable('workflow_steps', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  taskTypeDefinitionId: uuid('task_type_definition_id').notNull().references(() => taskTypeDefinitions.id),
  stepCode: text('step_code').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  userTagId: uuid('user_tag_id').notNull().references(() => userTags.id),
}, table => [
  unique().on(table.workflowDefinitionId, table.stepCode),
  check('workflow_steps_code_format', sql`${table.stepCode} ~ '^[A-Za-z0-9-]+$'`),
  check('workflow_steps_text_not_blank', sql`${table.name} ~ '[^[:space:]]' AND ${table.description} ~ '[^[:space:]]'`),
]);

export const workflowExecutionStatus = pgEnum('workflow_execution_status', [
  'running', 'completed', 'failed', 'canceled', 'terminated', 'continued_as_new', 'timed_out',
]);

export const workflowExecutions = pgTable('workflow_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  namespace: text('namespace').notNull(),
  temporalWorkflowId: text('temporal_workflow_id').notNull(),
  temporalRunId: uuid('temporal_run_id').notNull(),
  firstExecutionRunId: uuid('first_execution_run_id'),
  status: workflowExecutionStatus('status').default('running').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, table => [
  unique().on(table.namespace, table.temporalWorkflowId, table.temporalRunId),
  check('execution_identity_not_blank', sql`${table.namespace} ~ '[^[:space:]]' AND ${table.temporalWorkflowId} ~ '[^[:space:]]'`),
]);

export const tasks = pgTable('tasks', {
  workflowCaseId: uuid('workflow_case_id').references(() => workflowCases.id),
  assignedUserId: uuid('assigned_user_id').references(() => users.id),
  id: uuid('id').defaultRandom().primaryKey(),
  workflowExecutionId: uuid('workflow_execution_id').notNull().references(() => workflowExecutions.id),
  workflowStepId: uuid('workflow_step_id').notNull().references(() => workflowSteps.id),
  occurrence: integer('occurrence').default(1).notNull(),
  userTagId: uuid('user_tag_id').notNull().references(() => userTags.id),
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- JSONB stores schema-defined documents with runtime keys; domain readers validate their contents.
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- JSONB stores schema-defined documents with runtime keys; domain readers validate their contents.
  draftAnswers: jsonb('draft_answers').$type<Record<string, unknown>>(),
  status: taskStatus('status').default('pending').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  updatedBy: uuid('updated_by').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: uuid('completed_by').references(() => users.id),
  auditNotes: text('audit_notes'),
}, table => [
  unique().on(table.workflowExecutionId, table.workflowStepId, table.occurrence),
  index('tasks_tag_status_idx').on(table.userTagId, table.status),
  check('tasks_positive_occurrence', sql`${table.occurrence} > 0`),
]);

export const taskSubmissions = pgTable('task_submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- JSONB stores schema-defined documents with runtime keys; domain readers validate their contents.
  answers: jsonb('answers').$type<Record<string, unknown>>().notNull(),
  submittedBy: uuid('submitted_by').notNull().references(() => users.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('task_submissions_task_idx').on(table.taskId)]);

// Business records can be shared by verification, authorisation and recording tasks.
export const payments = pgTable('payments', {
  workflowCaseId: uuid('workflow_case_id').references(() => workflowCases.id),
  id: uuid('id').defaultRandom().primaryKey(),
  workflowExecutionId: uuid('workflow_execution_id').notNull().references(() => workflowExecutions.id),
  payeeName: text('payee_name').notNull(),
  amountPence: integer('amount_pence').notNull(),
  transactionDate: date('transaction_date'),
  transactionReference: text('transaction_reference'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }),
  recordedBy: uuid('recorded_by').references(() => users.id),
}, table => [
  check('payments_positive_amount', sql`${table.amountPence} > 0`),
  check('payments_payee_not_blank', sql`${table.payeeName} ~ '[^[:space:]]'`),
]);

export const taskPayments = pgTable('task_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  paymentId: uuid('payment_id').notNull().references(() => payments.id),
}, table => [unique().on(table.taskId, table.paymentId)]);

// A recipient-specific response attached to an existing platform task.
// Raw answers are never stored in general task context/submissions.
export const responseRequests = pgTable('response_requests', {
  initialEmailSentAt: timestamp('initial_email_sent_at', { withTimezone: true }),
  reminderAttempts: integer('reminder_attempts').default(0).notNull(),
  lastReminderAttemptAt: timestamp('last_reminder_attempt_at', { withTimezone: true }),
  taskId: uuid('task_id').primaryKey().references(() => tasks.id),
  request: jsonb('request').$type<import('@district/contracts/responses/types').ResponseRequest>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  answerCiphertext: text('answer_ciphertext'),
  completedBy: uuid('completed_by').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [check('response_reminder_limit', sql`${table.reminderAttempts} BETWEEN 0 AND 2`), check('response_completion_consistent', sql`(${table.answerCiphertext} IS NULL AND ${table.completedAt} IS NULL AND ${table.completedBy} IS NULL) OR (${table.answerCiphertext} IS NOT NULL AND ${table.completedAt} IS NOT NULL AND ${table.completedBy} IS NOT NULL)`)]);

// User-owned settings are separate from the directory's authoritative profile.
export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  displayName: text('display_name'),
  taskResponsePreference: text('task_response_preference').$type<import('@district/contracts/profile/types').TaskResponsePreference>().notNull().default('response-links'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  check('user_profiles_display_name_valid', sql`${table.displayName} IS NULL OR (length(${table.displayName}) BETWEEN 1 AND 200 AND ${table.displayName} !~ E'[\\r\\n]')`),
  check('user_profiles_response_preference_valid', sql`${table.taskResponsePreference} IN ('response-links', 'task-notification')`),
]);

export const awardProgress = pgTable('award_progress', {
  workflowCaseId: uuid('workflow_case_id').references(() => workflowCases.id),
  roleAssignees: jsonb('role_assignees').$type<import('@district/contracts/directory/types').RoleUser[]>().notNull().default([]),
  taskId: uuid('task_id').primaryKey().references(() => tasks.id),
  stage: text('stage').$type<'listed' | 'received' | 'scheduled' | 'presented'>().notNull().default('listed'),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  presentationDate: date('presentation_date'),
  scheduleRevision: integer('schedule_revision').notNull().default(0),
}, table => [
  check('award_stage_valid', sql`${table.stage} in ('listed', 'received', 'scheduled', 'presented')`),
  check('award_schedule_required', sql`${table.stage} <> 'scheduled' or ${table.presentationDate} is not null`),
]);

export const awardReminders = pgTable('award_reminders', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id').notNull().references(() => tasks.id),
  scheduleRevision: integer('schedule_revision').notNull(),
  daysBefore: integer('days_before').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  email: text('email').notNull(),
  status: text('status').$type<'claimed' | 'sent' | 'uncertain'>().notNull().default('claimed'),
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [unique().on(table.taskId, table.scheduleRevision, table.daysBefore, table.userId)]);


export const workflowCases = pgTable('workflow_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflow_id').notNull().references(() => workflows.id),
  workflowDefinitionId: uuid('workflow_definition_id').references(() => workflowDefinitions.id),
  reference: text('reference').notNull(),
  title: text('title').notNull(),
  status: text('status').$type<'open' | 'completed' | 'cancelled'>().notNull().default('open'),
  outcome: text('outcome'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, table => [unique().on(table.workflowId, table.reference),
  check('workflow_cases_status_valid', sql`${table.status} in ('open', 'completed', 'cancelled')`),
  index('workflow_cases_status_idx').on(table.workflowId, table.status),
]);

export const workflowCaseExecutions = pgTable('workflow_case_executions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowCaseId: uuid('workflow_case_id').notNull().references(() => workflowCases.id),
  workflowExecutionId: uuid('workflow_execution_id').notNull().references(() => workflowExecutions.id),
}, table => [unique().on(table.workflowCaseId, table.workflowExecutionId)]);
