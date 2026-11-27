/**
 * The editors of a schema form. `FieldList` renders the fields of one object, and `FieldEditor` picks the
 * editor for one field: a smart picker when the field names something the referee would rather pick by name (a
 * member, an item, a monster, a quest, a place on the map), and otherwise a control for the field's JSON type.
 */
import {
  abilityLabel,
  classLabel,
  COIN_FIELD_TEXT,
  commandFieldOptionLabel,
  commandFieldText,
  LOCATION_FIELD_TEXT,
  prettifyId,
  type FieldText,
} from '@bxvtt/shared/text';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMyCharacters, useStoredCharacter } from '@/app';
import {
  Button,
  Checkbox,
  Combobox,
  Field,
  IconButton,
  NumberInput,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
  TextInput,
} from '@/ui';
import {
  CarriedItemPicker,
  carriedItems,
  CatalogItemPicker,
  DungeonPicker,
  MapPickButton,
  MemberPicker,
  MonsterPicker,
  ObjectivePicker,
  QuestPicker,
  SpellPicker,
  TriggerPicker,
  useAreaOptions,
} from '../pickers';
import styles from '../referee.module.css';
import type { RefereeData } from '../useReferee';
import { flagUses, flagUseTooltip } from '../model/describe';
import {
  emptyValue,
  errorsUnder,
  joinPath,
  unionVariantIndex,
  type FieldNode,
  type FieldSpec,
  type FormErrors,
  type FormValue,
} from './model';

/** What every editor of one form shares. */
export interface FormEnv {
  commandType: string;
  data: RefereeData;
  errors: FormErrors;
  /** Errors show once the user has tried to send the form. */
  showErrors: boolean;
  /** Lets an editor report a problem the schema can't see, such as JSON that doesn't parse. */
  setExtraError: (path: string, message: string | null) => void;
}

export const FormEnvContext = createContext<FormEnv | null>(null);

function useEnv(): FormEnv {
  const env = useContext(FormEnvContext);
  if (env === null) throw new Error('A schema field needs a CommandForm around it.');
  return env;
}

type Values = Record<string, FormValue>;

function isRecord(value: unknown): value is Values {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Label and help for a field, with the tables the text layer keeps for nested fields. */
function textFor(commandType: string, parentName: string | null, name: string): FieldText {
  if (parentName === '__abilities') return { label: abilityLabel(name), help: '' };
  if (parentName?.startsWith('__tuple:')) return { label: parentName.slice('__tuple:'.length), help: '' };
  if (parentName === 'coins' && COIN_FIELD_TEXT[name]) return COIN_FIELD_TEXT[name];
  if (parentName === 'location' && LOCATION_FIELD_TEXT[name]) return LOCATION_FIELD_TEXT[name];
  return commandFieldText(commandType, name);
}

export interface FieldEditorProps {
  field: FieldSpec;
  path: string;
  value: FormValue;
  onChange: (value: FormValue) => void;
  /** The values of the object this field belongs to, for pickers that depend on a sibling. */
  parent: Values;
  /** Sets several sibling fields at once, such as a cell picked on the map. */
  onParentChange: (patch: Values) => void;
  parentName: string | null;
  depth: number;
}

/** Fields that together name a cell or a door, so a form can offer one map pick for all of them. */
function mapGroup(fields: readonly FieldSpec[]): 'cell' | 'edge' | null {
  const names = new Set(fields.map((f) => f.name));
  if (!['dungeon_id', 'level_number', 'x', 'y'].every((n) => names.has(n))) return null;
  return names.has('direction') ? 'edge' : 'cell';
}

/** The fields of one object, in schema order with required fields first. */
export function FieldList({
  fields,
  values,
  onValuesChange,
  path,
  parentName,
  depth,
  hidden,
}: {
  fields: readonly FieldSpec[];
  values: Values;
  onValuesChange: (values: Values) => void;
  path: string;
  parentName: string | null;
  depth: number;
  hidden?: ReadonlySet<string>;
}) {
  const visible = fields.filter((f) => f.node.kind !== 'const' && !hidden?.has(f.name));
  // Required fields first, then optional ones, with `source` (a note for the command log) last.
  const ordered = [
    ...visible.filter((f) => f.required),
    ...visible.filter((f) => !f.required && f.name !== 'source'),
    ...visible.filter((f) => f.name === 'source'),
  ];
  const group = mapGroup(visible);
  const setField = (name: string, value: FormValue) => onValuesChange({ ...values, [name]: value });
  const patch = (next: Values) => onValuesChange({ ...values, ...next });
  return (
    <div className={styles.fields}>
      {group && (
        <div className={styles.pickRow}>
          <MapPickButton
            kind={group}
            prompt={
              group === 'edge'
                ? 'Pick the door to change. Click it, or use the arrow keys, press E to turn to its side, and press Enter.'
                : 'Pick the cell to use. Click it, or use the arrow keys and press Enter.'
            }
            onPick={(target) => {
              const next: Values = {
                dungeon_id: target.dungeon_id,
                level_number: target.level_number,
                x: target.x,
                y: target.y,
              };
              if (target.kind === 'edge') next.direction = target.direction;
              patch(next);
            }}
          />
          <span className={styles.muted}>Or enter it below.</span>
        </div>
      )}
      {ordered.map((field) => (
        <FieldEditor
          key={field.name}
          field={field}
          path={joinPath(path, field.name)}
          value={values[field.name]}
          onChange={(value) => setField(field.name, value)}
          parent={values}
          onParentChange={patch}
          parentName={parentName}
          depth={depth}
        />
      ))}
    </div>
  );
}

/** Wraps a simple control in a kit `Field` with the field's label, help, and error. */
function Labelled({
  props,
  children,
  aside,
}: {
  props: FieldEditorProps;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const env = useEnv();
  const text = textFor(env.commandType, props.parentName, props.field.name);
  const error = env.showErrors ? env.errors[props.path] : undefined;
  return (
    <Field label={text.label} hint={text.help} error={error} required={props.field.required} aside={aside}>
      {children}
    </Field>
  );
}

/** Picks the editor for one field. */
export function FieldEditor(props: FieldEditorProps) {
  const smart = useSmartEditor(props);
  if (smart !== undefined) return smart;
  return <GenericEditor {...props} />;
}

function optionalString(value: string, required: boolean): FormValue {
  return value === '' && !required ? undefined : value;
}

/** A field that names something a picker can offer by name. `undefined` means no smart editor applies. */
function useSmartEditor(props: FieldEditorProps): ReactNode | undefined {
  const env = useEnv();
  const { field, value, onChange, parent } = props;
  const { commandType, data } = env;
  const invalid = env.showErrors && env.errors[props.path] !== undefined;
  const name = field.name;
  const inner = field.node.kind === 'nullable' ? field.node.inner : field.node;
  const isText = inner.kind === 'string';

  if (isText && (name === 'character_id' || name === 'recipient_id')) {
    return (
      <Labelled props={props}>
        <MemberPicker value={str(value)} invalid={invalid} onChange={(v) => onChange(v ?? undefined)} />
      </Labelled>
    );
  }
  if (isText && name === 'give_to') {
    return (
      <Labelled props={props}>
        <MemberPicker
          value={str(value)}
          invalid={invalid}
          noneLabel="Nobody (discard belongings)"
          exclude={str(parent.character_id)}
          onChange={(v) => onChange(v ?? undefined)}
        />
      </Labelled>
    );
  }
  if (isText && name === 'item_id') {
    if (commandType === 'remove_item' || commandType === 'identify_item') {
      const memberId = str(parent.character_id);
      const sheet = data.state?.party.members.find((m) => m.id === memberId);
      const all = carriedItems(sheet, data.ctx);
      const items = commandType === 'identify_item' ? all.filter((i) => i.kind === 'magic') : all;
      return (
        <Labelled props={props}>
          <CarriedItemPicker
            items={items}
            value={str(value)}
            invalid={invalid}
            onChange={(v) => onChange(v ?? undefined)}
            emptyText={
              memberId === null
                ? 'Choose a party member first'
                : commandType === 'identify_item'
                  ? 'No magic items carried'
                  : 'No items carried'
            }
          />
        </Labelled>
      );
    }
    return (
      <Labelled props={props}>
        <CatalogItemPicker
          value={str(value)}
          invalid={invalid}
          adventure={data.adventure}
          onChange={(v) => onChange(v ?? undefined)}
        />
      </Labelled>
    );
  }
  if (isText && (name === 'template_id' || name === 'monster_id')) {
    return (
      <Labelled props={props}>
        <MonsterPicker
          value={str(value)}
          invalid={invalid}
          adventure={data.adventure}
          onChange={(v) => onChange(v ?? undefined)}
        />
      </Labelled>
    );
  }
  if (isText && name === 'spell_id') {
    return (
      <Labelled props={props}>
        <SpellPicker value={str(value)} invalid={invalid} onChange={(v) => onChange(v ?? undefined)} />
      </Labelled>
    );
  }
  if (isText && name === 'quest_id' && data.adventure) {
    return (
      <Labelled props={props}>
        <QuestPicker
          value={str(value)}
          invalid={invalid}
          adventure={data.adventure}
          statuses={data.state?.quests ?? {}}
          onChange={(v) => props.onParentChange({ quest_id: v ?? undefined, objective_id: undefined })}
        />
      </Labelled>
    );
  }
  if (isText && name === 'objective_id' && data.adventure) {
    const questId = str(parent.quest_id);
    return (
      <Labelled props={props}>
        <ObjectivePicker
          questId={questId}
          value={str(value)}
          invalid={invalid}
          adventure={data.adventure}
          objectiveStates={questId ? (data.state?.quests[questId]?.objectives ?? {}) : {}}
          onChange={(v) => onChange(v ?? undefined)}
        />
      </Labelled>
    );
  }
  if (isText && name === 'trigger_id' && (data.adventure?.triggers.length ?? 0) > 0) {
    return (
      <Labelled props={props}>
        <TriggerPicker
          value={str(value)}
          invalid={invalid}
          adventure={data.adventure}
          fired={data.state?.fired_triggers ?? []}
          onChange={(v) => onChange(v ?? undefined)}
        />
      </Labelled>
    );
  }
  if (isText && name === 'dungeon_id' && data.adventure) {
    return (
      <Labelled props={props}>
        <DungeonPicker
          value={str(value)}
          invalid={invalid}
          adventure={data.adventure}
          onChange={(v) => onChange(v ?? undefined)}
        />
      </Labelled>
    );
  }
  if (isText && name === 'area_id' && data.adventure) return <AreaEditor {...props} />;
  if (isText && name === 'key' && commandType === 'set_flag') return <FlagKeyEditor {...props} />;
  if (
    isText &&
    (name === 'text' || name === 'narrative' || (inner.kind === 'string' && (inner.maxLength ?? 0) > 200))
  ) {
    return (
      <Labelled props={props}>
        <Textarea
          rows={3}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(optionalString(e.target.value, field.required))}
        />
      </Labelled>
    );
  }
  if (name === 'coins' && field.node.kind === 'object') return <CoinsEditor {...props} />;
  if (name === 'location' && field.node.kind === 'object') return <LocationEditor {...props} />;
  if (name === 'character' && commandType === 'add_member' && field.node.kind === 'object') {
    return <CharacterEditor {...props} />;
  }
  return undefined;
}

/** A control for a field's JSON type. */
function GenericEditor(props: FieldEditorProps) {
  const env = useEnv();
  const { field, value, onChange } = props;
  const node = field.node;
  const invalid = env.showErrors && env.errors[props.path] !== undefined;
  switch (node.kind) {
    case 'const':
      return null;
    case 'string':
      return (
        <Labelled props={props}>
          <TextInput
            value={typeof value === 'string' ? value : ''}
            maxLength={node.maxLength}
            onChange={(e) => onChange(optionalString(e.target.value, field.required))}
          />
        </Labelled>
      );
    case 'integer':
    case 'number':
      return (
        <Labelled props={props}>
          <NumberInput
            value={typeof value === 'number' ? value : null}
            min={node.minimum}
            max={node.maximum}
            step={node.kind === 'integer' ? 1 : 0.1}
            invalid={invalid}
            onChange={(next) => onChange(next ?? undefined)}
          />
        </Labelled>
      );
    case 'boolean':
      return <BooleanEditor {...props} />;
    case 'enum':
      return (
        <Labelled props={props}>
          <EnumSelect
            fieldName={field.name}
            options={node.options}
            value={value}
            onChange={onChange}
            allowUnset={!field.required}
            invalid={invalid}
          />
        </Labelled>
      );
    case 'nullable':
      return <NullableEditor {...props} node={node} />;
    case 'object':
      return <ObjectEditor {...props} node={node} />;
    case 'map':
      return <MapEditor {...props} node={node} />;
    case 'array':
      return <ArrayEditor {...props} node={node} />;
    case 'tuple':
      return <TupleEditor {...props} node={node} />;
    case 'union':
      return <UnionEditor {...props} node={node} />;
    case 'json':
      return <JsonEditor {...props} />;
  }
}

const UNSET = '__unset__';

function EnumSelect({
  fieldName,
  options,
  value,
  onChange,
  allowUnset,
  unsetLabel = 'Not set',
  invalid,
  id,
}: {
  fieldName: string;
  options: ReadonlyArray<string | number>;
  value: FormValue;
  onChange: (value: FormValue) => void;
  allowUnset: boolean;
  unsetLabel?: string;
  invalid?: boolean;
  id?: string;
}) {
  const env = useEnv();
  const items = [
    ...(allowUnset ? [{ value: UNSET, label: unsetLabel }] : []),
    ...options.map((option) => ({
      value: String(option),
      label: commandFieldOptionLabel(env.commandType, fieldName, String(option)),
    })),
  ];
  const current = value === undefined || value === null ? (allowUnset ? UNSET : undefined) : String(value);
  return (
    <Select
      id={id}
      invalid={invalid}
      options={items}
      value={current}
      placeholder="Choose one"
      onValueChange={(next) => {
        if (next === UNSET) return onChange(undefined);
        onChange(options.find((o) => String(o) === next));
      }}
    />
  );
}

function BooleanEditor(props: FieldEditorProps) {
  const env = useEnv();
  const text = textFor(env.commandType, props.parentName, props.field.name);
  return (
    <Switch
      label={text.label}
      description={text.help}
      checked={props.value === true}
      onCheckedChange={(checked) => props.onChange(checked)}
    />
  );
}

function NullableEditor(props: FieldEditorProps & { node: Extract<FieldNode, { kind: 'nullable' }> }) {
  const env = useEnv();
  const { node, value, onChange } = props;
  const inner = node.inner;
  const text = textFor(env.commandType, props.parentName, props.field.name);
  const invalid = env.showErrors && env.errors[props.path] !== undefined;
  // A yes-or-no that may stay unset reads as three choices: leave it, yes, or no.
  if (inner.kind === 'boolean') {
    const current = value === true ? 'yes' : value === false ? 'no' : 'unset';
    return (
      <div className={styles.triState}>
        <span className={styles.triLabel} id={`${props.path}-label`}>
          {text.label}
        </span>
        <SegmentedControl
          size="sm"
          aria-label={text.label}
          value={current}
          onValueChange={(next) => onChange(next === 'yes' ? true : next === 'no' ? false : undefined)}
          options={[
            { value: 'unset', label: 'As is', tooltip: 'Leave this unchanged' },
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
        />
      </div>
    );
  }
  // A simple value that may stay unset: an empty control means unset.
  if (inner.kind === 'string' || inner.kind === 'integer' || inner.kind === 'number') {
    return <GenericEditor {...props} field={{ ...props.field, node: inner, required: false }} />;
  }
  if (inner.kind === 'enum') {
    return (
      <Labelled props={props}>
        <EnumSelect
          fieldName={props.field.name}
          options={inner.options}
          value={value}
          onChange={onChange}
          allowUnset
          invalid={invalid}
        />
      </Labelled>
    );
  }
  const set = value !== undefined && value !== null;
  return (
    <div className={styles.optionalGroup}>
      <Checkbox
        label={text.label}
        description={text.help}
        checked={set}
        onCheckedChange={(checked) => onChange(checked ? emptyValue(inner) : undefined)}
      />
      {set && <GenericEditor {...props} field={{ ...props.field, node: inner, required: true }} />}
    </div>
  );
}

function Group({
  props,
  children,
  actions,
}: {
  props: FieldEditorProps;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const env = useEnv();
  const text = textFor(env.commandType, props.parentName, props.field.name);
  const error = env.showErrors ? env.errors[props.path] : undefined;
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>
        {text.label}
        {props.field.required && (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        )}
      </legend>
      {actions && <div className={styles.groupActions}>{actions}</div>}
      <p className={styles.groupHint}>{text.help}</p>
      {children}
      {error && <p className={styles.fieldError}>{error}</p>}
    </fieldset>
  );
}

/** An optional nested value starts folded behind an "add" button, so a long form stays short. */
function AddOptional({ props, node }: { props: FieldEditorProps; node: FieldNode }) {
  const env = useEnv();
  const text = textFor(env.commandType, props.parentName, props.field.name);
  return (
    <div className={styles.addOptional}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon="plus"
        tooltip={`Add ${text.label.toLowerCase()} to this command`}
        onClick={() => props.onChange(emptyValue(node))}
      >
        {text.label}
      </Button>
      <span className={styles.muted}>Optional</span>
    </div>
  );
}

function RemoveOptional({ props }: { props: FieldEditorProps }) {
  const env = useEnv();
  const text = textFor(env.commandType, props.parentName, props.field.name);
  if (props.field.required) return null;
  return (
    <IconButton
      type="button"
      size="sm"
      variant="ghost"
      icon="close"
      label={`Leave out ${text.label.toLowerCase()}`}
      onClick={() => props.onChange(undefined)}
    />
  );
}

function ObjectEditor(props: FieldEditorProps & { node: Extract<FieldNode, { kind: 'object' }> }) {
  const { node, value } = props;
  if (!props.field.required && value === undefined) return <AddOptional props={props} node={node} />;
  const values = isRecord(value) ? value : {};
  return (
    <Group props={props} actions={<RemoveOptional props={props} />}>
      <FieldList
        fields={node.fields}
        values={values}
        onValuesChange={props.onChange}
        path={props.path}
        parentName={props.field.name}
        depth={props.depth + 1}
      />
    </Group>
  );
}

function MapEditor(props: FieldEditorProps & { node: Extract<FieldNode, { kind: 'map' }> }) {
  const { node, value } = props;
  if (node.keys === null) return <JsonEditor {...props} />;
  if (!props.field.required && value === undefined) return <AddOptional props={props} node={node} />;
  const values = isRecord(value) ? value : {};
  const abilities = node.keys.every((k) => ['str', 'int', 'wis', 'dex', 'con', 'cha'].includes(k));
  return (
    <Group props={props} actions={<RemoveOptional props={props} />}>
      <div className={styles.keyGrid}>
        {node.keys.map((key) => (
          <FieldEditor
            key={key}
            field={{ name: key, node: node.value, required: true, hasDefault: false }}
            path={joinPath(props.path, key)}
            value={values[key]}
            onChange={(next) => props.onChange({ ...values, [key]: next })}
            parent={values}
            onParentChange={(patch) => props.onChange({ ...values, ...patch })}
            parentName={abilities ? '__abilities' : props.field.name}
            depth={props.depth + 1}
          />
        ))}
      </div>
    </Group>
  );
}

function ArrayEditor(props: FieldEditorProps & { node: Extract<FieldNode, { kind: 'array' }> }) {
  const { node, value } = props;
  const env = useEnv();
  const text = textFor(env.commandType, props.parentName, props.field.name);
  const items = Array.isArray(value) ? value : [];
  if (!props.field.required && value === undefined) return <AddOptional props={props} node={node} />;
  const singular = text.label.replace(/s$/, '').toLowerCase();
  return (
    <Group props={props} actions={<RemoveOptional props={props} />}>
      {items.length === 0 && <p className={styles.muted}>None yet.</p>}
      <ol className={styles.arrayList}>
        {items.map((item, index) => (
          <li key={index} className={styles.arrayItem}>
            <div className={styles.arrayBody}>
              <FieldEditor
                field={{ name: props.field.name, node: node.items, required: true, hasDefault: false }}
                path={joinPath(props.path, index)}
                value={item}
                onChange={(next) => props.onChange(items.map((old, i) => (i === index ? next : old)))}
                parent={props.parent}
                onParentChange={props.onParentChange}
                parentName={props.field.name}
                depth={props.depth + 1}
              />
            </div>
            <IconButton
              type="button"
              size="sm"
              variant="ghost"
              icon="trash"
              label={`Remove ${singular} ${index + 1}`}
              onClick={() => props.onChange(items.filter((_, i) => i !== index))}
            />
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        icon="plus"
        disabled={node.maxItems !== undefined && items.length >= node.maxItems}
        disabledReason={
          node.maxItems === undefined
            ? null
            : `This command takes at most ${node.maxItems} ${node.maxItems === 1 ? singular : text.label.toLowerCase()}.`
        }
        onClick={() => props.onChange([...items, emptyValue(node.items)])}
      >
        Add {singular}
      </Button>
    </Group>
  );
}

function TupleEditor(props: FieldEditorProps & { node: Extract<FieldNode, { kind: 'tuple' }> }) {
  const { node, value } = props;
  const env = useEnv();
  const items = Array.isArray(value) ? value : node.items.map(() => undefined);
  const isCell = props.field.name === 'position' && node.items.length === 2;
  const names = isCell ? ['x', 'y'] : node.items.map((_, i) => `${props.field.name}_${i + 1}`);
  return (
    <Group props={props}>
      <div className={styles.inlineRow}>
        {node.items.map((itemNode, index) => {
          const name = names[index] ?? String(index);
          const label = isCell ? commandFieldText(env.commandType, name).label : `Part ${index + 1}`;
          return (
            <div key={index} className={styles.inlineCell}>
              <FieldEditor
                field={{ name, node: itemNode, required: true, hasDefault: false }}
                path={joinPath(props.path, index)}
                value={items[index]}
                onChange={(next) => props.onChange(items.map((old, i) => (i === index ? next : old)))}
                parent={{}}
                onParentChange={() => {}}
                parentName={isCell ? null : `__tuple:${label}`}
                depth={props.depth + 1}
              />
            </div>
          );
        })}
      </div>
    </Group>
  );
}

function variantLabel(node: FieldNode): string {
  switch (node.kind) {
    case 'string':
      return 'Text';
    case 'integer':
      return 'Whole number';
    case 'number':
      return 'Number';
    case 'boolean':
      return 'True or false';
    case 'enum':
      return 'Choice';
    case 'object':
      return node.title ? prettifyId(node.title) : 'Details';
    case 'array':
      return 'List';
    default:
      return 'Other';
  }
}

function UnionEditor(props: FieldEditorProps & { node: Extract<FieldNode, { kind: 'union' }> }) {
  const { node, value, onChange } = props;
  const env = useEnv();
  const text = textFor(env.commandType, props.parentName, props.field.name);
  const index = unionVariantIndex(node, value);
  const variant = node.variants[index] ?? node.variants[0];
  const labels = node.variants.map(variantLabel);
  return (
    <div className={styles.union}>
      <div className={styles.triState}>
        <span className={styles.triLabel}>{text.label}: kind of value</span>
        <SegmentedControl
          size="sm"
          aria-label={`${text.label}: kind of value`}
          value={String(index)}
          onValueChange={(next) => {
            const chosen = node.variants[Number(next)];
            if (chosen) onChange(emptyValue(chosen));
          }}
          options={labels.map((label, i) => ({ value: String(i), label }))}
        />
      </div>
      {variant && (
        <GenericEditor
          {...props}
          field={{ ...props.field, node: variant }}
          value={value === undefined ? emptyValue(variant) : value}
        />
      )}
    </div>
  );
}

/** Edits any value as JSON text, for a part of a schema too irregular for a form. */
function JsonEditor(props: FieldEditorProps) {
  const env = useEnv();
  const { value, onChange, path } = props;
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)));
  const setExtraError = env.setExtraError;
  useEffect(() => () => setExtraError(path, null), [setExtraError, path]);
  return (
    <Labelled props={props} aside="JSON">
      <Textarea
        rows={4}
        className={styles.code}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          if (next.trim() === '') {
            setExtraError(path, null);
            onChange(undefined);
            return;
          }
          try {
            onChange(JSON.parse(next) as FormValue);
            setExtraError(path, null);
          } catch {
            setExtraError(path, 'Enter valid JSON.');
          }
        }}
      />
    </Labelled>
  );
}

// Purpose-built editors ---------------------------------------------------------------------------------------

const COIN_KEYS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;

/** Five coin counts in a row. */
export function CoinsEditor(props: FieldEditorProps) {
  const env = useEnv();
  const values = isRecord(props.value) ? props.value : {};
  return (
    <Group props={props}>
      <div className={styles.coinRow}>
        {COIN_KEYS.map((key) => {
          const text = COIN_FIELD_TEXT[key] ?? { label: key, help: '' };
          const error = env.showErrors ? env.errors[joinPath(props.path, key)] : undefined;
          return (
            <Field key={key} label={key} hint={undefined} error={error} className={styles.coinField}>
              <NumberInput
                aria-label={text.label}
                value={typeof values[key] === 'number' ? (values[key] as number) : 0}
                min={0}
                onChange={(next) => props.onChange({ ...values, [key]: next ?? 0 })}
              />
            </Field>
          );
        })}
      </div>
    </Group>
  );
}

/** Town, or a dungeon cell picked on the map, with a facing. */
function LocationEditor(props: FieldEditorProps) {
  const env = useEnv();
  const values = isRecord(props.value) ? props.value : { kind: 'town' };
  const kind = values.kind === 'dungeon' ? 'dungeon' : 'town';
  const adventure = env.data.adventure;
  const position = Array.isArray(values.position) ? values.position : [];
  const set = (patch: Values) => props.onChange({ ...values, ...patch });
  const facingOptions = ['north', 'east', 'south', 'west'];
  const err = (key: string) => (env.showErrors ? env.errors[joinPath(props.path, key)] : undefined);
  return (
    <Group props={props}>
      <SegmentedControl
        aria-label="Place"
        value={kind}
        onValueChange={(next) =>
          props.onChange(
            next === 'town'
              ? { kind: 'town' }
              : {
                  kind: 'dungeon',
                  dungeon_id: adventure?.dungeons[0]?.id,
                  level_number: 1,
                  position: [undefined, undefined],
                  facing: 'north',
                },
          )
        }
        options={[
          {
            value: 'town',
            label: env.data.ctx.townName ? `Town: ${env.data.ctx.townName}` : 'Town',
            icon: 'town',
          },
          { value: 'dungeon', label: 'Dungeon cell', icon: 'map' },
        ]}
      />
      {kind === 'dungeon' && (
        <div className={styles.fields}>
          <div className={styles.pickRow}>
            <MapPickButton
              kind="cell"
              prompt="Pick the cell to place the party on. Click it, or use the arrow keys and press Enter."
              onPick={(target) =>
                set({
                  dungeon_id: target.dungeon_id,
                  level_number: target.level_number,
                  position: [target.x, target.y],
                })
              }
            />
          </div>
          <Field label="Dungeon" error={err('dungeon_id')}>
            <DungeonPicker
              value={str(values.dungeon_id)}
              adventure={adventure}
              onChange={(v) => set({ dungeon_id: v ?? undefined })}
            />
          </Field>
          <div className={styles.inlineRow}>
            <Field label="Level" error={err('level_number')} className={styles.inlineCell}>
              <NumberInput
                value={typeof values.level_number === 'number' ? values.level_number : null}
                min={1}
                onChange={(v) => set({ level_number: v ?? undefined })}
              />
            </Field>
            <Field label="Column" error={err('position.0')} className={styles.inlineCell}>
              <NumberInput
                value={typeof position[0] === 'number' ? position[0] : null}
                min={0}
                onChange={(v) => set({ position: [v ?? undefined, position[1]] })}
              />
            </Field>
            <Field label="Row" error={err('position.1')} className={styles.inlineCell}>
              <NumberInput
                value={typeof position[1] === 'number' ? position[1] : null}
                min={0}
                onChange={(v) => set({ position: [position[0], v ?? undefined] })}
              />
            </Field>
          </div>
          <Field label="Facing" error={err('facing')}>
            <EnumSelect
              fieldName="facing"
              options={facingOptions}
              value={values.facing}
              onChange={(v) => set({ facing: v })}
              allowUnset={false}
            />
          </Field>
        </div>
      )}
    </Group>
  );
}

/** A flag name, with the flags the adventure and play already use one click away. */
function FlagKeyEditor(props: FieldEditorProps) {
  const env = useEnv();
  const known = useMemo(() => knownFlagKeys(env.data), [env.data]);
  const uses = useMemo(
    () =>
      env.data.adventure ? flagUses(env.data.adventure, env.data.ctx) : new Map<string, readonly string[]>(),
    [env.data.adventure, env.data.ctx],
  );
  const value = typeof props.value === 'string' ? props.value : '';
  return (
    <Labelled props={props}>
      <TextInput value={value} onChange={(e) => props.onChange(optionalString(e.target.value, true))} />
      {known.length > 0 && (
        <div className={styles.suggestions} aria-label="Flags in this adventure">
          {known.slice(0, 12).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={key === value}
              tooltip={flagUseTooltip(uses, key)}
              onClick={() => props.onChange(key)}
            >
              {key}
            </Button>
          ))}
        </div>
      )}
    </Labelled>
  );
}

/** Every flag name that play has set or that the adventure reads or writes. */
export function knownFlagKeys(data: RefereeData): string[] {
  const keys = new Set<string>(Object.keys(data.state?.flags ?? {}));
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (isRecord(value)) {
      const kind = value.condition_type ?? value.pattern_type ?? value.command_type;
      if (
        (kind === 'flag_equals' || kind === 'flag_set' || kind === 'set_flag') &&
        typeof value.key === 'string'
      ) {
        keys.add(value.key);
      }
      Object.values(value).forEach(visit);
    }
  };
  if (data.adventure) {
    visit(data.adventure.triggers);
    visit(data.adventure.quests);
    for (const dungeon of data.adventure.dungeons) {
      for (const level of dungeon.levels) visit(level.edges);
    }
  }
  return [...keys].sort();
}

function AreaEditor(props: FieldEditorProps) {
  const env = useEnv();
  const options = useAreaOptions(env.data.adventure);
  const value = str(props.value);
  const current = options.find((o) => o.value.endsWith(`:${value ?? ''}`))?.value ?? null;
  return (
    <Labelled props={props}>
      <Combobox
        options={options}
        value={current}
        onChange={(next) => props.onChange(next ? next.split(':').pop() : undefined)}
        placeholder="Search areas"
      />
    </Labelled>
  );
}

/**
 * The character for `add_member`: one of the referee's stored characters, which fills the sheet, and the
 * sheet itself folded below for a referee who wants to change it.
 */
function CharacterEditor(props: FieldEditorProps) {
  const env = useEnv();
  const mine = useMyCharacters();
  const [chosen, setChosen] = useState<string | null>(null);
  const stored = useStoredCharacter(chosen);
  const [editing, setEditing] = useState(false);
  const selectId = useId();
  const node = props.field.node;
  const onChange = props.onChange;
  const sheet = stored.data?.character;
  // Fill the sheet once for each character the referee picks. The parent's `onChange` is a new function on
  // every render, so it lives in a ref rather than in the effect's dependencies.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const applied = useRef<unknown>(null);
  useEffect(() => {
    if (!sheet || applied.current === sheet) return;
    applied.current = sheet;
    const { id: _id, ...rest } = sheet;
    onChangeRef.current(rest);
  }, [sheet]);
  const error = env.showErrors ? errorsUnder(env.errors, props.path) : 0;
  const options = (mine.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    description: `Level ${c.level} ${classLabel(c.class_id)}`,
  }));
  return (
    <div className={styles.fields}>
      <Field
        label="Stored character"
        hint="Choose one of your stored characters, or create one from the lobby or home page."
        id={selectId}
        error={error > 0 && !isRecord(props.value) ? 'Choose a character.' : undefined}
      >
        <Select
          id={selectId}
          options={options}
          value={chosen ?? undefined}
          placeholder={
            mine.loading
              ? 'Loading characters…'
              : options.length === 0
                ? 'No stored characters'
                : 'Choose a character'
          }
          onValueChange={setChosen}
        />
      </Field>
      {isRecord(props.value) && (
        <p className={styles.muted}>
          {String(props.value.name ?? 'The character')}, level {String(props.value.level ?? 1)},{' '}
          {String(props.value.current_hp ?? '?')} of {String(props.value.max_hp ?? '?')} hit points.
        </p>
      )}
      {node.kind === 'object' && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={editing ? 'chevron-up' : 'chevron-down'}
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Hide sheet' : 'Edit sheet'}
            {error > 0 ? ` (${error} to fix)` : ''}
          </Button>
          {editing && (
            <FieldList
              fields={node.fields}
              values={isRecord(props.value) ? props.value : {}}
              onValuesChange={onChange}
              path={props.path}
              parentName="character"
              depth={props.depth + 1}
              hidden={new Set(['id'])}
            />
          )}
        </>
      )}
    </div>
  );
}
