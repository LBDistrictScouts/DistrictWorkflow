import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase } from '../src/testing/postgres';
import { createUserRepository } from '../src/user-repository';
import { createProfileRepository } from '../src/profile-repository';

test('profiles have defaults, isolate users and survive directory synchronisation', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const directory = createUserRepository(database.db);
    const profiles = createProfileRepository(database.db);
    const alice = { id: randomUUID(), name: 'Alice Directory', active: true, emails: ['alice@example.org'] };
    const bob = { id: randomUUID(), name: 'Bob Directory', active: true, emails: ['bob@example.org'] };
    await directory.sync([alice, bob]);
    assert.deepEqual(await profiles.findByUserId(alice.id), { displayName: null, taskResponsePreference: 'response-links' });
    const saved = { displayName: '  Alice Preferred  ', taskResponsePreference: 'task-notification' };
    assert.deepEqual(await profiles.save(alice.id, saved), { ...saved, displayName: 'Alice Preferred' });
    await directory.sync([{ ...alice, name: 'Updated Directory Name' }, bob]);
    assert.deepEqual(await profiles.findByUserId(alice.id), { displayName: 'Alice Preferred', taskResponsePreference: 'task-notification' });
    assert.equal((await directory.findByEmail(alice.emails[0]!))?.name, 'Updated Directory Name');
    assert.deepEqual(await profiles.findByUserId(bob.id), { displayName: null, taskResponsePreference: 'response-links' });

    for (const invalid of [{ ...saved, userId: bob.id }, { ...saved, taskResponsePreference: 'invalid' }, { ...saved, displayName: 'bad\nname' }]) await assert.rejects(profiles.save(alice.id, invalid));
    await profiles.save(alice.id, { displayName: '', taskResponsePreference: 'response-links' });
    assert.deepEqual(await profiles.findByUserId(alice.id), { displayName: null, taskResponsePreference: 'response-links' });
  } finally { await database.close(); }
});
