/**
 * A small form for any legal command that has no control of its own, built from the command's JSON schema, so
 * nothing bxapi allows is out of reach. Field labels and help come from `commandFieldText`. A field that names a
 * party member offers the members, a field that names a cache offers the caches here, and a field that names an
 * item offers what the chosen member carries. bxapi checks the rest and explains a refusal.
 */
import type { MemberView, SpellSummary } from '@bxvtt/shared/bxapi';
import {
  classLabel,
  commandFieldOptionLabel,
  commandFieldText,
  commandInfo,
  itemLabel,
  resolveItemNoun,
  spellName,
} from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import {
  cachesToTake,
  rolledTreasureNumbers,
  useCommandSchema,
  useHere,
  useLegalCommand,
  usePlayerView,
  useSpellCatalog,
  useTextContext,
  type GameCommand,
} from '@/app';
import {
  Banner,
  Button,
  Checkbox,
  Dialog,
  Field,
  NumberInput,
  Select,
  Skeleton,
  TextInput,
  Textarea,
  Tag,
  type SelectGroup,
  type SelectOption,
} from '@/ui';
import { cacheMenuName } from './actions';
import { useActionContext } from './hooks';
import { packItems } from './party';
import { useExploreSend } from './useExploreSend';
import styles from './explore.module.css';

type Json = Record<string, unknown>;

function record(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

/** One field of a command form. */
export type FormField =
  | { name: string; kind: 'member'; required: boolean; acting: boolean }
  | { name: string; kind: 'feature'; required: boolean }
  | { name: string; kind: 'item'; required: boolean }
  | { name: string; kind: 'spell'; required: boolean }
  | { name: string; kind: 'spellList'; required: boolean }
  | { name: string; kind: 'items'; required: boolean }
  | { name: string; kind: 'enum'; required: boolean; values: string[] }
  | { name: string; kind: 'boolean'; required: boolean; initial: boolean }
  | { name: string; kind: 'number'; required: boolean; integer: boolean; min?: number; max?: number }
  | { name: string; kind: 'text'; required: boolean }
  | { name: string; kind: 'list'; required: boolean }
  | { name: string; kind: 'group'; required: boolean; fields: FormField[] }
  | { name: string; kind: 'json'; required: boolean };

/** Follows a `$ref` and unwraps `anyOf: [X, null]`, returning the schema and whether `null` is allowed. */
function resolve(schema: Json, root: Json): { schema: Json; nullable: boolean } {
  let current = schema;
  let nullable = false;
  for (let depth = 0; depth < 8; depth += 1) {
    const ref = current['$ref'];
    if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
      const defs = record(root['$defs']);
      const target = record(defs?.[ref.slice('#/$defs/'.length)]);
      if (!target) break;
      current = {
        ...target,
        ...Object.fromEntries(Object.entries(current).filter(([key]) => key !== '$ref')),
      };
      continue;
    }
    const anyOf = current['anyOf'];
    if (Array.isArray(anyOf)) {
      const options = anyOf.map(record).filter((option): option is Json => option !== null);
      const others = options.filter((option) => option['type'] !== 'null');
      if (others.length < options.length) nullable = true;
      const [only] = others;
      if (others.length === 1 && only) {
        current = { ...only, ...(current['default'] !== undefined ? { default: current['default'] } : {}) };
        continue;
      }
    }
    break;
  }
  return { schema: current, nullable };
}

/** Whether an array's items are spell choices: objects with a `spell_id`, such as `prepare_spells.selections`. */
function isSpellSelection(items: Json | null, root: Json): boolean {
  if (items === null) return false;
  const properties = record(resolve(items, root).schema['properties']);
  return properties !== null && 'spell_id' in properties;
}

const MEMBER_FIELDS = new Set(['character_id', 'recipient_id', 'target_id', 'member_id', 'caster_id']);

/**
 * Turns a command's JSON schema into form fields. `command_type` and `source` never appear.
 *
 * @param schema - The command's `json_schema`.
 * @param memberField - The field that names the acting member, from the legal command.
 */
export function fieldsFromSchema(schema: Json, memberField: string | null, root: Json = schema): FormField[] {
  const properties = record(schema['properties']) ?? {};
  const required = new Set(
    Array.isArray(schema['required']) ? schema['required'].filter((x) => typeof x === 'string') : [],
  );
  const fields: FormField[] = [];
  for (const [name, raw] of Object.entries(properties)) {
    if (name === 'command_type' || name === 'source') continue;
    const property = record(raw);
    if (!property) continue;
    const { schema: field, nullable } = resolve(property, root);
    const isRequired = required.has(name) && !nullable;
    const type = field['type'];
    if (MEMBER_FIELDS.has(name) || name === memberField) {
      fields.push({ name, kind: 'member', required: isRequired, acting: name === memberField });
    } else if (name === 'feature_id') {
      fields.push({ name, kind: 'feature', required: isRequired });
    } else if (name === 'item_id') {
      fields.push({ name, kind: 'item', required: isRequired });
    } else if (name === 'spell_id') {
      fields.push({ name, kind: 'spell', required: isRequired });
    } else if (Array.isArray(field['enum'])) {
      fields.push({ name, kind: 'enum', required: isRequired, values: field['enum'].map(String) });
    } else if (type === 'boolean') {
      fields.push({ name, kind: 'boolean', required: isRequired, initial: field['default'] === true });
    } else if (type === 'integer' || type === 'number') {
      fields.push({
        name,
        kind: 'number',
        required: isRequired,
        integer: type === 'integer',
        min: typeof field['minimum'] === 'number' ? field['minimum'] : undefined,
        max: typeof field['maximum'] === 'number' ? field['maximum'] : undefined,
      });
    } else if (type === 'string') {
      fields.push({ name, kind: 'text', required: isRequired });
    } else if (type === 'array' && isSpellSelection(record(field['items']), root)) {
      fields.push({ name, kind: 'spellList', required: isRequired });
    } else if (type === 'array' && record(field['items'])?.['type'] === 'string') {
      fields.push({ name, kind: name === 'item_ids' ? 'items' : 'list', required: isRequired });
    } else if (type === 'object' && record(field['properties'])) {
      fields.push({ name, kind: 'group', required: isRequired, fields: fieldsFromSchema(field, null, root) });
    } else {
      fields.push({ name, kind: 'json', required: isRequired });
    }
  }
  return fields;
}

/** Builds the command from the form's values, leaving out empty optional fields. */
export function commandFromValues(
  commandType: string,
  fields: readonly FormField[],
  values: Json,
): GameCommand {
  const out: GameCommand = { command_type: commandType };
  const read = (list: readonly FormField[], source: Json, target: Json) => {
    for (const field of list) {
      const value = source[field.name];
      if (field.kind === 'group') {
        const inner: Json = {};
        read(field.fields, record(value) ?? {}, inner);
        if (Object.keys(inner).length > 0) target[field.name] = inner;
        continue;
      }
      if (field.kind === 'json') {
        if (typeof value === 'string' && value.trim() !== '') {
          try {
            target[field.name] = JSON.parse(value) as unknown;
          } catch {
            target[field.name] = value;
          }
        }
        continue;
      }
      if (field.kind === 'spellList') {
        if (Array.isArray(value) && value.length > 0)
          target[field.name] = value
            .filter((id): id is string => typeof id === 'string')
            .map((id) => ({ spell_id: id }));
        continue;
      }
      if (field.kind === 'list') {
        if (typeof value === 'string' && value.trim() !== '')
          target[field.name] = value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean);
        continue;
      }
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value) && value.length === 0 && !field.required) continue;
      target[field.name] = value;
    }
  };
  read(fields, values, out);
  return out;
}

interface FieldInputProps {
  commandType: string;
  field: FormField;
  value: unknown;
  values: Json;
  onChange: (value: unknown) => void;
  can: (commandType: string, memberId?: string) => boolean;
  actingField: string | null;
}

function memberOptions(
  party: readonly MemberView[],
  filter: (member: MemberView) => boolean,
): SelectOption[] {
  return party.filter(filter).map((member) => ({ value: member.id, label: member.name }));
}

function FieldInput({ commandType, field, value, values, onChange, can, actingField }: FieldInputProps) {
  const view = usePlayerView();
  const here = useHere();
  const ctx = useTextContext();
  const text = commandFieldText(commandType, field.name);
  const party = view?.party ?? [];
  const actingId = actingField ? values[actingField] : undefined;
  const carrier = party.find((member) => member.id === actingId) ?? null;

  switch (field.kind) {
    case 'member': {
      // The acting member can't give to themselves, so the recipient list leaves them out. A target can be the
      // acting member, such as a potion they drink or a scroll they read on themselves, so it keeps them.
      const actingMemberId = typeof actingId === 'string' ? actingId : undefined;
      const options = memberOptions(party, (member) =>
        field.acting
          ? can(commandType, member.id)
          : field.name !== 'recipient_id' || member.id !== actingMemberId,
      );
      return (
        <Field label={text.label} hint={text.help} required={field.required}>
          <Select
            options={field.required ? options : [{ value: '', label: 'No one' }, ...options]}
            value={typeof value === 'string' ? value : ''}
            onValueChange={(next) => onChange(next === '' ? undefined : next)}
            placeholder="Choose a party member"
          />
        </Field>
      );
    }
    case 'feature': {
      const numbers = rolledTreasureNumbers(here?.caches ?? []);
      const options: SelectOption[] = cachesToTake(here).map((cache) => ({
        value: cache.id,
        label: cacheMenuName(cache, numbers),
      }));
      if (here?.pile) options.push({ value: 'pile', label: 'Dropped goods' });
      return (
        <Field label={text.label} hint={options.length === 0 ? 'No treasure within reach.' : text.help}>
          <Select
            options={options}
            value={typeof value === 'string' ? value : undefined}
            onValueChange={onChange}
            disabled={options.length === 0}
            placeholder="Choose treasure"
          />
        </Field>
      );
    }
    case 'item': {
      const owners = carrier ? [carrier] : party;
      const seen = new Set<string>();
      const options: SelectOption[] = [];
      for (const owner of owners) {
        for (const item of packItems(owner)) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          options.push({
            value: item.id,
            label: itemLabel(resolveItemNoun(item.id, ctx, { name: item.name }), item.quantity),
          });
        }
      }
      return (
        <Field label={text.label} hint={text.help} required={field.required}>
          <Select
            options={options}
            value={typeof value === 'string' ? value : undefined}
            onValueChange={onChange}
            placeholder="Choose an item"
          />
        </Field>
      );
    }
    case 'spell': {
      // The caster's memorized spells and spell book, when the form names a caster. bxapi decides what works.
      const ids = new Set<string>();
      for (const entry of carrier?.memorized_spells ?? []) {
        const id = entry['spell_id'];
        if (typeof id === 'string') ids.add(id);
      }
      for (const id of carrier?.spell_book ?? []) ids.add(id);
      if (ids.size === 0) {
        return (
          <Field
            label={text.label}
            hint={carrier ? text.help : 'Choose a party member first.'}
            required={field.required}
          >
            <TextInput
              value={typeof value === 'string' ? value : ''}
              onChange={(event) => onChange(event.target.value)}
            />
          </Field>
        );
      }
      return (
        <Field label={text.label} hint={text.help} required={field.required}>
          <Select
            options={[...ids].map((id) => ({ value: id, label: spellName(id, ctx) }))}
            value={typeof value === 'string' ? value : undefined}
            onValueChange={onChange}
            placeholder="Choose a spell"
          />
        </Field>
      );
    }
    case 'spellList':
      return (
        <SpellListInput
          label={text.label}
          help={text.help}
          value={value}
          onChange={onChange}
          caster={carrier}
        />
      );
    case 'items': {
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      const items = carrier ? packItems(carrier) : [];
      return (
        <fieldset className={styles.formGroup}>
          <legend className={styles.formLegend}>{text.label}</legend>
          {items.length === 0 ? (
            <p className={styles.formHint}>
              {carrier ? `${carrier.name} isn't carrying any items.` : 'Choose a party member first.'}
            </p>
          ) : (
            items.map((item) => (
              <Checkbox
                key={item.id}
                label={itemLabel(resolveItemNoun(item.id, ctx, { name: item.name }), item.quantity)}
                checked={chosen.includes(item.id)}
                onCheckedChange={(checked) =>
                  onChange(checked ? [...chosen, item.id] : chosen.filter((id) => id !== item.id))
                }
              />
            ))
          )}
        </fieldset>
      );
    }
    case 'enum':
      return (
        <Field label={text.label} hint={text.help} required={field.required}>
          <Select
            options={field.values.map((option) => ({
              value: option,
              label: commandFieldOptionLabel(commandType, field.name, option),
            }))}
            value={typeof value === 'string' ? value : undefined}
            onValueChange={onChange}
            placeholder="Choose an option"
          />
        </Field>
      );
    case 'boolean':
      return (
        <Checkbox
          label={text.label}
          description={text.help}
          checked={typeof value === 'boolean' ? value : field.initial}
          onCheckedChange={onChange}
        />
      );
    case 'number':
      return (
        <Field label={text.label} hint={text.help} required={field.required}>
          <NumberInput
            value={typeof value === 'number' ? value : null}
            onChange={onChange}
            min={field.min}
            max={field.max}
            step={field.integer ? 1 : 0.1}
            width={6}
          />
        </Field>
      );
    case 'group':
      return (
        <fieldset className={styles.formGroup}>
          <legend className={styles.formLegend}>{text.label}</legend>
          {field.fields.map((inner) => (
            <FieldInput
              key={inner.name}
              commandType={commandType}
              field={inner}
              value={record(value)?.[inner.name]}
              values={values}
              onChange={(next) => onChange({ ...(record(value) ?? {}), [inner.name]: next })}
              can={can}
              actingField={actingField}
            />
          ))}
        </fieldset>
      );
    case 'list':
      return (
        <Field
          label={text.label}
          hint={`${text.help} Separate multiple values with commas.`}
          required={field.required}
        >
          <TextInput
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
    case 'json':
      return (
        <Field label={text.label} hint={text.help} required={field.required}>
          <Textarea
            rows={3}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
    case 'text':
      return (
        <Field label={text.label} hint={text.help} required={field.required}>
          <TextInput
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
  }
}

export interface CommandFormDialogProps {
  /** The command to fill in, or `null` when the dialog is closed. */
  commandType: string | null;
  onClose: () => void;
}

/** A dialog with the generic form for one command. */
export function CommandFormDialog({ commandType, onClose }: CommandFormDialogProps) {
  const open = commandType !== null;
  const info = commandType ? commandInfo(commandType) : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={info?.label ?? ''}
      description={info?.description}
      size="sm"
    >
      {commandType && <CommandFormBody key={commandType} commandType={commandType} onDone={onClose} />}
    </Dialog>
  );
}

/** Whether a form value has nothing in it: not set, blank, or a list with no entries. */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return Array.isArray(value) && value.length === 0;
}

/**
 * The first required field that has no value yet, which keeps the form's submit button off. A required list with
 * no entries counts as empty, and so does a required field inside a group that is required or has a value.
 */
export function firstMissingField(fields: readonly FormField[], values: Json): FormField | undefined {
  for (const field of fields) {
    if (field.kind === 'group') {
      const inner = record(values[field.name]);
      const started = inner !== null && Object.values(inner).some((value) => !isEmptyValue(value));
      if (!field.required && !started) continue;
      const missing = firstMissingField(field.fields, inner ?? {});
      if (missing !== undefined) return missing;
      continue;
    }
    if (field.required && field.kind !== 'boolean' && isEmptyValue(values[field.name])) return field;
  }
  return undefined;
}

function CommandFormBody({ commandType, onDone }: { commandType: string; onDone: () => void }) {
  const schema = useCommandSchema(commandType);
  const legal = useLegalCommand(commandType);
  const ctx = useActionContext();
  const { send, pending } = useExploreSend();
  const [chosen, setValues] = useState<Json>({});
  const [error, setError] = useState<string | null>(null);
  const memberField = legal?.member_field ?? null;
  // When only one member can act, they are the acting member, so the form starts with them chosen.
  const actors = (ctx?.view.party ?? []).filter((member) => ctx?.can(commandType, member.id) === true);
  const onlyActor = memberField !== null && actors.length === 1 ? actors[0] : undefined;
  const values: Json = {
    ...(onlyActor !== undefined && memberField !== null ? { [memberField]: onlyActor.id } : {}),
    ...chosen,
  };
  // A recipient who became the acting member is no longer on the list, so the form doesn't send them.
  if (
    memberField !== null &&
    values.recipient_id !== undefined &&
    values.recipient_id === values[memberField]
  )
    delete values.recipient_id;
  const fields = useMemo(() => {
    const json = record(schema.data?.json_schema);
    return json ? fieldsFromSchema(json, memberField) : null;
  }, [schema.data, memberField]);

  if (schema.loading || (fields === null && !schema.error)) return <Skeleton lines={3} />;
  if (fields === null || ctx === null) {
    return (
      <Banner tone="danger" title="Couldn't load this action">
        Close this dialog and try again.
      </Banner>
    );
  }
  const firstMissing = firstMissingField(fields, values);
  const submit = async () => {
    setError(null);
    const result = await send(commandFromValues(commandType, fields, values), { feedback: 'inline' });
    if (result.status === 'accepted') onDone();
    else if (result.status === 'refused' || result.status === 'error') setError(result.message);
  };
  return (
    <form
      className={styles.dialogForm}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {fields.length === 0 && <p className={styles.formHint}>No additional options needed.</p>}
      {fields.map((field) => (
        <FieldInput
          key={field.name}
          commandType={commandType}
          field={field}
          value={values[field.name]}
          values={values}
          onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
          can={ctx.can}
          actingField={memberField}
        />
      ))}
      {error && <Banner tone="warning">{error}</Banner>}
      <div className={styles.formFooter}>
        <Button variant="ghost" type="button" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="submit"
          loading={pending}
          disabled={firstMissing !== undefined}
          disabledReason={
            firstMissing === undefined
              ? null
              : `Fill in ${commandFieldText(commandType, firstMissing.name).label} first.`
          }
        >
          {commandInfo(commandType).button}
        </Button>
      </div>
    </form>
  );
}

interface SpellListInputProps {
  label: string;
  help: string;
  value: unknown;
  onChange: (value: unknown) => void;
  caster: MemberView | null;
}

/**
 * Chooses spells, one copy at a time, so a caster can memorize a spell twice. It offers the caster's spell book,
 * or the whole rules catalog for a caster without a book, and bxapi refuses a spell the caster can't prepare.
 */
function SpellListInput({ label, help, value, onChange, caster }: SpellListInputProps) {
  const ctx = useTextContext();
  const catalog = useSpellCatalog();
  const chosen = Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  const book = caster?.spell_book ?? [];
  const options: Array<SelectOption | SelectGroup> =
    book.length > 0
      ? book.map((id) => ({ value: id, label: spellName(id, ctx) }))
      : groupSpells(catalog.data ?? []);
  return (
    <Field label={label} hint={caster ? help : 'Choose a party member first.'}>
      <div className={styles.spellList}>
        {chosen.length > 0 && (
          <div className={styles.spellTags}>
            {chosen.map((id, index) => (
              <Tag
                key={`${id}-${index}`}
                removeLabel={`Remove ${spellName(id, ctx)}`}
                onRemove={() => onChange(chosen.filter((_, i) => i !== index))}
              >
                {spellName(id, ctx)}
              </Tag>
            ))}
          </div>
        )}
        <Select
          options={options}
          value=""
          disabled={caster === null}
          onValueChange={(id) => {
            if (id) onChange([...chosen, id]);
          }}
          placeholder={catalog.loading && book.length === 0 ? 'Loading spells…' : 'Add a spell'}
          aria-label={`Add a spell to ${label.toLowerCase()}`}
        />
      </div>
    </Field>
  );
}

/** The catalog's spells, grouped by spell list and level. */
function groupSpells(spells: readonly SpellSummary[]): SelectGroup[] {
  const groups = new Map<string, SelectOption[]>();
  for (const spell of spells) {
    const list = classLabel(spell.spell_list);
    const key = `${list} spells, level ${spell.level}`;
    groups.set(key, [...(groups.get(key) ?? []), { value: spell.id, label: spell.name }]);
  }
  return [...groups.entries()].map(([label, options]) => ({ label, options }));
}
