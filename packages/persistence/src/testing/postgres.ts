import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../client';

/** Creates and owns one disposable database; never migrates an existing database. */
export async function createTestDatabase() {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) throw new Error('TEST_DATABASE_URL is required; configure a PostgreSQL admin database for isolated tests');
  const target = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('TEST_DATABASE_URL must use PostgreSQL');
  const admin = new Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 5000 });
  const name = `district_test_${randomUUID().replaceAll('-', '')}`;
  try { await admin.query(`CREATE DATABASE "${name}"`); }
  catch (error) { await admin.end(); throw error; }
  target.pathname = `/${name}`;
  const database = createDatabase(target.toString());
  let closed = false;
  return {
    db: database.db,
    migrate: () => migrate(database.db, { migrationsFolder: resolve(__dirname, '../../migrations') }),
    async close() {
      if (closed) return;
      closed = true;
      try { await database.close(); }
      finally {
        try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
        finally { await admin.end(); }
      }
    },
  };
}
