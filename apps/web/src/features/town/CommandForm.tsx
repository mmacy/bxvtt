/**
 * A small form for any town command that has no custom control. It builds its fields from the command's schema
 * with the text layer's field labels, so a command that bxapi adds to town is still reachable. Choices that name
 * people, items, and spells show their names, never their IDs.
 */
import { commandFieldOptionLabel, commandFieldText, commandInfo, describeEvents } from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import { useCommandSchema, useParty, useSendCommand, useSpellCatalog, useTextContext } from '@/app';
import {
  Banner,
  Button,
  Combobox,
  Field,
  IconButton,
  NumberInput,
  Select,
  Skeleton,
  Switch,
  TextInput,
  Textarea,
} from '@/ui';
import { buildCommand, missingRequired, readFields, type FieldSpec, type FieldValue } from './schemaForm';
import { readInventory } from './inventory';
import { useShoppers } from './hooks';
import styles from './CommandForm.module.css';

const COIN_ORDER = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;
const COIN_NAMES: Record<(typeof COIN_ORDER)[number], string> = {
  pp: 'Platinum',
  gp: 'Gold',
  ep: 'Electrum',
  sp: 'Silver',
  cp: 'Copper',
};

export function CommandForm({ commandType }: { commandType: string }) {
  const schema = useCommandSchema(commandType);
  const party = useParty();
  const shoppers = useShoppers();
  const spells = useSpellCatalog();
  const ctx = useTextContext();
  const { send, pending } = useSendCommand();
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'warning'; text: string[] } | null>(null);

  const fields = useMemo(() => (schema.data ? readFields(schema.data.json_schema) : []), [schema.data]);
  const info = commandInfo(commandType);
  const set = (name: string, value: FieldValue) => setValues((previous) => ({ ...previous, [name]: value }));

  const actorId = typeof values.character_id === 'string' ? values.character_id : null;
  const actor = party.find((member) => member.id === actorId) ?? null;
  const actorItems = actor
    ? readInventory(actor).items.filter((item) => item.itemType !== 'magic_item' || item.id)
    : [];

  const submit = async () => {
    setOutcome(null);
    const built = buildCommand(commandType, fields, values);
    if ('error' in built) {
      setOutcome({ tone: 'warning', text: [built.error] });
      return;
    }
    const result = await send(built.command, { display: 'inline' });
    if (result.status === 'accepted') {
      const lines = describeEvents(result.result.events, ctx, {
        messages: result.result.messages,
        only: 'player',
      });
      setOutcome({ tone: 'success', text: lines.length > 0 ? lines.map((line) => line.text) : ['Done.'] });
    } else if (result.status === 'refused' || result.status === 'error' || result.status === 'skipped') {
      setOutcome({ tone: 'warning', text: [result.message] });
    }
  };

  const control = (field: FieldSpec) => {
    const text = commandFieldText(commandType, field.name);
    const value = values[field.name];
    if (field.name === 'character_id' || field.name === 'recipient_id') {
      const choices = field.name === 'character_id' ? shoppers : party;
      return (
        <Select
          value={typeof value === 'string' ? value : undefined}
          onValueChange={(next) => set(field.name, next)}
          placeholder="Choose a character"
          options={choices.map((member) => ({ value: member.id, label: member.name }))}
        />
      );
    }
    if (field.name === 'item_id') {
      return (
        <Select
          value={typeof value === 'string' ? value : undefined}
          onValueChange={(next) => set(field.name, next)}
          disabled={actor === null}
          placeholder={actor === null ? 'Choose a character first' : 'Choose an item'}
          options={actorItems.map((item) => ({ value: item.id, label: item.name }))}
        />
      );
    }
    if (field.name === 'item_ids' && field.kind === 'list') {
      const chosen = Array.isArray(value) ? value : [];
      return actor === null ? (
        <p className={styles.note}>Choose a character first.</p>
      ) : (
        <ul className={styles.items}>
          {actorItems.map((item) => {
            const count = chosen.filter((id) => id === item.id).length;
            return (
              <li key={`${item.id}-${item.name}`} className={styles.itemRow}>
                <span>{item.name}</span>
                <NumberInput
                  value={count}
                  min={0}
                  max={item.quantity}
                  aria-label={`How many ${item.name} to hand over`}
                  onChange={(next) =>
                    set(field.name, [
                      ...chosen.filter((id) => id !== item.id),
                      ...Array.from({ length: next ?? 0 }, () => item.id),
                    ])
                  }
                />
              </li>
            );
          })}
        </ul>
      );
    }
    if (field.name === 'spell_id') {
      return (
        <Combobox
          value={typeof value === 'string' ? value : null}
          onChange={(next) => set(field.name, next)}
          placeholder={spells.loading ? 'Loading spells' : 'Search for a spell'}
          options={(spells.data ?? []).map((spell) => ({
            value: spell.id,
            label: spell.name,
            description: `Level ${spell.level}`,
          }))}
        />
      );
    }
    if (field.name === 'order') {
      const order = Array.isArray(value) ? value : party.map((member) => member.id);
      const move = (index: number, by: -1 | 1) => {
        const next = [...order];
        const target = index + by;
        const [item] = next.splice(index, 1);
        if (item === undefined || target < 0 || target > next.length) return;
        next.splice(target, 0, item);
        set(field.name, next);
      };
      return (
        <ol className={styles.order}>
          {order.map((id, index) => (
            <li key={id} className={styles.orderRow}>
              <span className={styles.rank}>{index + 1}</span>
              <span className={styles.orderName}>
                {party.find((member) => member.id === id)?.name ?? 'A character'}
              </span>
              <IconButton
                icon="arrow-up"
                label={`Move ${party.find((m) => m.id === id)?.name ?? 'character'} forward`}
                size="sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              />
              <IconButton
                icon="arrow-down"
                label={`Move ${party.find((m) => m.id === id)?.name ?? 'character'} back`}
                size="sm"
                disabled={index === order.length - 1}
                onClick={() => move(index, 1)}
              />
            </li>
          ))}
        </ol>
      );
    }
    switch (field.kind) {
      case 'enum':
        return (
          <Select
            value={typeof value === 'string' ? value : undefined}
            onValueChange={(next) => set(field.name, next)}
            placeholder="Choose"
            options={field.options.map((option) => ({
              value: option,
              label: commandFieldOptionLabel(commandType, field.name, option),
            }))}
          />
        );
      case 'integer':
        return (
          <NumberInput
            value={typeof value === 'number' ? value : null}
            onChange={(next) => set(field.name, next)}
            aria-label={text.label}
          />
        );
      case 'boolean':
        return (
          <Switch
            checked={value === true}
            onCheckedChange={(next) => set(field.name, next)}
            label={text.label}
          />
        );
      case 'coins': {
        const coins = (value as Record<string, number> | undefined) ?? {};
        return (
          <div className={styles.coins}>
            {COIN_ORDER.map((coin) => (
              <Field key={coin} label={COIN_NAMES[coin]}>
                <NumberInput
                  value={coins[coin] ?? 0}
                  min={0}
                  onChange={(next) => set(field.name, { ...coins, [coin]: next ?? 0 })}
                />
              </Field>
            ))}
          </div>
        );
      }
      case 'list':
        return (
          <Textarea
            rows={3}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => set(field.name, event.target.value)}
            placeholder="One entry on each line"
          />
        );
      case 'json':
        return (
          <Textarea
            rows={4}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => set(field.name, event.target.value)}
            placeholder="Enter this as JSON"
          />
        );
      default:
        return (
          <TextInput
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => set(field.name, event.target.value)}
          />
        );
    }
  };

  if (schema.loading) return <Skeleton lines={3} />;
  if (schema.error)
    return (
      <Banner
        tone="warning"
        title="This form didn't load"
        actions={
          <Button size="sm" variant="secondary" onClick={schema.retry}>
            Try again
          </Button>
        }
      >
        {schema.error.detail}
      </Banner>
    );

  const missing = missingRequired(fields, values);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className={styles.description}>{info.description}</p>
      {fields.map((field) => {
        const text = commandFieldText(commandType, field.name);
        if (field.kind === 'boolean') {
          return (
            <Field key={field.name} label={text.label} hint={text.help}>
              {control(field)}
            </Field>
          );
        }
        return (
          <Field key={field.name} label={text.label} hint={text.help} required={field.required}>
            {control(field)}
          </Field>
        );
      })}
      {outcome !== null && (
        <Banner tone={outcome.tone}>
          {outcome.text.map((line) => (
            <span key={line} className={styles.line}>
              {line}
            </span>
          ))}
        </Banner>
      )}
      <div>
        <Button type="submit" variant="secondary" loading={pending} disabled={missing.length > 0}>
          {info.button}
        </Button>
      </div>
    </form>
  );
}
