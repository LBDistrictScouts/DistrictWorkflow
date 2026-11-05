import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '@district/persistence/testing/postgres';
import { createUserRepository } from '@district/persistence/user-repository';
import { closeDatabase } from '@district/persistence/runtime';
import { resolveRoleUser } from '../src/activities/directory';

test('resolveRoleUser accepts any tag and preserves each active user appointment email', async () => {
  const database = await createTestDatabase();
  process.env.DATABASE_URL = database.connectionString;

  try {
    await database.migrate();
    const repository = createUserRepository(database.db);
    const alice = { id: randomUUID(), name: 'Alice', active: true, emails: ['login@example.org', 'treasurer-a@example.org', 'treasurer-b@example.org'] };
    const bob = { id: randomUUID(), name: 'Bob', active: true, emails: ['approver@example.org'] };
    const inactive = { id: randomUUID(), name: 'Inactive', active: false, emails: ['inactive@example.org'] };

    const treasurers = { id: randomUUID(), tagName: 'Treasurers', tagCode: 'district-treasurer', emails: [
      { memberId: alice.id, email: alice.emails[1]! }, { memberId: alice.id, email: alice.emails[2]! }, { memberId: inactive.id, email: inactive.emails[0]! },
    ] };

    const approvers = { id: randomUUID(), tagName: 'Approvers', tagCode: 'training-fund-approvers', emails: [{ memberId: bob.id, email: bob.emails[0]! }] };
    await repository.sync([alice, bob, inactive], [treasurers, approvers]);
    assert.deepEqual(await resolveRoleUser('district-treasurer'), [
      { id: alice.id, name: alice.name, appointmentEmail: alice.emails[1] },
      { id: alice.id, name: alice.name, appointmentEmail: alice.emails[2] },
    ]);
    assert.deepEqual(await resolveRoleUser('training-fund-approvers'), [{ id: bob.id, name: bob.name, appointmentEmail: bob.emails[0] }]);
    assert.deepEqual(await resolveRoleUser('missing-role'), []);
    assert.deepEqual(await resolveRoleUser('District-Treasurer'), [], 'tag codes match exactly');
    await repository.sync([alice, bob, inactive], [{ ...treasurers, emails: [...treasurers.emails, { memberId: bob.id, email: bob.emails[0]! }] }, approvers]);
    assert.equal((await resolveRoleUser('district-treasurer')).length, 3, 'activity returns multiple users without imposing cardinality');

    for (const invalid of ['', 'has space', 'bad_tag']) await assert.rejects(resolveRoleUser(invalid), /valid role tag/);
  } finally { await closeDatabase(); await database.close(); }
});
