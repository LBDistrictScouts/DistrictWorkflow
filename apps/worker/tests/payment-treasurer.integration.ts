import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '@district/persistence/testing/postgres';
import { createUserRepository } from '@district/persistence/user-repository';
import { closeDatabase } from '@district/persistence/runtime';
import { resolvePaymentTreasurer } from '../src/activities/payments';

test('payment treasurer lookup uses district-treasurer, deduplicates users and rejects empty or ambiguous membership', async () => {
  const database = await createTestDatabase();
  process.env.DATABASE_URL = database.connectionString;

  try {
    await database.migrate();
    const repository = createUserRepository(database.db);
    await assert.rejects(resolvePaymentTreasurer(), /exactly one/);
    const treasurer = { id: randomUUID(), name: 'Treasurer', active: true, emails: ['a@example.org', 'b@example.org'] };
    const other = { id: randomUUID(), name: 'Other', active: false, emails: ['other@example.org'] };

    const tag = { id: randomUUID(), tagName: 'District Treasurer', tagCode: 'district-treasurer', emails: [
      ...treasurer.emails.map(email => ({ memberId: treasurer.id, email })), { memberId: other.id, email: other.emails[0]! },
    ] };

    await repository.sync([treasurer, other], [tag]);
    assert.deepEqual(await resolvePaymentTreasurer(), { id: treasurer.id, name: treasurer.name, email: treasurer.emails[0] });
    await repository.sync([treasurer, { ...other, active: true }], [tag]);
    await assert.rejects(resolvePaymentTreasurer(), /exactly one/);
    await repository.sync([{ ...treasurer, active: false }, other], [tag]);
    await assert.rejects(resolvePaymentTreasurer(), /exactly one/);
  } finally { await closeDatabase(); await database.close(); }
});
