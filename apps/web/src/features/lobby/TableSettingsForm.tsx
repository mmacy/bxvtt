import { LIMITS, type UpdateTableRequest } from '@bxvtt/shared/protocol';
import { useState, type FormEvent } from 'react';
import {
  displayStringProblem,
  getApi,
  useApiAction,
  useIsReferee,
  useTableDetail,
  useTableStoreApi,
} from '@/app';
import { Button, Field, RadioGroup, Select, Switch, TextInput } from '@/ui';
import styles from './lobby.module.css';

const NO_CALLER = 'none';

/**
 * The table's settings: who controls the party, the caller, automatic round resolution, and autosave. A
 * referee changes them, and each change applies at once. A player sees them read-only. The lobby and the play
 * screen's settings dialog both render it.
 *
 * @param props.showName - Also shows the table name field, for the settings dialog.
 */
export function TableSettingsForm({ showName = false }: { showName?: boolean }) {
  const table = useTableDetail();
  const referee = useIsReferee();
  const store = useTableStoreApi();
  const { run, pending } = useApiAction();
  const [name, setName] = useState(table?.name ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  if (table === null) return null;
  const settings = table.settings;
  const readOnly = !referee;

  const update = async (body: UpdateTableRequest, success?: string) => {
    const result = await run(() => getApi().updateTable(table.id, body), {
      success,
      errorTitle: "Couldn't update table settings",
    });
    if (result.ok) store.getState().receiveTable(result.value);
  };

  const rename = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === table.name) return;
    const invalid = displayStringProblem(trimmed, LIMITS.tableName);
    setNameError(invalid);
    if (invalid === null) void update({ name: trimmed }, 'Table renamed');
  };

  const callerOptions = [
    { value: NO_CALLER, label: 'No caller' },
    ...table.members.map((member) => ({ value: member.user_id, label: member.name })),
  ];

  return (
    <div className={styles.settings}>
      {showName && (
        <form className={styles.renameRow} onSubmit={rename}>
          <Field
            label="Table name"
            disabled={readOnly}
            error={nameError ?? undefined}
            className={styles.grow}
          >
            <TextInput
              value={name}
              maxLength={LIMITS.tableName}
              readOnly={readOnly}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {!readOnly && (
            <Button
              type="submit"
              variant="secondary"
              disabled={name.trim() === '' || name.trim() === table.name}
              disabledReason={
                name.trim() === '' ? 'Enter a table name.' : 'Type a new name for the table first.'
              }
            >
              Rename
            </Button>
          )}
        </form>
      )}

      <fieldset className={styles.fieldset} disabled={readOnly || pending}>
        <legend className={styles.legend}>Who moves the party</legend>
        <RadioGroup
          aria-label="Who moves the party"
          value={settings.party_control}
          disabled={readOnly}
          onValueChange={(value) => {
            if (value === 'caller' || value === 'anyone') void update({ settings: { party_control: value } });
          }}
          options={[
            {
              value: 'caller',
              label: 'The caller',
              description:
                'One designated player speaks for the party and controls movement, doors, and searches.',
            },
            {
              value: 'anyone',
              label: 'Anyone with a character',
              description:
                'Any seated player can move the party, which works well for small or casual groups.',
            },
          ]}
        />
      </fieldset>

      <Field
        label="Caller"
        hint="If no caller is chosen before the game starts, the player with the character in rank 1 becomes the caller."
        disabled={readOnly}
      >
        <Select
          value={settings.caller_user_id ?? NO_CALLER}
          disabled={readOnly || pending}
          options={callerOptions}
          onValueChange={(value) =>
            void update({ settings: { caller_user_id: value === NO_CALLER ? null : value } })
          }
        />
      </Field>

      <Switch
        label="Resolve battle rounds automatically"
        description="Resolve each round as soon as every eligible character declares an action. When off, the caller or referee resolves each round manually."
        checked={settings.auto_resolve}
        disabled={readOnly || pending}
        labelPosition="start"
        onCheckedChange={(checked) => void update({ settings: { auto_resolve: checked } })}
      />
      <Switch
        label="Save automatically"
        description="Save the game automatically when the party enters a dungeon, changes levels, encounters monsters, or returns to town (up to 10 recent autosaves)."
        checked={settings.autosave}
        disabled={readOnly || pending}
        labelPosition="start"
        onCheckedChange={(checked) => void update({ settings: { autosave: checked } })}
      />
      {readOnly && !showName && <p className={styles.note}>Only the referee can change these settings.</p>}
    </div>
  );
}
