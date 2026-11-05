import { userRepository } from '@district/persistence/runtime';
import type { PaymentTreasurer } from '@district/contracts/payments/types';

/** Compatibility activity for older histories. New definitions use resolveRoleUser(tag). */
export async function resolvePaymentTreasurer(): Promise<PaymentTreasurer> {
  const people = await userRepository().findActiveByTag('district-treasurer');

  if (people.length !== 1) throw new Error('district-treasurer must identify exactly one active directory user');

  return people[0]!;
}
