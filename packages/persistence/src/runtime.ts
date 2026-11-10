import { createProfileRepository } from './profile-repository';
import { createResponseRepository } from './response-repository';
import { createUserRepository } from './user-repository';
import 'dotenv/config';
import { createDatabase } from './client';
import { createTrainingFundRepository } from './training-fund-repository';

let database: ReturnType<typeof createDatabase> | undefined;

export function trainingFundRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url); // No connections during Next.js build or module import.

  return createTrainingFundRepository(database.db);
}

export async function closeDatabase() {
  const closing = database;
  database = undefined;
  await closing?.close();
}

export function userRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createUserRepository(database.db);
}

export function responseRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createResponseRepository(database.db);
}

export function profileRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createProfileRepository(database.db);
}

import { createTaskDigestRepository } from './task-digest-repository';

export function taskDigestRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createTaskDigestRepository(database.db);
}

import { createResponseReminderRepository } from './response-reminder-repository';

export function responseReminderRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createResponseReminderRepository(database.db);
}

import { createAwardsRepository } from './awards-repository';

export function awardsRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createAwardsRepository(database.db);
}

import { createWorkflowOverviewRepository } from './workflow-overview-repository';

export function workflowOverviewRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createWorkflowOverviewRepository(database.db);
}

import { createAwardReminderRepository } from './award-reminder-repository';

export function awardReminderRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createAwardReminderRepository(database.db);
}

import { createActivityNotificationRepository } from './activity-notification-repository';

export function activityNotificationRepository() {
  const url = process.env.DATABASE_URL;

  if (!url) throw new Error('DATABASE_URL is required');
  database ??= createDatabase(url);

  return createActivityNotificationRepository(database.db);
}
