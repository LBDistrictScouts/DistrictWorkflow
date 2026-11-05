import Ajv2020 from 'ajv/dist/2020';
import type { AwardContext } from './types';

const validate = new Ajv2020().compile<AwardContext>({
  type: 'object', required: ['membershipNumber', 'description', 'awardDate', 'recipient'],
  properties: {
    membershipNumber: { type: 'string' }, description: { type: 'string' }, awardDate: { type: 'string' }, sourceRow: { type: 'number' },
    recipient: {
      type: 'object', required: ['id', 'name', 'appointments'],
      properties: {
        id: { type: 'string' }, name: { type: 'string' }, appointments: {
          type: 'array', items: { type: 'object', required: ['role', 'team', 'email'], properties: { role: { type: 'string' }, team: { type: 'string' }, email: { type: 'string' } } },
        },
      },
    },
  },
});

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Database JSON is untrusted until this schema validates it.
export function parseAwardContext(value: unknown): AwardContext {
  if (!validate(value)) throw new TypeError('Invalid stored award context');

  return value;
}
