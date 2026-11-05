
import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { createDatabase } from './client';
import { users, userEmails, userTags, userTagMemberships } from './schema';

export interface DirectoryUser { id: string; name: string; active: boolean; emails: string[] }

export interface DirectoryTag { id: string; tagName: string; tagCode: string; emails?: { memberId: string; email: string }[] }

export function createUserRepository(db: ReturnType<typeof createDatabase>['db']) {
  return {
    async sync(members: DirectoryUser[], tags: DirectoryTag[] = []) {
      await db.transaction(async tx => {
        await tx.execute(sql.raw('SELECT pg_advisory_xact_lock(7281941)'));

        // Keep missing definitions: published workflow steps may reference them.
        for (const tag of tags) {
          await tx.insert(userTags).values({ id: tag.id, tagName: tag.tagName, tagCode: tag.tagCode }).onConflictDoUpdate({
            target: userTags.id, set: { tagName: tag.tagName, tagCode: tag.tagCode },
          });
        }

        const memberIds = members.map(member => member.id);
        // Keep historical users, but remove login addresses for missing members.
        const missingUsers = memberIds.length ? notInArray(users.id, memberIds) : undefined;
        const missingEmails = memberIds.length ? notInArray(userEmails.userId, memberIds) : undefined;
        await tx.update(users).set({ active: 0 }).where(missingUsers);
        await tx.delete(userEmails).where(missingEmails);
        const syncedAt = new Date();

        for (const member of members) {
          const row = { id: member.id, name: member.name, active: member.active ? 1 : 0, syncedAt };
          await tx.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: row });
          const emails = [...new Set(member.emails.map(email => email.trim().toLowerCase()))];
          await tx.delete(userEmails).where(and(
            eq(userEmails.userId, member.id),
            emails.length ? notInArray(userEmails.email, emails) : undefined,
          ));

          if (emails.length) await tx.insert(userEmails).values(
            emails.map(email => ({ userId: member.id, email })),
          ).onConflictDoNothing({ target: [userEmails.userId, userEmails.email] });
        }

        // The tags endpoint is authoritative for current email assignments.
        const tagIds = tags.map(tag => tag.id);
        await tx.delete(userTagMemberships).where(
          tagIds.length ? notInArray(userTagMemberships.userTagId, tagIds) : undefined,
        );

        for (const tag of tags) {
          const emailIds = new Set<string>();

          for (const assignment of tag.emails ?? []) {
            const [email] = await tx.select({ id: userEmails.id }).from(userEmails).where(and(
              eq(userEmails.userId, assignment.memberId),
              eq(userEmails.email, assignment.email.trim().toLowerCase()),
            ));

            if (!email) throw new Error('Tag appointment references an unknown member email');
            emailIds.add(email.id);
          }

          const ids = [...emailIds];
          await tx.delete(userTagMemberships).where(and(
            eq(userTagMemberships.userTagId, tag.id),
            ids.length ? notInArray(userTagMemberships.userEmailId, ids) : undefined,
          ));

          if (ids.length) await tx.insert(userTagMemberships).values(
            ids.map(userEmailId => ({ userEmailId, userTagId: tag.id })),
          ).onConflictDoNothing({ target: [userTagMemberships.userEmailId, userTagMemberships.userTagId] });
        }
      });
    },
    async searchActiveUsers(query: string) {
      const term = query.trim();

      if (term.length < 2 || term.length > 100) return [];
      const pattern = `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;

      return db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.active, 1), sql`
        (${users.name} ILIKE ${pattern} OR EXISTS (
          SELECT 1 FROM ${userEmails} WHERE ${userEmails.userId} = ${users.id} AND ${userEmails.email} ILIKE ${pattern}
        ))
      `)).orderBy(users.name, users.id).limit(10);
    },
    async findActiveApplicantById(userId: string) {
      const [user] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.active, 1)));

      if (!user) return null;
      const addresses = await db.select().from(userEmails).where(eq(userEmails.userId, userId)).orderBy(userEmails.email);

      for (const address of addresses) {
        const owners = await db.select({ id: userEmails.id }).from(userEmails).where(eq(userEmails.email, address.email)).limit(2);

        if (owners.length === 1) return { id: user.id, name: user.name, email: address.email };
      }

      return null;
    },
    /** Preserve all appointment emails for the requested tag; do not substitute login addresses. */
    async findRoleUsersByTag(tagCode: string): Promise<import('@district/contracts/directory/types').RoleUser[]> {
      return db.select({ id: users.id, name: users.name, appointmentEmail: userEmails.email }).from(userTagMemberships)
        .innerJoin(userTags, eq(userTags.id, userTagMemberships.userTagId))
        .innerJoin(userEmails, eq(userEmails.id, userTagMemberships.userEmailId))
        .innerJoin(users, eq(users.id, userEmails.userId))
        .where(and(eq(userTags.tagCode, tagCode), eq(users.active, 1))).orderBy(users.id, userEmails.email);
    },
    /** One result per active directory user; multiple tagged addresses are not multiple people. */
    async findActiveByTag(tagCode: string) {
      const rows = await db.select({ id: users.id, name: users.name, email: userEmails.email }).from(userTagMemberships)
        .innerJoin(userTags, eq(userTags.id, userTagMemberships.userTagId))
        .innerJoin(userEmails, eq(userEmails.id, userTagMemberships.userEmailId))
        .innerJoin(users, eq(users.id, userEmails.userId))
        .where(and(eq(userTags.tagCode, tagCode), eq(users.active, 1))).orderBy(users.id, userEmails.email);

      const people = new Map<string, typeof rows>();

      for (const row of rows) people.set(row.id, [...people.get(row.id) ?? [], row]);
      const result: { id: string; name: string; email: string }[] = [];

      for (const addresses of people.values()) {
        let selected: typeof rows[number] | undefined;

        for (const address of addresses) {
          const owners = await db.select({ userId: userEmails.userId }).from(userEmails).where(eq(userEmails.email, address.email)).limit(2);

          if (owners.length === 1) { selected = address; break; }
        }

        if (!selected) throw new Error('Tagged user has no unambiguous email address');
        result.push(selected);
      }

      return result;
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
