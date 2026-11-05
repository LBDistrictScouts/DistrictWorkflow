import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ResponseRequest, ResponseRequestInput, ResponseDefinition, ResponseChoice } from './types';

const ajv = new Ajv2020({ allErrors: true });

addFormats(ajv);

export class ResponseError extends Error {
  constructor(public readonly status: 400 | 403 | 409 | 410, message: string) { super(message); }
}

export function validateResponseRequest(input: ResponseRequestInput | ResponseRequest): void {
  const fail = () => { throw new ResponseError(400, 'Invalid response request'); };

  if (!input || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.taskId)) fail();

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
  if (typeof input.recipient?.email !== 'string' || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(input.recipient.email) || input.recipient.email.length > 254) fail();

  for (const [value, maximum] of [[input.recipient?.name, 200], [input.subject, 200], [input.heading, 200], [input.instructions, 4000]] as const) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) fail();
  }

  if (/[\r\n]/.test(input.subject) || !Number.isFinite(Date.parse(input.expiresAt))) fail();

  const choices = (items: ResponseChoice[] | undefined) => {
    if (!Array.isArray(items) || items.length < 2 || items.length > 10 || new Set(items.map(item => item.value)).size !== items.length) fail();

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
    for (const item of items!) if (!/^[a-zA-Z0-9_-]{1,80}$/.test(item.value) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 200) fail();
  };

  const definition = input.definition;

  if (definition?.kind === 'simple') choices(definition.choices);
  else if (definition?.kind === 'complex') {
    if (!Array.isArray(definition.fields) || definition.fields.length < 1 || definition.fields.length > 30 || new Set(definition.fields.map(field => field.name)).size !== definition.fields.length) fail();

    for (const field of definition.fields) {
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(field.name) || ['constructor', 'prototype', '__proto__'].includes(field.name) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 200 || !['text', 'textarea', 'email', 'date', 'select'].includes(field.type)) fail();

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
      if (field.required !== undefined && typeof field.required !== 'boolean') fail();

      if (field.maxLength !== undefined && (!Number.isSafeInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 4000)) fail();

      if (field.pattern !== undefined) {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Validate the runtime type at this external-input boundary before using the value.
        if (typeof field.pattern !== 'string' || field.pattern.length > 200) fail();

        try { new RegExp(field.pattern, 'u'); } catch { fail(); }
      }

      if (field.type === 'select') choices(field.options);
      else if (field.options !== undefined) fail();
    }
  } else fail();
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Accept untrusted input here; the receiving parser validates it before domain use.
export function validateResponseAnswers(definition: ResponseDefinition, value: unknown): Record<string, string> {
  const properties = definition.kind === 'simple' ? { choice: { type: 'string', enum: definition.choices.map(choice => choice.value) } }
    : Object.fromEntries(definition.fields.map(field => [field.name, {
      type: 'string', minLength: field.required ? 1 : 0, maxLength: field.maxLength ?? 4000,
      // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
      ...(field.pattern ? { pattern: field.pattern } : {}),
      // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
      ...(['email', 'date'].includes(field.type) ? { format: field.type } : {}),
      // oxlint-disable-next-line anti-slop/no-conditional-empty-object-spread -- Preserve absence of optional fields; an own property with undefined is not equivalent for this payload.
      ...(field.type === 'select' ? { enum: field.options!.map(option => option.value) } : {}),
    }]));

  const required = definition.kind === 'simple' ? ['choice'] : definition.fields.flatMap(field => field.required ? [field.name] : []);
  const check = ajv.compile<Record<string, string>>({ type: 'object', additionalProperties: false, properties, required });

  if (!check(value) || Buffer.byteLength(JSON.stringify(value)) > 32768) throw new ResponseError(400, 'Please complete the response using the requested fields and allowed values.');

  return value;
}
