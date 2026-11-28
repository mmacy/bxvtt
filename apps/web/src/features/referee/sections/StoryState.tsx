/**
 * The story state: every quest with every objective (hidden ones too) and its controls, the session flags, and
 * the adventure's triggers with what each one does and whether it has fired.
 */
import type { TextContext } from '@bxvtt/shared/text';
import { useMemo, useState } from 'react';
import { useParty } from '@/app';
import { Accordion, Badge, Button, EmptyState, Icon, IconButton, SectionLabel, Select, Skeleton } from '@/ui';
import {
  type Adventure,
  type CharacterSheet,
  type Consequence,
  type ObjectiveSpec,
  type QuestSpec,
  type TriggerSpec,
} from '../model/adventure';
import {
  asClause,
  clauseText,
  conditionText,
  consequenceText,
  flagPhrase,
  flagUses,
  patternText,
} from '../model/describe';
import { carriedItems, questStatusLabel } from '../pickers';
import { IdMark } from '../details';
import { CommandOutcome, useRefereeCommand } from '../RefereeCommand';
import { knownFlagKeys } from '../schema/fields';
import { CommandForm } from '../schema/CommandForm';
import type { RefereeData } from '../useReferee';
import styles from './sections.module.css';

type QuestStates = NonNullable<RefereeData['state']>['quests'];

function ObjectiveRow({
  quest,
  objective,
  state,
  questActive,
  ctx,
  adventure,
}: {
  quest: QuestSpec;
  objective: ObjectiveSpec;
  state: { revealed: boolean; complete: boolean } | undefined;
  questActive: boolean;
  ctx: TextContext;
  adventure: Adventure;
}) {
  const { run, busy, outcome, clear } = useRefereeCommand();
  const revealed = state?.revealed ?? !objective.hidden;
  const complete = state?.complete ?? false;
  const send = (type: 'reveal_objective' | 'complete_objective') =>
    run({ command_type: type, quest_id: quest.id, objective_id: objective.id });
  return (
    <li className={styles.objective} data-complete={complete || undefined}>
      <div className={styles.rowHead}>
        <Icon
          name={complete ? 'success' : revealed ? 'eye' : 'eye-off'}
          size={16}
          className={complete ? styles.goodIcon : styles.rowIcon}
        />
        <span className={styles.rowTitle}>{objective.name}</span>
        {complete ? (
          <Badge tone="success">Complete</Badge>
        ) : revealed ? (
          <Badge tone="info">Revealed</Badge>
        ) : (
          <Badge tone="referee">Hidden</Badge>
        )}
      </div>
      <p className={styles.secondaryLine}>
        <strong>Done when: </strong>
        {asClause(clauseText(objective.when, ctx, adventure))}
      </p>
      {!revealed && objective.reveal_when && (
        <p className={styles.secondaryLine}>
          <strong>Shown when: </strong>
          {asClause(clauseText(objective.reveal_when, ctx, adventure))}
        </p>
      )}
      {questActive && !complete && (
        <div className={styles.rowActions}>
          {!revealed && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              tooltip="Show this objective to the players"
              onClick={() => send('reveal_objective')}
            >
              Reveal
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => send('complete_objective')}>
            Mark complete
          </Button>
        </div>
      )}
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </li>
  );
}

const EVERYONE = '__everyone__';

/**
 * One quest reward with the commands to give it. A reward written for the party names its receiver with a
 * selector (`@party`, `@first`, or `@carrier`), because the adventure can't know member IDs. The row starts
 * with the member the selector points at and lets the referee choose another.
 */
function RewardRow({
  questId,
  reward,
  ctx,
  adventure,
  sheets,
}: {
  questId: string;
  reward: Consequence;
  ctx: TextContext;
  adventure: Adventure;
  sheets: readonly CharacterSheet[];
}) {
  const party = useParty();
  const fields = reward as unknown as Record<string, unknown> & { command_type: string };
  const selector = typeof fields.character_id === 'string' ? fields.character_id : null;
  const standing = party.filter((m) => m.current_hp > 0);
  const initial = useMemo(() => {
    if (selector === '@party') return EVERYONE;
    if (selector === '@carrier' && typeof fields.item_id === 'string') {
      const itemId = fields.item_id;
      const carrier = sheets.find((sheet) => carriedItems(sheet, ctx).some((item) => item.id === itemId));
      return carrier?.id ?? null;
    }
    if (selector === '@first') return standing[0]?.id ?? null;
    return selector;
  }, [selector, fields.item_id, sheets, ctx, standing]);
  const [who, setWho] = useState<string | null>(null);
  const target = who ?? initial;
  const { runAll, busy, outcome, clear } = useRefereeCommand();
  const nobodyStanding = selector !== null && target === EVERYONE && standing.length === 0;
  const give = () => {
    const { source: _source, ...rest } = fields;
    const base = { ...rest, source: `quest:${questId}` };
    if (selector === null) return void runAll([base]);
    const ids = target === EVERYONE ? standing.map((m) => m.id) : target ? [target] : [];
    if (ids.length > 0) void runAll(ids.map((id) => ({ ...base, character_id: id })));
  };
  return (
    <li className={styles.reward}>
      <span className={styles.prose}>{consequenceText(reward, ctx, adventure)}</span>
      <div className={styles.inlineForm}>
        {selector !== null && (
          <Select
            size="sm"
            aria-label={`Who receives: ${consequenceText(reward, ctx, adventure)}`}
            value={target ?? undefined}
            placeholder="Choose a member"
            onValueChange={setWho}
            options={[
              ...(selector === '@party' ? [{ value: EVERYONE, label: 'Every living member' }] : []),
              ...party.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
        )}
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || (selector !== null && !target) || nobodyStanding}
          disabledReason={
            nobodyStanding
              ? 'No one in the party is alive.'
              : selector !== null && !target
                ? 'Choose who receives this reward.'
                : null
          }
          onClick={give}
        >
          Give
        </Button>
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </li>
  );
}

function QuestBody({
  quest,
  states,
  ctx,
  adventure,
  sheets,
}: {
  quest: QuestSpec;
  states: QuestStates;
  ctx: TextContext;
  adventure: Adventure;
  sheets: readonly CharacterSheet[];
}) {
  const state = states[quest.id];
  const status = state?.status ?? 'inactive';
  const { run, busy, outcome, clear } = useRefereeCommand();
  const narrative = quest.narrative;
  const done = quest.objectives.filter((o) => state?.objectives[o.id]?.complete).length;
  // The game completes a quest from its own rules. When the referee marks the objectives done instead, the
  // quest waits for the referee to complete it, so the panel says so.
  const ready =
    status === 'active' &&
    quest.objectives.length > 0 &&
    (quest.completion === 'any' ? done > 0 : done === quest.objectives.length);
  return (
    <div className={styles.questBody}>
      {narrative?.offer && (
        <figure className={styles.offer}>
          <blockquote className={styles.quote}>{narrative.offer}</blockquote>
          {narrative.speaker && <figcaption className={styles.secondary}>{narrative.speaker}</figcaption>}
        </figure>
      )}
      {quest.activation && status === 'inactive' && (
        <p className={styles.secondaryLine}>
          <strong>Starts when: </strong>
          {asClause(clauseText(quest.activation, ctx, adventure))}
        </p>
      )}
      <ul className={styles.objectiveList} aria-label="Objectives">
        {quest.objectives.map((objective) => (
          <ObjectiveRow
            key={objective.id}
            quest={quest}
            objective={objective}
            state={state?.objectives[objective.id]}
            questActive={status === 'active'}
            ctx={ctx}
            adventure={adventure}
          />
        ))}
      </ul>
      <p className={styles.secondaryLine}>
        {quest.completion === 'any'
          ? 'Completes when any objective is done.'
          : 'Completes when every objective is done.'}
        {quest.concludes_adventure ? ' Completing it ends the adventure.' : ''}
      </p>
      {quest.rewards.length > 0 && (
        <div className={styles.rewards}>
          <h5 className={styles.minorHead}>Rewards</h5>
          <p className={styles.secondaryLine}>
            Completing a quest doesn't grant rewards automatically. Grant each reward below when the party
            earns it.
          </p>
          <ul className={styles.rewardList}>
            {quest.rewards.map((reward, index) => (
              <RewardRow
                key={index}
                questId={quest.id}
                reward={reward}
                ctx={ctx}
                adventure={adventure}
                sheets={sheets}
              />
            ))}
          </ul>
        </div>
      )}
      {ready && (
        <p className={styles.readyLine}>
          {quest.completion === 'any' ? 'An objective is done.' : 'Every objective is done.'} Mark the quest
          complete{quest.concludes_adventure ? ' to end the adventure' : ''}, then grant its rewards.
        </p>
      )}
      <div className={styles.rowActions}>
        {status === 'inactive' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => run({ command_type: 'activate_quest', quest_id: quest.id })}
          >
            Activate quest
          </Button>
        )}
        {status === 'active' && (
          <Button
            size="sm"
            variant={ready ? 'primary' : 'secondary'}
            disabled={busy}
            onClick={() => run({ command_type: 'complete_quest', quest_id: quest.id })}
          >
            Complete quest
          </Button>
        )}
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

const STATUS_TONE = { inactive: 'neutral', active: 'info', completed: 'success' } as const;

function Quests({ data, adventure }: { data: RefereeData; adventure: Adventure }) {
  const states = data.state?.quests ?? {};
  if (adventure.quests.length === 0)
    return <p className={styles.secondaryLine}>This adventure has no quests.</p>;
  return (
    <Accordion
      type="multiple"
      defaultValue={adventure.quests.filter((q) => states[q.id]?.status === 'active').map((q) => q.id)}
      items={adventure.quests.map((quest) => {
        const state = states[quest.id];
        const status = state?.status ?? 'inactive';
        const hidden = quest.objectives.filter(
          (o) => !(state?.objectives[o.id]?.revealed ?? !o.hidden),
        ).length;
        const done = quest.objectives.filter((o) => state?.objectives[o.id]?.complete).length;
        return {
          value: quest.id,
          title: quest.name,
          meta: (
            <span className={styles.metaRow}>
              <span className={styles.num}>
                {done}/{quest.objectives.length}
              </span>
              {hidden > 0 && <Badge tone="referee">{hidden} hidden</Badge>}
              <Badge tone={STATUS_TONE[status]}>{questStatusLabel(status)}</Badge>
            </span>
          ),
          content: (
            <QuestBody
              quest={quest}
              states={states}
              ctx={data.ctx}
              adventure={adventure}
              sheets={data.state?.party.members ?? []}
            />
          ),
        };
      })}
    />
  );
}

function flagText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function Flags({ data }: { data: RefereeData }) {
  const flags = data.state?.flags ?? {};
  const known = useMemo(() => knownFlagKeys(data), [data]);
  const uses = useMemo(
    () => (data.adventure ? flagUses(data.adventure, data.ctx) : new Map<string, string[]>()),
    [data.adventure, data.ctx],
  );
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className={styles.form}>
      {known.length === 0 ? (
        <p className={styles.secondaryLine}>
          No flags yet. Adventure triggers and gates can depend on the flags you set.
        </p>
      ) : (
        <ul className={styles.flagList} aria-label="Flags">
          {known.map((key) => {
            const set = Object.hasOwn(flags, key);
            return (
              <li key={key} className={styles.flagRow}>
                <div className={styles.flagLine}>
                  <div className={styles.flagText}>
                    <span className={styles.flagUse}>
                      {uses.get(key)?.[0] ??
                        `“${key}”: set during play. No trigger, quest, or gate in this adventure checks it.`}
                    </span>
                    {(uses.get(key)?.length ?? 0) > 1 && (
                      <span className={styles.secondary}>{uses.get(key)?.slice(1).join(' ')}</span>
                    )}
                    {uses.has(key) && <IdMark className={styles.idMark}>{key}</IdMark>}
                  </div>
                  {set ? (
                    <span className={styles.flagValue}>{flagText(flags[key])}</span>
                  ) : (
                    <span className={styles.secondary}>Not set</span>
                  )}
                  <IconButton
                    icon="edit"
                    size="sm"
                    variant="ghost"
                    label={`Change ${uses.has(key) ? flagPhrase(key, data.ctx, data.adventure) : `the flag “${key}”`}`}
                    pressed={editing === key}
                    onClick={() => setEditing(editing === key ? null : key)}
                  />
                </div>
                {editing === key && (
                  <CommandForm
                    commandType="set_flag"
                    fixed={{ key }}
                    initial={set ? { value: flags[key] } : { value: '' }}
                    submitLabel="Set flag"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <CommandForm commandType="set_flag" submitLabel="Set flag" initial={{ value: '' }} />
      ) : (
        <Button size="sm" variant="ghost" icon="plus" onClick={() => setAdding(true)}>
          Set new flag
        </Button>
      )}
    </div>
  );
}

function TriggerRow({
  trigger,
  fired,
  ctx,
  adventure,
}: {
  trigger: TriggerSpec;
  fired: boolean;
  ctx: TextContext;
  adventure: Adventure;
}) {
  const { run, busy, outcome, clear } = useRefereeCommand();
  const narrative = trigger.narrative;
  return (
    <div className={styles.questBody}>
      <p className={styles.prose}>
        <strong>When: </strong>
        {asClause(patternText(trigger.when, ctx, adventure))}
        {trigger.conditions.length > 0
          ? `, while ${trigger.conditions.map((c) => conditionText(c, ctx, adventure)).join(' and ')}`
          : ''}
        .{trigger.repeatable ? ' Fires every time.' : ' Fires once.'}
      </p>
      {trigger.consequences.length > 0 && (
        <div>
          <h5 className={styles.minorHead}>Then</h5>
          <ul className={styles.bullets}>
            {trigger.consequences.map((c, index) => (
              <li key={index}>{consequenceText(c, ctx, adventure)}</li>
            ))}
          </ul>
        </div>
      )}
      {narrative?.fired && (
        <div>
          <h5 className={styles.minorHead}>For you</h5>
          <p className={styles.guidance}>{narrative.fired}</p>
        </div>
      )}
      {narrative?.journal && (
        <div>
          <h5 className={styles.minorHead}>Journal entry for players</h5>
          <p className={styles.quote}>{narrative.journal}</p>
        </div>
      )}
      <div className={styles.rowActions}>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || (fired && !trigger.repeatable)}
          disabledReason={
            fired && !trigger.repeatable ? 'This trigger fires only once, and it has already fired.' : null
          }
          onClick={() => run({ command_type: 'mark_trigger_fired', trigger_id: trigger.id })}
        >
          {fired && !trigger.repeatable ? 'Already fired' : 'Mark fired'}
        </Button>
        <span className={styles.secondary}>Marks the trigger as fired without running its consequences.</span>
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

function Triggers({ data, adventure }: { data: RefereeData; adventure: Adventure }) {
  const fired = data.state?.fired_triggers ?? [];
  const extra = fired.filter((id) => !adventure.triggers.some((t) => t.id === id));
  if (adventure.triggers.length === 0 && extra.length === 0) {
    return <p className={styles.secondaryLine}>This adventure has no triggers.</p>;
  }
  return (
    <>
      <Accordion
        type="multiple"
        items={adventure.triggers.map((trigger) => {
          const hasFired = fired.includes(trigger.id);
          return {
            value: trigger.id,
            title: (
              <span className={styles.triggerTitle}>
                {patternText(trigger.when, data.ctx, adventure)}
                <IdMark className={styles.idMark}>{trigger.id}</IdMark>
              </span>
            ),
            meta: <Badge tone={hasFired ? 'success' : 'neutral'}>{hasFired ? 'Fired' : 'Waiting'}</Badge>,
            content: <TriggerRow trigger={trigger} fired={hasFired} ctx={data.ctx} adventure={adventure} />,
          };
        })}
      />
      {extra.length > 0 && (
        <p className={styles.secondaryLine}>
          Marked fired from outside this adventure:{' '}
          {extra.map((id, index) => (
            <span key={id}>
              {index > 0 ? ', ' : ''}
              <span className={styles.quoted}>“{id}”</span>
            </span>
          ))}
        </p>
      )}
    </>
  );
}

/** Quests, flags, and triggers. */
export function StoryState({ data }: { data: RefereeData }) {
  const adventure = data.adventure;
  if (!data.state) return null;
  if (!adventure) {
    if (data.adventureError)
      return (
        <EmptyState
          icon="warning"
          size="compact"
          title="Couldn't load adventure"
          description={data.adventureError.detail}
        />
      );
    return <Skeleton lines={6} />;
  }
  return (
    <div className={styles.section}>
      <section aria-label="Quests">
        <SectionLabel level={3}>Quests</SectionLabel>
        <Quests data={data} adventure={adventure} />
      </section>
      <section aria-label="Flags">
        <SectionLabel level={3}>Flags</SectionLabel>
        <Flags data={data} />
      </section>
      <section aria-label="Triggers">
        <SectionLabel level={3}>Triggers</SectionLabel>
        <Triggers data={data} adventure={adventure} />
      </section>
    </div>
  );
}
