import { parseObject } from '../boundary';

export type TaskResponsePreference = 'response-links' | 'task-notification';

export interface UserProfile {
  displayName: string | null;
  taskResponsePreference: TaskResponsePreference;
}

export const defaultUserProfile: UserProfile = { displayName: null, taskResponsePreference: 'response-links' };

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export function parseUserProfile(value: unknown): UserProfile {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid profile');
  const profile = parseObject(value, 'Invalid profile');

  if (Object.keys(profile).some(key => !['displayName', 'taskResponsePreference'].includes(key))) throw new TypeError('Unknown profile setting');

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (profile.displayName !== null && (typeof profile.displayName !== 'string' || profile.displayName.length > 200 || /[\r\n]/.test(profile.displayName))) throw new TypeError('Display name must be at most 200 characters on one line');

  if (!['response-links', 'task-notification'].includes(String(profile.taskResponsePreference))) throw new TypeError('Choose a valid task notification preference');

  // SAFETY: The preceding allowed-value check restricts the preference to the two members of this union.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  return { displayName: typeof profile.displayName === 'string' ? profile.displayName.trim() || null : null, taskResponsePreference: profile.taskResponsePreference as TaskResponsePreference };
}
