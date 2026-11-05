import test from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from '../src/testing/postgres';
import { userTags } from '../src/schema';

test('tag codes support workflow lookup and enforce valid, unique values', async () => {
  const database = await createTestDatabase();

  try {
    await database.migrate();

    const [tag] = await database.db.insert(userTags).values({
      tagName: 'Training Fund: Approvers', tagCode: 'Training-Fund-123',
    }).returning();

    assert.ok(tag?.id);
    await database.db.update(userTags).set({ tagName: 'Fund reviewers' })
      .where(eq(userTags.id, tag!.id));

    const [found] = await database.db.select().from(userTags)
      .where(eq(userTags.tagCode, 'Training-Fund-123'));

    assert.equal(found?.tagName, 'Fund reviewers');

    for (const tagCode of ['', 'has space', 'under_score', 'slash/code', 'é', 'trailing\n']) {
      await assert.rejects(database.db.insert(userTags).values({ tagName: 'Example', tagCode }));
    }

    await assert.rejects(database.db.insert(userTags).values({ tagName: 'Duplicate', tagCode: 'Training-Fund-123' }));
    await assert.rejects(database.db.insert(userTags).values({ tagName: ' \t\n', tagCode: 'blank-name' }));
  } finally { await database.close(); }
});
