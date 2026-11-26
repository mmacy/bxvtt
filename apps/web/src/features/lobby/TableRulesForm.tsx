import type { StartingRulesetId, UpdateTableRequest } from '@bxvtt/shared/protocol';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { getApi, useApiAction, useIsReferee, useTableDetail, useTableStoreApi } from '@/app';
import { Checkbox, ConfirmDialog, Field, NumberInput, Select, Skeleton, Switch, cx, toast } from '@/ui';
import {
  RULES_FOR_PLAY,
  STARTING_RULESET_CONFIRM,
  STARTING_RULESET_NAMES,
  booleanRulePatch,
  matchStartingRuleset,
  selectRulePatch,
} from './rules';
import { useStartingRulesets } from './startingRulesets';
import styles from './lobby.module.css';

/** The settings a rules change sends. */
type RulesChange = NonNullable<UpdateTableRequest['settings']>;

/** How long the rerolls field waits after the last step before it sends the number, in milliseconds. */
const REROLLS_DELAY_MS = 600;

/** The most ability score rerolls a referee can set as a number. */
const MAX_REROLLS = 99;

const STARTING_IDS: readonly StartingRulesetId[] = ['standard', 'creation_house_rules'];

function isStartingId(value: string): value is StartingRulesetId {
  return STARTING_IDS.some((id) => id === value);
}

/**
 * Sends one change of the table's rules, and says so in a toast when the server refuses it. `saving` is true while
 * a change is on its way, so the form can hold its switches until the server answers.
 */
function useRulesUpdate() {
  const table = useTableDetail();
  const store = useTableStoreApi();
  const { run, pending } = useApiAction();
  const tableId = table?.id ?? null;
  const save = async (settings: RulesChange): Promise<boolean> => {
    if (tableId === null) return false;
    const result = await run(() => getApi().updateTable(tableId, { settings }), { display: 'inline' });
    if (result.ok) {
      store.getState().receiveTable(result.value);
      return true;
    }
    const { problem } = result;
    toast.error("Couldn't change the rules", {
      description:
        problem.code === 'validation_error'
          ? 'Reload the page and try again.'
          : `${problem.title}. ${problem.detail}`,
      id: `problem-${problem.code}`,
    });
    return false;
  };
  return { save, saving: pending };
}

/**
 * The ability score rerolls house rule: a number from 0 to 99, or unlimited. The number goes to the server when the
 * field loses focus, when the referee presses Enter, and a moment after the last step, never on each keystroke. A
 * number still waiting when the form closes goes to the server then.
 */
function RerollsField({
  stored,
  readOnly,
  saving,
  onSave,
}: {
  stored: number | null;
  readOnly: boolean;
  /** Whether another rules change is on its way, which holds the Unlimited box. */
  saving: boolean;
  onSave: (value: number | null) => Promise<boolean>;
}) {
  const inputId = useId();
  const hintId = useId();
  // A number the referee chose that isn't stored yet. The field shows the stored number otherwise.
  const [local, setLocal] = useState<number | null>(null);
  // The last number the referee had, so unchecking Unlimited returns to it.
  const [remembered, setRemembered] = useState<number>(stored ?? 0);
  const pending = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });
  const shown = local ?? stored;

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      // A number the referee chose just before the form closed still reaches the table.
      if (pending.current !== null) void saveRef.current(pending.current);
    },
    [],
  );

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
  };

  const flush = () => {
    const value = pending.current;
    cancel();
    if (value === null) return;
    // Success shows the stored number, and a refusal shows the number the table still has. A newer number the
    // referee chose meanwhile stays on screen until it's saved too.
    void saveRef.current(value).then(() => setLocal((current) => (current === value ? null : current)));
  };

  const unlimited = stored === null;
  return (
    <div className={cx(styles.ruleSelect, styles.ruleNumber)}>
      <div>
        <label htmlFor={inputId} className={styles.ruleLabel}>
          Ability score rerolls
        </label>
        <p id={hintId} className={styles.ruleDescription}>
          How many times each player can roll new ability scores for one character.
        </p>
      </div>
      <div
        className={styles.rerollsRow}
        onBlur={(event: FocusEvent<HTMLDivElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget)) flush();
        }}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter') flush();
        }}
      >
        <NumberInput
          id={inputId}
          aria-describedby={hintId}
          value={unlimited ? null : shown}
          min={0}
          max={MAX_REROLLS}
          disabled={readOnly || unlimited}
          decrementLabel="Fewer rerolls"
          incrementLabel="More rerolls"
          maxReason="For more than 99, choose Unlimited."
          onChange={(value) => {
            if (value === null) {
              // An empty field keeps the stored number.
              cancel();
              setLocal(null);
              return;
            }
            setLocal(value);
            setRemembered(value);
            pending.current = value;
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = setTimeout(flush, REROLLS_DELAY_MS);
          }}
        />
        <Checkbox
          label="Unlimited"
          checked={unlimited}
          readOnly={readOnly || saving}
          onCheckedChange={(checked) => {
            cancel();
            setLocal(null);
            if (checked && stored !== null) setRemembered(stored);
            void onSave(checked ? null : remembered);
          }}
        />
      </div>
    </div>
  );
}

/** A section heading with its hint. */
function RulesSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={styles.rulesSection} aria-labelledby={id}>
      <div className={styles.rulesSectionHead}>
        <h3 id={id} className={styles.subTitle}>
          {title}
        </h3>
        {hint !== undefined && <p className={styles.note}>{hint}</p>}
      </div>
      <ul className={styles.ruleList}>{children}</ul>
    </section>
  );
}

/**
 * The rules part of the table's settings: the starting rules, the SRD's optional rules for creating a character,
 * the house rules, and the rules for play. A referee changes them, and each change applies at once. A player sees
 * the same values read-only. The lobby's Rules panel and the Rules tab of the play screen's settings dialog both
 * render it.
 *
 * @param props.showNote - Shows a player the note that only a referee can change the rules, for the lobby. The
 *   dialog's description already says it.
 */
export function TableRulesForm({ showNote = false }: { showNote?: boolean }) {
  const table = useTableDetail();
  const referee = useIsReferee();
  const starting = useStartingRulesets();
  const { save, saving } = useRulesUpdate();
  const [confirm, setConfirm] = useState<StartingRulesetId | null>(null);
  if (table === null) return null;
  const settings = table.settings;
  const ruleset = settings.ruleset;
  const readOnly = !referee;
  // A player reads the switches at full contrast. A referee's switches hold while a change is on its way, so two
  // quick toggles never send overlapping changes. Read-only keeps focus on the switch the referee just pressed.
  const switchesReadOnly = readOnly || saving;
  const matched = starting.items === null ? null : matchStartingRuleset(ruleset, starting.items);

  const apply = (id: StartingRulesetId) => {
    const chosen = starting.items?.find((item) => item.id === id);
    if (chosen !== undefined) void save({ ruleset: chosen.ruleset });
  };

  return (
    <div className={styles.rules}>
      {showNote && readOnly && <p className={styles.note}>Only a referee can change the rules.</p>}
      <Field
        label="Starting rules"
        hint={
          readOnly
            ? undefined
            : 'Choosing one changes every rule below to match it, except sub-par characters and ability score rerolls.'
        }
        error={
          starting.failed ? "Couldn't load the starting rules. Reload the page to try again." : undefined
        }
        disabled={readOnly}
      >
        {starting.items === null && !starting.failed ? (
          <Skeleton shape="block" height={36} />
        ) : (
          <Select
            value={matched ?? ''}
            placeholder={starting.items === null ? undefined : 'Custom'}
            // Custom is the table's state, not an empty choice, so it reads like a value.
            placeholderTone="value"
            disabled={readOnly || starting.items === null}
            options={STARTING_IDS.map((id) => ({ value: id, label: STARTING_RULESET_NAMES[id] }))}
            onValueChange={(value) => {
              if (!isStartingId(value) || value === matched) return;
              // Only a custom table loses changes the referee made, so only that choice asks first.
              if (matched === null) setConfirm(value);
              else apply(value);
            }}
          />
        )}
      </Field>

      <RulesSection title="Optional rules" hint="Optional rules from the SRD for creating a character.">
        <li className={styles.rule}>
          <Switch
            label="Sub-par characters"
            description="A player whose ability scores are very poor can discard the character and start again."
            labelPosition="start"
            readOnly={switchesReadOnly}
            checked={settings.sub_par_restart}
            onCheckedChange={(checked) => void save({ sub_par_restart: checked })}
          />
        </li>
        <li className={styles.rule}>
          <Switch
            label="Hit die reroll"
            description="A first-level character rolls the hit die again whenever it comes up 1 or 2, before adding the Constitution modifier."
            labelPosition="start"
            readOnly={switchesReadOnly}
            checked={ruleset.hp_reroll_at_first_level}
            onCheckedChange={(checked) => void save({ ruleset: { hp_reroll_at_first_level: checked } })}
          />
        </li>
      </RulesSection>

      <RulesSection title="House rules" hint="Rules for creating a character that aren't in the SRD.">
        <li className={styles.rule}>
          <Switch
            label="4d6 drop lowest"
            description="Each ability score is the total of the highest three of four d6, instead of 3d6."
            labelPosition="start"
            readOnly={switchesReadOnly}
            checked={ruleset.ability_score_method === '4d6_drop_lowest'}
            onCheckedChange={(checked) =>
              void save({ ruleset: { ability_score_method: checked ? '4d6_drop_lowest' : '3d6' } })
            }
          />
        </li>
        <li className={styles.rule}>
          <RerollsField
            stored={settings.ability_score_rerolls}
            readOnly={readOnly}
            saving={saving}
            onSave={(value) => save({ ability_score_rerolls: value })}
          />
        </li>
        <li className={styles.rule}>
          <Switch
            label="Maximum hit points"
            description="A first-level character starts with the highest number on the hit die instead of rolling it."
            labelPosition="start"
            readOnly={switchesReadOnly}
            checked={ruleset.max_hp_at_first_level}
            onCheckedChange={(checked) => void save({ ruleset: { max_hp_at_first_level: checked } })}
          />
        </li>
      </RulesSection>

      <RulesSection
        title="Rules for play"
        hint={table.phase === 'playing' ? 'Changes apply to the next new game.' : undefined}
      >
        {RULES_FOR_PLAY.map((rule) => (
          <li key={rule.key} className={styles.rule}>
            {rule.kind === 'boolean' ? (
              <Switch
                label={rule.label}
                description={rule.description}
                labelPosition="start"
                readOnly={switchesReadOnly}
                checked={ruleset[rule.key]}
                onCheckedChange={(checked) => void save({ ruleset: booleanRulePatch(rule, checked) })}
              />
            ) : (
              <div className={styles.ruleSelect}>
                <div>
                  <p className={styles.ruleLabel}>{rule.label}</p>
                  <p className={styles.ruleDescription}>
                    {rule.options.find((option) => option.value === ruleset[rule.key])?.description ??
                      rule.description}
                  </p>
                </div>
                <Select
                  aria-label={rule.label}
                  disabled={readOnly}
                  value={ruleset[rule.key]}
                  options={rule.options.map((option) => ({ value: option.value, label: option.label }))}
                  onValueChange={(value) => {
                    const patch = selectRulePatch(rule, value);
                    if (patch !== null) void save({ ruleset: patch });
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </RulesSection>

      {confirm !== null && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
          title={STARTING_RULESET_CONFIRM[confirm].title}
          description={`This changes every rule to ${STARTING_RULESET_CONFIRM[confirm].inSentence} and discards the changes you made. Sub-par characters and ability score rerolls stay as they are.`}
          confirmLabel={STARTING_RULESET_CONFIRM[confirm].confirm}
          tone="danger"
          onConfirm={() => {
            apply(confirm);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
