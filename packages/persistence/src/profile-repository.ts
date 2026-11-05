import { eq } from 'drizzle-orm';
import type { createDatabase } from './client';
import { userProfiles } from './schema';
import { defaultUserProfile, parseUserProfile, type UserProfile } from '@district/contracts/profile/types';

export function createProfileRepository(db: ReturnType<typeof createDatabase>['db']) {
  return {
    async findByUserId(userId: string): Promise<UserProfile> {
      const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

      return row ? { displayName: row.displayName, taskResponsePreference: row.taskResponsePreference } : { ...defaultUserProfile };
    },
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Response fields are dynamic; completion validates answers against the stored definition.
    async save(userId: string, value: unknown): Promise<UserProfile> {
      const profile = parseUserProfile(value);
      await db.insert(userProfiles).values({ userId, ...profile }).onConflictDoUpdate({ target: userProfiles.userId, set: { ...profile, updatedAt: new Date() } });

      return profile;
    },
  };
}
