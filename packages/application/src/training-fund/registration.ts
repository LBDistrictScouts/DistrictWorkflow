export interface StaffIdentity { id: string; name: string }
export const registrationPermission = 'training-fund:register';

export function staffIdentityFromSession(value: unknown): StaffIdentity | null {
  if (!value || typeof value !== 'object') return null;
  const session = value as { authenticated?: unknown; permissions?: unknown; user?: { id?: unknown; name?: unknown } };
  if (session.authenticated !== true || !Array.isArray(session.permissions) || !session.permissions.includes(registrationPermission)) return null;
  const id = session.user?.id;
  const name = session.user?.name;
  if (typeof id !== 'string' || !id.trim() || id.length > 200 || typeof name !== 'string' || !name.trim() || name.length > 200) return null;
  return { id, name };
}

function applicationObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid application');
  return value as Record<string, unknown>;
}

export function memberSubmission(value: unknown) {
  const body = applicationObject(value);
  return { ...body, submission: { channel: 'members' } };
}

export function staffSubmission(value: unknown, staff: StaffIdentity, now = new Date().toISOString()) {
  const { registration, ...application } = applicationObject(value);
  if (!registration || typeof registration !== 'object' || Array.isArray(registration)) throw new Error('Registration details are required');
  const details = registration as Record<string, unknown>;
  if (!['email', 'phone', 'post', 'other'].includes(String(details.receivedVia))) throw new Error('Choose how the application was received');
  if (typeof details.receivedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(details.receivedAt) || !Number.isFinite(Date.parse(details.receivedAt)) || new Date(details.receivedAt).toISOString().slice(0, 10) !== details.receivedAt || details.receivedAt > now.slice(0, 10)) throw new Error('Enter a valid received date that is not in the future');
  if (typeof details.reference !== 'string' || !details.reference.trim() || details.reference.length > 500) throw new Error('Enter a source reference (1–500 characters)');
  return {
    ...application,
    submission: { channel: 'staff', receivedVia: details.receivedVia, receivedAt: details.receivedAt, reference: details.reference.trim(), registeredBy: staff, registeredAt: now },
  };
}
