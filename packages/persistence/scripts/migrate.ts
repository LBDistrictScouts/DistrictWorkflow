import 'dotenv/config';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../src/client';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const database = createDatabase(process.env.DATABASE_URL);
  try {
    // Dedicated session prevents concurrent deploys applying the same migration twice.
    const client = await database.db.$client.connect();
    try {
      await client.query('select pg_advisory_lock(89426001)');
      await migrate(drizzle(client), { migrationsFolder: resolve(__dirname, '../migrations') });
      console.info('Application database migrations applied');
    } finally {
      client.release(true); // Closing the dedicated session always releases the advisory lock.
    }
  } finally { await database.close(); }
}
main().catch(() => { console.error('Database migration failed; check configuration and migration compatibility'); process.exitCode = 1; });
