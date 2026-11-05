// Arbitrary JSON keys remain unknown until each domain parser checks their values.
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Transport objects have runtime keys and deliberately untrusted values.
export type BoundaryObject = Record<string, unknown>;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This is the parser for an untrusted object boundary.
export function parseObject(value: unknown, message = 'Invalid object'): BoundaryObject {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Primitive discrimination belongs in this boundary parser.
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(message);

  // SAFETY: The guard establishes a non-null, non-array object; property values remain unknown.
  return value as BoundaryObject;
}
