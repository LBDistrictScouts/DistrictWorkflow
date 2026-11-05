import { ApplicationFailure } from '@temporalio/common';
import { userRepository } from '@district/persistence/runtime';
import type { RoleUser } from '@district/contracts/directory/types';

/** Generic directory lookup. Role cardinality and selection belong to the calling workflow. */
export async function resolveRoleUser(tag: string): Promise<RoleUser[]> {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (typeof tag !== 'string' || !/^[A-Za-z0-9-]+$/.test(tag)) {
    throw ApplicationFailure.nonRetryable('A valid role tag code is required', 'InvalidRoleTag');
  }

  return userRepository().findRoleUsersByTag(tag);
}

/** Returns null for an unknown member; transient API errors remain retryable. */
export async function getMemberProfileByMembershipNumber(membershipNumber: string) {
  const { fetchMemberProfile } = await import('@district/integrations/district-team/member-profile');

  return fetchMemberProfile(membershipNumber);
}
