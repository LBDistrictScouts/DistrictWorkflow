import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../src/testing/postgres';
import { createUserRepository } from '../src/user-repository';
test('stable users, aliases, shared emails, removals and transaction rollback', async () => {
  const database = await createTestDatabase();
  try {
    await database.migrate();
    const repository = createUserRepository(database.db);
    const jacob = { id: '11111111-1111-4111-8111-111111111111', name: 'Jacob', active: true,
      emails: ['jacob@lbdscouts.org.uk', 'jacob@4thletchworth.com'] };
    await repository.sync([jacob]);
    await repository.sync([jacob]);
    for (const email of jacob.emails) assert.equal((await repository.findByEmail(email.toUpperCase()))?.id, jacob.id);
    await assert.rejects(repository.sync([{ ...jacob, id: 'invalid' }]));
    assert.equal((await repository.findByEmail(jacob.emails[0]!))?.id, jacob.id);
    await repository.sync([jacob, { ...jacob, id: '22222222-2222-4222-8222-222222222222' }]);
    assert.equal(await repository.findByEmail(jacob.emails[0]!), null);
    await repository.sync([{ ...jacob, emails: [jacob.emails[1]!] }]);
    assert.equal(await repository.findByEmail(jacob.emails[0]!), null);
    assert.equal((await repository.findByEmail(jacob.emails[1]!))?.id, jacob.id);
    await repository.sync([]);
    assert.equal(await repository.findByEmail(jacob.emails[1]!), null);
  } finally { await database.close(); }
});
