import { awardsRepository, closeDatabase } from '@district/persistence/runtime';
import { resolveRoleUser } from '../activities/directory';

async function main() {
  try {
    const users = await resolveRoleUser('DLV');
    const updated = await awardsRepository().backfillAssignees(users);
    console.log(`Resolved ${new Set(users.map(user => user.id)).size} DLV users; populated ${updated.length} existing award assignments. Manual overrides retained.`);
  } finally { await closeDatabase(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
