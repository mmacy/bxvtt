/**
 * Reads a bxapi command's JSON schema into a short list of form fields, and turns the form's values back into a
 * command. The generic command form uses it for every town command that has no custom control.
 *
 * It reads structure only: which fields exist, which are required, and what type each has. It never decides
 * whether a value is legal. bxapi does that when the command is sent.
 */

/** The kinds of control a field needs. */
export type FieldKind = 'enum' | 'text' | 'integer' | 'boolean' | 'coins' | 'list' | 'json';

/** One field of a command. */
export interface FieldSpec {
  name: string;
  kind: FieldKind;
  required: boolean;
  /** The allowed values of an `enum` field. */
  options: string[];
}

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

/** Follows a local `$ref` such as `#/$defs/Coins` in the schema. */
function resolve(schema: Json, root: Json): Json {
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return schema;
  let node: unknown = root;
  for (const part of ref.slice(2).split('/')) node = record(node)?.[part];
  return record(node) ?? schema;
}

/** Picks the first non-null branch of an `anyOf`, which is how bxapi writes an optional field. */
function unwrap(schema: Json, root: Json): Json {
  const branches = Array.isArray(schema.anyOf) ? schema.anyOf : null;
  if (branches === null) return resolve(schema, root);
  for (const branch of branches) {
    const candidate = record(branch);
    if (candidate !== null && candidate.type !== 'null') return resolve(candidate, root);
  }
  return schema;
}

function kindOf(schema: Json, root: Json): { kind: FieldKind; options: string[] } {
  const node = unwrap(schema, root);
  if (Array.isArray(node.enum)) {
    return { kind: 'enum', options: node.enum.filter((value): value is string => typeof value === 'string') };
  }
  const properties = record(node.properties);
  if (properties !== null && ['pp', 'gp', 'ep', 'sp', 'cp'].every((coin) => coin in properties)) {
    return { kind: 'coins', options: [] };
  }
  switch (node.type) {
    case 'string':
      return { kind: 'text', options: [] };
    case 'integer':
    case 'number':
      return { kind: 'integer', options: [] };
    case 'boolean':
      return { kind: 'boolean', options: [] };
    case 'array': {
      const items = unwrap(record(node.items) ?? {}, root);
      return { kind: items.type === 'string' ? 'list' : 'json', options: [] };
    }
    default:
      return { kind: 'json', options: [] };
  }
}

/**
 * Reads the fields of a command's schema, required fields first.
 *
 * @param schema - The `json_schema` of a bxapi command.
 */
export function readFields(schema: Record<string, unknown>): FieldSpec[] {
  const properties = record(schema.properties) ?? {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const fields: FieldSpec[] = [];
  for (const [name, value] of Object.entries(properties)) {
    if (name === 'command_type' || name === 'source') continue;
    const { kind, options } = kindOf(record(value) ?? {}, schema);
    fields.push({ name, kind, required: required.has(name), options });
  }
  return fields.sort((a, b) => Number(b.required) - Number(a.required));
}

/** A form value: text, a number, a flag, a list, or coins. */
export type FieldValue = string | number | boolean | string[] | Record<string, number> | null | undefined;

/**
 * Builds the command to send. A field is included when it has a value, and a `json` field is parsed.
 *
 * @param commandType - The command, such as `give_items`.
 * @param fields - The schema's fields.
 * @param values - The form's values by field name.
 * @returns The command, or an error sentence when a `json` field is not valid JSON.
 */
export function buildCommand(
  commandType: string,
  fields: readonly FieldSpec[],
  values: Record<string, FieldValue>,
): { command: { command_type: string } & Record<string, unknown> } | { error: string } {
  const command: { command_type: string } & Record<string, unknown> = { command_type: commandType };
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined || value === null || value === '') continue;
    if (field.kind === 'json') {
      try {
        command[field.name] = JSON.parse(String(value)) as unknown;
      } catch {
        return { error: 'One field is not valid JSON. Check the brackets and quotes, then try again.' };
      }
    } else if (field.kind === 'list') {
      const list = Array.isArray(value) ? value : String(value).split('\n');
      const cleaned = list.map((entry) => entry.trim()).filter((entry) => entry !== '');
      if (cleaned.length > 0) command[field.name] = cleaned;
    } else if (field.kind === 'coins') {
      const coins = value as Record<string, number>;
      if (Object.values(coins).some((amount) => amount > 0)) command[field.name] = coins;
    } else {
      command[field.name] = value;
    }
  }
  return { command };
}

/** Which required fields still lack a value. */
export function missingRequired(fields: readonly FieldSpec[], values: Record<string, FieldValue>): string[] {
  return fields
    .filter((field) => {
      if (!field.required) return false;
      const value = values[field.name];
      if (field.kind === 'boolean') return false;
      if (Array.isArray(value)) return value.length === 0;
      return value === undefined || value === null || value === '';
    })
    .map((field) => field.name);
}
