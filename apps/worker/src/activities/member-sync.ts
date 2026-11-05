import { fetchTags } from '@district/integrations/district-team/tags';

import { fetchMembers } from '@district/integrations/district-team/members';
import { userRepository } from '@district/persistence/runtime';

export async function syncDistrictMembers() {
  const [members, tags] = await Promise.all([fetchMembers(), fetchTags()]);
  await userRepository().sync(members, tags);

  return { memberCount: members.length, tagCount: tags.length };
}
