import Ajv from 'ajv';
import notificationSchema from './activity-notification.schema.json';
import queueSchema from './activity-notification-queue.schema.json';
import type { QueuedActivityNotification } from './types';

const ajv = new Ajv({ allErrors: true, strict: false });

ajv.addSchema(notificationSchema, 'activity-notification.schema.json');

const validate = ajv.compile<QueuedActivityNotification>(queueSchema);

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Queue input is untrusted until schema validation succeeds.
export function parseActivityNotification(value: unknown): QueuedActivityNotification {
  if (!validate(value)) throw new Error('Invalid activity notification submission');

  if (!Number.isFinite(Date.parse(value.submittedAt))) throw new Error('Invalid submission timestamp');
  const { startsAt, endsAt } = value.notification;

  if (!Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || startsAt >= endsAt) {
    throw new Error('Invalid activity dates');
  }

  return value;
}
