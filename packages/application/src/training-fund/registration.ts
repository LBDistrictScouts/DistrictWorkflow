import { parseObject, type BoundaryObject } from '@district/contracts/boundary';

export interface StaffIdentity { id: string; name: string }

export const registrationPermission = 'training-fund:register';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export function staffIdentityFromSession(value: unknown): StaffIdentity | null {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!value || typeof value !== 'object') return null;
  // SAFETY: Only optional fields are exposed, and authentication, permissions and user strings are checked before returning an identity.
  const session = value as { authenticated?: unknown; permissions?: unknown; user?: { id?: unknown; name?: unknown } };

  if (session.authenticated !== true || !Array.isArray(session.permissions) || !session.permissions.includes(registrationPermission)) return null;
  const id = session.user?.id;
  const name = session.user?.name;

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (typeof id !== 'string' || !id.trim() || id.length > 200 || typeof name !== 'string' || !name.trim() || name.length > 200) return null;

  return { id, name };
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
function applicationObject(value: unknown): BoundaryObject {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid application');

  return parseObject(value, 'Invalid application');
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export function memberSubmission(value: unknown) {
  const body = applicationObject(value);

  return { ...body, submission: { channel: 'members' } };
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export function staffSubmission(value: unknown, staff: StaffIdentity, now = new Date().toISOString()) {
  const { registration, ...application } = applicationObject(value);

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (!registration || typeof registration !== 'object' || Array.isArray(registration)) throw new Error('Registration details are required');
  const details = parseObject(registration, 'Registration details are required');

  if (!['email', 'phone', 'post', 'other'].includes(String(details.receivedVia))) throw new Error('Choose how the application was received');

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (typeof details.receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(details.receivedAt) || !Number.isFinite(Date.parse(details.receivedAt)) || new Date(details.receivedAt).toISOString().slice(0, 10) !== details.receivedAt || details.receivedAt > now.slice(0, 10)) throw new Error('Enter a valid received date that is not in the future');

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (details.reference !== undefined && (typeof details.reference !== 'string' || details.reference.length > 500)) throw new Error('Source reference must be text up to 500 characters');
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  const reference = typeof details.reference === 'string' ? details.reference.trim() : '';

  return {
    ...application,
    // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
    submission: { channel: 'staff', receivedVia: details.receivedVia, receivedAt: details.receivedAt, ...(reference ? { reference } : {}), registeredBy: staff, registeredAt: now },
  };
}
