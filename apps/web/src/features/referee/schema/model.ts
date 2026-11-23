/**
 * Turns a bxapi command's JSON schema into a tree of form fields, and checks and assembles the values a form
 * collects. bxapi still validates every command: this model only stops a form from sending something the schema
 * already rules out, and it never encodes a game rule.
 *
 * The schema dialect is the one pydantic writes: `$ref` into `$defs`, `anyOf` with `{ type: 'null' }` for a
 * nullable field, `enum`, `const`, `prefixItems` for a fixed-length tuple, and `additionalProperties` with
 * `propertyNames` for a map such as ability scores.
 */

/** A JSON schema node, read loosely. */
export type JsonSchema = Record<string, unknown>;

/** A form value: whatever JSON the field holds, or `undefined` while the user hasn't set it. */
export type FormValue = unknown;

/** What one field of a form edits. */
export type FieldNode =
  | { kind: 'string'; minLength?: number; maxLength?: number; pattern?: string }
  | { kind: 'integer' | 'number'; minimum?: number; maximum?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; options: Array<string | number> }
  | { kind: 'const'; value: unknown }
  | { kind: 'object'; title?: string; fields: FieldSpec[] }
  | { kind: 'map'; keys: string[] | null; value: FieldNode }
  | { kind: 'array'; items: FieldNode; minItems?: number; maxItems?: number }
  | { kind: 'tuple'; items: FieldNode[] }
  | { kind: 'union'; variants: FieldNode[] }
  | { kind: 'nullable'; inner: FieldNode }
  | { kind: 'json' };

/** One named property of an object. */
export interface FieldSpec {
  name: string;
  node: FieldNode;
  required: boolean;
  /** The schema's default, when it states one. */
  default?: unknown;
  hasDefault: boolean;
}

/** How deep `$ref`s may nest before a node falls back to a JSON editor. */
const MAX_DEPTH = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/** Follows a local `$ref` such as `#/$defs/Coins`. */
function resolveRef(root: JsonSchema, ref: string): JsonSchema | null {
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!match) return null;
  const defs = root.$defs;
  if (!isRecord(defs)) return null;
  const target = defs[match[1] ?? ''];
  return isRecord(target) ? target : null;
}

/**
 * Reads one schema node into a {@link FieldNode}.
 *
 * @param root - The command's whole schema, for `$ref` lookups.
 * @param schema - The node.
 * @param seen - The `$ref`s on the path to this node, so a recursive model ends in a JSON editor.
 */
export function parseNode(root: JsonSchema, schema: JsonSchema, seen: readonly string[] = []): FieldNode {
  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref;
    const target = resolveRef(root, ref);
    if (target === null || seen.includes(ref) || seen.length >= MAX_DEPTH) return { kind: 'json' };
    return parseNode(root, target, [...seen, ref]);
  }
  if ('const' in schema) return { kind: 'const', value: schema.const };
  if (Array.isArray(schema.enum)) {
    return {
      kind: 'enum',
      options: schema.enum.filter(
        (v): v is string | number => typeof v === 'string' || typeof v === 'number',
      ),
    };
  }
  const variants = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : null;
  if (variants !== null) {
    const records = variants.filter(isRecord);
    const nullable = records.some((v) => v.type === 'null');
    const rest = records.filter((v) => v.type !== 'null').map((v) => parseNode(root, v, seen));
    const inner: FieldNode =
      rest.length === 0
        ? { kind: 'json' }
        : rest.length === 1 && rest[0]
          ? rest[0]
          : { kind: 'union', variants: rest };
    return nullable ? { kind: 'nullable', inner } : inner;
  }
  switch (schema.type) {
    case 'string':
      return {
        kind: 'string',
        minLength: num(schema.minLength),
        maxLength: num(schema.maxLength),
        pattern: typeof schema.pattern === 'string' ? schema.pattern : undefined,
      };
    case 'integer':
    case 'number':
      return { kind: schema.type, minimum: num(schema.minimum), maximum: num(schema.maximum) };
    case 'boolean':
      return { kind: 'boolean' };
    case 'array': {
      if (Array.isArray(schema.prefixItems)) {
        return {
          kind: 'tuple',
          items: schema.prefixItems.filter(isRecord).map((v) => parseNode(root, v, seen)),
        };
      }
      const items = isRecord(schema.items)
        ? parseNode(root, schema.items, seen)
        : ({ kind: 'json' } as const);
      return { kind: 'array', items, minItems: num(schema.minItems), maxItems: num(schema.maxItems) };
    }
    case 'object': {
      if (isRecord(schema.properties)) return parseObject(root, schema, seen);
      if (isRecord(schema.additionalProperties)) {
        const value = parseNode(root, schema.additionalProperties, seen);
        let keys: string[] | null = null;
        if (isRecord(schema.propertyNames)) {
          const names = parseNode(root, schema.propertyNames, seen);
          if (names.kind === 'enum') keys = names.options.map(String);
        }
        return { kind: 'map', keys, value };
      }
      return { kind: 'json' };
    }
    default:
      return { kind: 'json' };
  }
}

function parseObject(root: JsonSchema, schema: JsonSchema, seen: readonly string[]): FieldNode {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  const fields: FieldSpec[] = [];
  for (const [name, value] of Object.entries(properties)) {
    if (!isRecord(value)) continue;
    fields.push({
      name,
      node: parseNode(root, value, seen),
      required: required.has(name),
      default: value.default,
      hasDefault: 'default' in value,
    });
  }
  return { kind: 'object', title: typeof schema.title === 'string' ? schema.title : undefined, fields };
}

/**
 * The fields of a command, without `command_type`.
 *
 * @param schema - The command's JSON schema from `GET /api/rules/commands/{command_type}`.
 */
export function commandFields(schema: JsonSchema): FieldSpec[] {
  const node = parseObject(schema, schema, []);
  if (node.kind !== 'object') return [];
  return node.fields.filter((field) => field.name !== 'command_type');
}

/** The value a field starts with: the schema's default when it has one, and otherwise nothing. */
export function initialValue(field: FieldSpec): FormValue {
  if (field.hasDefault && field.default !== null) return structuredClone(field.default);
  if (field.required) return emptyValue(field.node);
  return undefined;
}

/** The value a newly added field, array item, or chosen variant starts with. */
export function emptyValue(node: FieldNode): FormValue {
  switch (node.kind) {
    case 'string':
      return '';
    case 'boolean':
      return false;
    case 'const':
      return node.value;
    case 'object': {
      const value: Record<string, FormValue> = {};
      for (const field of node.fields) {
        const start = initialValue(field);
        if (start !== undefined) value[field.name] = start;
      }
      return value;
    }
    case 'map':
      return node.keys ? Object.fromEntries(node.keys.map((key) => [key, emptyValue(node.value)])) : {};
    case 'array':
      return [];
    case 'tuple':
      return node.items.map((item) => emptyValue(item));
    case 'union':
      return node.variants[0] ? emptyValue(node.variants[0]) : undefined;
    default:
      return undefined;
  }
}

/** Whether a value fits a node's type, ignoring constraints. A union uses it to tell which variant is in use. */
export function fitsKind(node: FieldNode, value: FormValue): boolean {
  switch (node.kind) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum':
      return node.options.some((option) => option === value);
    case 'const':
      return value === node.value;
    case 'object':
    case 'map':
      return isRecord(value);
    case 'array':
    case 'tuple':
      return Array.isArray(value);
    case 'union':
      return node.variants.some((variant) => fitsKind(variant, value));
    case 'nullable':
      return value === null || fitsKind(node.inner, value);
    case 'json':
      return true;
  }
}

/** The index of the union variant that a value belongs to, or 0. */
export function unionVariantIndex(node: Extract<FieldNode, { kind: 'union' }>, value: FormValue): number {
  if (value === undefined) return 0;
  let best = -1;
  let bestScore = -Infinity;
  node.variants.forEach((variant, index) => {
    if (!fitsKind(variant, value)) return;
    const score = objectMatch(variant, value);
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best < 0 ? 0 : best;
}

/**
 * How well an object value matches an object variant: a `const` field that differs rules the variant out (the
 * way pydantic tells `item_type: "armour"` from `item_type: "weapon"`), and each required field present counts.
 */
function objectMatch(variant: FieldNode, value: FormValue): number {
  if (variant.kind !== 'object' || !isRecord(value)) return 0;
  let score = 0;
  for (const field of variant.fields) {
    const present = value[field.name] !== undefined;
    if (field.node.kind === 'const') {
      if (present && value[field.name] !== field.node.value) return -Infinity;
      if (present) score += 10;
    } else if (field.node.kind === 'enum' && present && field.node.options.length === 1) {
      if (value[field.name] !== field.node.options[0]) return -Infinity;
      score += 10;
    } else if (field.required) {
      score += present ? 1 : -1;
    }
  }
  return score;
}

/** A field path, such as `coins.gp` or `location.position.0`. */
export function joinPath(base: string, key: string | number): string {
  return base === '' ? String(key) : `${base}.${key}`;
}

/** Problems with a form's values, keyed by field path. Each is a sentence for the field's error line. */
export type FormErrors = Record<string, string>;

function checkNode(
  node: FieldNode,
  value: FormValue,
  required: boolean,
  path: string,
  errors: FormErrors,
): void {
  if (value === undefined) {
    if (required && node.kind !== 'nullable') {
      errors[path] = node.kind === 'enum' ? 'Choose one.' : 'Enter a value.';
    }
    return;
  }
  switch (node.kind) {
    case 'string':
      if (typeof value !== 'string') {
        errors[path] = 'Enter text.';
        return;
      }
      if (value === '' && required) {
        errors[path] = 'Enter a value.';
      } else if (node.minLength !== undefined && value.length < node.minLength) {
        errors[path] =
          node.minLength === 1 ? 'Enter a value.' : `Enter at least ${node.minLength} characters.`;
      } else if (node.maxLength !== undefined && value.length > node.maxLength) {
        errors[path] = `Use at most ${node.maxLength} characters.`;
      } else if (node.pattern !== undefined && value !== '' && !safeTest(node.pattern, value)) {
        errors[path] = 'Enter a value in the expected format.';
      }
      return;
    case 'integer':
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors[path] = 'Enter a number.';
      } else if (node.kind === 'integer' && !Number.isInteger(value)) {
        errors[path] = 'Enter a whole number.';
      } else if (node.minimum !== undefined && value < node.minimum) {
        errors[path] = `Enter ${node.minimum} or more.`;
      } else if (node.maximum !== undefined && value > node.maximum) {
        errors[path] = `Enter ${node.maximum} or less.`;
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors[path] = 'Choose yes or no.';
      return;
    case 'enum':
      if (!fitsKind(node, value)) errors[path] = 'Choose one.';
      return;
    case 'nullable':
      if (value !== null) checkNode(node.inner, value, true, path, errors);
      return;
    case 'union': {
      const variant = node.variants[unionVariantIndex(node, value)];
      if (variant) checkNode(variant, value, true, path, errors);
      return;
    }
    case 'object':
      if (!isRecord(value)) {
        errors[path] = 'Fill in these details.';
        return;
      }
      for (const field of node.fields) {
        if (field.node.kind === 'const') continue;
        checkNode(field.node, value[field.name], field.required, joinPath(path, field.name), errors);
      }
      return;
    case 'map':
      if (!isRecord(value)) {
        errors[path] = 'Fill in these details.';
        return;
      }
      for (const key of node.keys ?? Object.keys(value)) {
        checkNode(node.value, value[key], node.keys !== null, joinPath(path, key), errors);
      }
      return;
    case 'array':
      if (!Array.isArray(value)) {
        errors[path] = 'Add the entries.';
        return;
      }
      if (node.minItems !== undefined && value.length < node.minItems) {
        errors[path] = `Add at least ${node.minItems}.`;
      } else if (node.maxItems !== undefined && value.length > node.maxItems) {
        errors[path] = `Use at most ${node.maxItems}.`;
      }
      value.forEach((item, index) => checkNode(node.items, item, true, joinPath(path, index), errors));
      return;
    case 'tuple':
      if (!Array.isArray(value)) {
        errors[path] = 'Fill in every part.';
        return;
      }
      node.items.forEach((item, index) => checkNode(item, value[index], true, joinPath(path, index), errors));
      return;
    case 'const':
    case 'json':
      return;
  }
}

function safeTest(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, 'u').test(value);
  } catch {
    return true;
  }
}

/**
 * Checks a form's values against its fields.
 *
 * @returns A sentence for each field path that has a problem. An empty object means the form can be sent.
 */
export function validateFields(fields: readonly FieldSpec[], values: Record<string, FormValue>): FormErrors {
  const errors: FormErrors = {};
  for (const field of fields) {
    if (field.node.kind === 'const') continue;
    checkNode(field.node, values[field.name], field.required, field.name, errors);
  }
  return errors;
}

/** Removes unset values from a form value, so bxapi applies its own defaults for them. */
export function pruneValue(value: FormValue): FormValue {
  if (Array.isArray(value)) return value.map((item) => pruneValue(item));
  if (isRecord(value)) {
    const out: Record<string, FormValue> = {};
    for (const [key, item] of Object.entries(value)) {
      // An empty optional text field means "not set". A required one never gets here, because validation stops it.
      if (item === undefined || item === '') continue;
      out[key] = pruneValue(item);
    }
    return out;
  }
  return value;
}

/**
 * Assembles the command to send from a form's values.
 *
 * @param commandType - The command type.
 * @param values - The form's values by field name.
 */
export function buildCommand(
  commandType: string,
  values: Record<string, FormValue>,
): { command_type: string } & Record<string, unknown> {
  const pruned = pruneValue(values);
  return { ...(isRecord(pruned) ? pruned : {}), command_type: commandType };
}

/** Whether a field path names an error or sits inside one with an error, for showing a count on a collapsed group. */
export function errorsUnder(errors: FormErrors, path: string): number {
  return Object.keys(errors).filter((key) => key === path || key.startsWith(`${path}.`)).length;
}
