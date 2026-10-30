
import { eq, sql } from 'drizzle-orm';
import type { createDatabase } from './client';
import { users, userEmails } from './schema';

export interface DirectoryUser { id: string; name: string; active: boolean; emails: string[] }
export function createUserRepository(db: ReturnType<typeof createDatabase>['db']) {
  return {
    async sync(members: DirectoryUser[]) {
      await db.transaction(async tx => {
        await tx.execute(sql.raw('SELECT pg_advisory_xact_lock(7281941)'));
        await tx.update(users).set({ active: 0 });
        await tx.delete(userEmails);
        const syncedAt = new Date();
        for (const member of members) {
          const row = { id: member.id, name: member.name, active: member.active ? 1 : 0, syncedAt };
          await tx.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row });
          if (member.emails.length) await tx.insert(userEmails).values(
            [...new Set(member.emails.map(email => email.trim().toLowerCase()))].map(email => ({ userId: member.id, email })),
          );
        }
      });
    },
    async findByEmail(email: string) {
      const matches = await db.select({ user: users }).from(userEmails)
        .innerJoin(users, eq(users.id, userEmails.userId))
        .where(eq(userEmails.email, email.trim().toLowerCase())).limit(2);
      // Shared addresses never identify a person, even if one owner is inactive.
      return matches.length === 1 && matches[0]!.user.active === 1 ? matches[0]!.user : null;
    },
  };
}
