import type { RoleUser } from '@district/contracts/directory/types';
import type { Person } from '@district/contracts/training-fund/types';

/** One vote per user, using a unique appointment email rather than a login address. */
export function resolveTrainingFundApprovers(matches: RoleUser[], treasurer: Person): Person[] {
  const users = new Map<string, RoleUser[]>();

  for (const person of matches) users.set(person.id, [...users.get(person.id) ?? [], person]);

  if (users.size !== 3) throw new Error('training-fund-approvers must resolve to exactly three distinct active users');

  if (users.has(treasurer.id)) throw new Error('Training Fund approvers must be separate from the treasurer');

  return [...users.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, appointments]) => {
    const eligible = appointments.filter(person => {
      const email = person.appointmentEmail.trim().toLowerCase();

      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email !== treasurer.email.trim().toLowerCase()
        && !matches.some(other => other.id !== id && other.appointmentEmail.trim().toLowerCase() === email);
    }).sort((a, b) => a.appointmentEmail.localeCompare(b.appointmentEmail));

    const person = eligible[0];

    if (!person) throw new Error('Each Training Fund approver needs a unique appointment email');

    return { id, name: person.name, email: person.appointmentEmail.trim().toLowerCase() };
  });
}
