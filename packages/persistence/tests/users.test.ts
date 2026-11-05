import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../src/testing/postgres';
import { userEmails, users, userTags, userTagMemberships } from '../src/schema';
import { createUserRepository } from '../src/user-repository';

test('stable users, aliases, shared emails, removals and transaction rollback', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const repository = createUserRepository(database.db);

    const jacob = { id: '11111111-1111-4111-8111-111111111111', name: 'Jacob', active: true,
      emails: ['jacob@lbdscouts.org.uk', 'jacob@4thletchworth.com'] };

    await repository.sync([jacob]);
    const originalEmails = await database.db.select().from(userEmails);
    const originalIds = new Map(originalEmails.map(row => [row.email, row.id]));
    await repository.sync([{ ...jacob, emails: [...jacob.emails, ' JACOB@LBDSCOUTS.ORG.UK '] }]);
    assert.deepEqual(await database.db.select().from(userEmails), originalEmails);

    for (const email of jacob.emails) assert.equal((await repository.findByEmail(email.toUpperCase()))?.id, jacob.id);
    await assert.rejects(repository.sync([{ ...jacob, id: 'invalid' }]));
    assert.equal((await repository.findByEmail(jacob.emails[0]!))?.id, jacob.id);
    assert.deepEqual(await database.db.select().from(userEmails), originalEmails);
    await repository.sync([jacob, { ...jacob, id: '22222222-2222-4222-8222-222222222222' }]);
    assert.equal(await repository.findByEmail(jacob.emails[0]!), null);
    await repository.sync([{ ...jacob, emails: [jacob.emails[1]!] }]);
    assert.equal(await repository.findByEmail(jacob.emails[0]!), null);
    assert.equal((await repository.findByEmail(jacob.emails[1]!))?.id, jacob.id);
    const remaining = await database.db.select().from(userEmails);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]!.id, originalIds.get(jacob.emails[1]!));
    await repository.sync([{ ...jacob, name: 'Jacob Tyler', emails: [jacob.emails[1]!, 'new@example.org'] }]);
    const merged = await database.db.select().from(userEmails);
    assert.equal(merged.length, 2);
    assert.equal(merged.find(row => row.email === jacob.emails[1])!.id, originalIds.get(jacob.emails[1]!));
    assert.ok(merged.find(row => row.email === 'new@example.org')?.id);
    assert.equal((await repository.findByEmail('new@example.org'))?.name, 'Jacob Tyler');
    await repository.sync([{ ...jacob, emails: [] }]);
    assert.deepEqual(await database.db.select().from(userEmails), []);
    await repository.sync([jacob]);
    await repository.sync([]);
    assert.equal(await repository.findByEmail(jacob.emails[1]!), null);
    assert.deepEqual(await database.db.select().from(userEmails), []);
    assert.ok((await database.db.select().from(users)).every(user => user.active === 0));
  } finally { await database.close(); }
});

test('tag import merges stable IDs, retains missing definitions and rolls back conflicts', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const repository = createUserRepository(database.db);
    const tag = { id: '33333333-3333-4333-8333-333333333333', tagName: 'Approvers', tagCode: 'approvers' };
    await repository.sync([], [tag]);
    await repository.sync([], [{ ...tag, tagName: 'Fund approvers' }]);
    assert.deepEqual(await database.db.select().from(userTags), [{ ...tag, tagName: 'Fund approvers' }]);
    await repository.sync([], []);
    assert.equal((await database.db.select().from(userTags)).length, 1);
    await assert.rejects(repository.sync([], [
      { ...tag, tagName: 'Must roll back' },
      { ...tag, id: '44444444-4444-4444-8444-444444444444' },
    ]));
    assert.deepEqual(await database.db.select().from(userTags), [{ ...tag, tagName: 'Fund approvers' }]);
  } finally { await database.close(); }
});

test('tags assign one email, preserve membership IDs and remove obsolete assignments', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();
    const repository = createUserRepository(database.db);

    const member = { id: '11111111-1111-4111-8111-111111111111', name: 'Jacob', active: true,
      emails: ['one@example.org', 'two@example.org'] };

    const tag = { id: '33333333-3333-4333-8333-333333333333', tagName: 'Team', tagCode: 'team',
      emails: [{ memberId: member.id, email: 'one@example.org' }] };

    await repository.sync([member], [tag]);
    const [email] = (await database.db.select().from(userEmails)).filter(e => e.email === 'one@example.org');
    const initial = await database.db.select().from(userTagMemberships);
    assert.equal(initial.length, 1);
    assert.equal(initial[0]!.userEmailId, email!.id);
    await repository.sync([member], [{ ...tag, emails: [...tag.emails, ...tag.emails] }]);
    assert.deepEqual(await database.db.select().from(userTagMemberships), initial);
    await assert.rejects(repository.sync([member], [{ ...tag, emails: [{ memberId: member.id, email: 'missing@example.org' }] }]));
    assert.deepEqual(await database.db.select().from(userTagMemberships), initial);
    await repository.sync([{ ...member, emails: ['two@example.org'] }], [{ ...tag, emails: [{ memberId: member.id, email: 'two@example.org' }] }]);
    const changed = await database.db.select().from(userTagMemberships);
    assert.equal(changed.length, 1);
    assert.notEqual(changed[0]!.userEmailId, email!.id);
    await repository.sync([member], [{ ...tag, emails: [] }]);
    assert.deepEqual(await database.db.select().from(userTagMemberships), []);
    await repository.sync([member], [tag]);
    await repository.sync([member], []);
    assert.deepEqual(await database.db.select().from(userTagMemberships), []);
    assert.equal((await database.db.select().from(userTags)).length, 1);
  } finally { await database.close(); }
});
