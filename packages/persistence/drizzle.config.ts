import { defineConfig } from 'drizzle-kit';

// Generation needs no credentials. Applying migrations uses scripts/migrate.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
});
