
import { fetchMembers } from '@district/integrations/district-team/members';
import { userRepository } from '@district/persistence/runtime';
export async function syncDistrictMembers() {
  const members = await fetchMembers();
  await userRepository().sync(members);
  return { memberCount: members.length };
}
