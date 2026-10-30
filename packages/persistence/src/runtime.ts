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
