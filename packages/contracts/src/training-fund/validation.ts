import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from './application.schema.json';
import type { TrainingFundApplication, TrainingFundRouting } from './types';

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile<TrainingFundApplication>(schema);

export function parseApplication(value: unknown): TrainingFundApplication {
  if (!validate(value)) {
    throw new Error(ajv.errorsText(validate.errors, { separator: '; ' }));
  }
  if (value.funding.requestedPence > value.course.costPence) {
    throw new Error('Requested funding cannot exceed the course cost');
  }
  return value;
}

export function parseRouting(value: unknown): TrainingFundRouting {
  const routingSchema = {
    type: 'object', additionalProperties: false, required: ['approvers', 'treasurer'],
    properties: {
      approvers: { type: 'array', minItems: 3, maxItems: 3, items: { $ref: '#/$defs/person' } },
      treasurer: { $ref: '#/$defs/person' },
    },
    $defs: { person: {
      type: 'object', additionalProperties: false, required: ['id', 'name', 'email'],
      properties: {
        id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,80}$' },
        name: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
        email: { type: 'string', format: 'email', maxLength: 254 },
      },
    } },
  };
  const check = ajv.compile<TrainingFundRouting>(routingSchema);
  if (!check(value)) throw new Error(`Invalid routing: ${ajv.errorsText(check.errors)}`);
  const people = [...value.approvers, value.treasurer];
  if (new Set(people.map(p => p.id)).size !== 4 || new Set(people.map(p => p.email.toLowerCase())).size !== 4) {
    throw new Error('Configure three distinct approvers and a separate treasurer');
  }
  return value;
}
