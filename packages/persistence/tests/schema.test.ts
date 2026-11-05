import test from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { createTestDatabase } from '../src/testing/postgres';

test('every application table has one UUID primary key and UUID foreign keys without defaults', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();

    const keys = await database.db.execute(sql`
      SELECT t.table_name, c.column_name, c.data_type
      FROM information_schema.tables t
      LEFT JOIN information_schema.table_constraints k
        ON k.table_schema = t.table_schema AND k.table_name = t.table_name AND k.constraint_type = 'PRIMARY KEY'
      LEFT JOIN information_schema.key_column_usage u
        ON u.constraint_schema = k.constraint_schema AND u.constraint_name = k.constraint_name
      LEFT JOIN information_schema.columns c
        ON c.table_schema = u.table_schema AND c.table_name = u.table_name AND c.column_name = u.column_name
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    `);

    assert.ok(keys.rows.length >= 22);
    assert.equal(new Set(keys.rows.map(row => row.table_name)).size, keys.rows.length);

    for (const row of keys.rows) assert.equal(row.data_type, 'uuid');

    const foreignKeys = await database.db.execute(sql`
      SELECT a.atttypid::regtype::text AS type, d.oid AS default_id,
        EXISTS (SELECT 1 FROM pg_constraint p WHERE p.contype = 'p'
          AND p.conrelid = f.confrelid AND p.conkey = f.confkey) AS references_primary_key
      FROM pg_constraint f
      JOIN pg_class t ON t.oid = f.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = ANY(f.conkey)
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE f.contype = 'f' AND n.nspname = 'public'
    `);

    assert.ok(foreignKeys.rows.length >= 22);

    for (const row of foreignKeys.rows) {
      assert.equal(row.type, 'uuid');
      assert.equal(row.default_id, null);
      assert.equal(row.references_primary_key, true);
    }
  } finally { await database.close(); }
});
