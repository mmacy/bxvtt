/**
 * The encounter under way, as the referee sees it: each group with its distance and whether it flees, and each
 * monster with its hit points and conditions. The quick way to end the encounter sits beside it.
 */
import type { RefereeState } from '@bxvtt/shared/protocol';
import {
  conditionLabel,
  formatDurationRounds,
  formatFeet,
  stanceDescription,
  stanceLabel,
} from '@bxvtt/shared/text';
import { useState } from 'react';
import { Badge, Button, ConditionChip, HpBar, Icon, RadioGroup, SectionLabel, toast } from '@/ui';
import type { Adventure, MonsterInstance } from '../model/adventure';
import { templateLabel } from '../model/describe';
import { CommandOutcome, useRefereeCommand } from '../RefereeCommand';
import { useCommandReason } from '../useCommandReason';
import styles from './sections.module.css';

type EncounterState = NonNullable<RefereeState['encounter']>;
type Npc = RefereeState['npcs'][number];

function MonsterLine({
  name,
  current,
  max,
  conditions,
  clock,
  expiries,
}: {
  name: string;
  current: number;
  max: number;
  conditions: MonsterInstance['conditions'];
  clock: number;
  expiries: ReadonlyMap<string, number>;
}) {
  const down = current <= 0;
  return (
    <li className={styles.monster} data-down={down || undefined}>
      <div className={styles.monsterHead}>
        <span className={styles.monsterName}>{name}</span>
        <span className={styles.hpText}>
          {current} / {max}
          <span className="visually-hidden"> hit points</span>
        </span>
      </div>
      <HpBar
        current={Math.max(0, current)}
        max={max}
        label={`${name}, hit points`}
        size="sm"
        showValue={false}
      />
      {conditions.length > 0 && (
        <div className={styles.tags}>
          {conditions.map((c, index) => {
            const expires = c.effect_id ? expiries.get(c.effect_id) : undefined;
            return (
              <ConditionChip
                key={index}
                label={conditionLabel(c.condition)}
                tone="harm"
                duration={
                  expires !== undefined ? formatDurationRounds(Math.max(0, expires - clock)) : undefined
                }
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

/** One way the encounter can end, as `end_encounter` takes it. */
const ENDINGS = [
  {
    value: 'terms',
    label: 'Came to terms (mark area resolved)',
    description: "Ends peacefully. These monsters won't appear again when the party returns.",
    command: { outcome: 'parley', resolve_area: true },
  },
  {
    value: 'parley',
    label: 'Temporary truce',
    description: 'The monsters let the party pass for now, but remain in this area.',
    command: { outcome: 'parley', resolve_area: false },
  },
  {
    value: 'departed',
    label: 'Broke off',
    description: 'One side walked away or ended a pursuit. The monsters remain in this area.',
    command: { outcome: 'departed', resolve_area: false },
  },
] as const;

/** A short form for `end_encounter` with the three endings a referee means. */
export function EndEncounterForm() {
  const { available, reason } = useCommandReason('end_encounter');
  const [ending, setEnding] = useState<string>('terms');
  const { run, busy, outcome, clear } = useRefereeCommand();
  const chosen = ENDINGS.find((e) => e.value === ending) ?? ENDINGS[0];
  return (
    <div className={styles.form}>
      <RadioGroup
        aria-label="How the encounter ends"
        value={ending}
        onValueChange={setEnding}
        options={ENDINGS.map((e) => ({ value: e.value, label: e.label, description: e.description }))}
      />
      <div className={styles.rowActions}>
        <Button
          size="sm"
          variant="primary"
          loading={busy}
          disabled={!available}
          disabledReason={reason}
          onClick={async () => {
            // The encounter view closes with the encounter, so the confirmation goes to a toast as well.
            if (await run({ command_type: 'end_encounter', ...chosen.command })) {
              toast.success('Encounter ended', { description: chosen.label });
            }
          }}
        >
          End encounter
        </Button>
        {reason !== null && <span className={styles.secondary}>{reason}</span>}
      </div>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

/** The open encounter's groups and monsters, with an ending form. */
export function EncounterNow({
  encounter,
  state,
  adventure,
}: {
  encounter: EncounterState;
  state: RefereeState;
  adventure: Adventure | null;
}) {
  const monsters = new Map(state.monsters.map((m) => [m.id, m]));
  const npcs = new Map<string, Npc>(state.npcs.flatMap((n) => (n.id ? [[n.id, n] as [string, Npc]] : [])));
  const battle = state.battle;
  const clock = state.clock_rounds;
  const expiries = new Map<string, number>(
    state.ledger.effects.flatMap((e) =>
      e.expires_round !== null && e.expires_round !== undefined
        ? [[e.effect_id, e.expires_round] as [string, number]]
        : [],
    ),
  );
  return (
    <div className={styles.encounter}>
      <div className={styles.tags}>
        {encounter.stance && (
          <Badge tone={encounter.stance === 'attacks' || encounter.stance === 'hostile' ? 'danger' : 'info'}>
            {stanceLabel(encounter.stance)}
          </Badge>
        )}
        {battle && <Badge tone="danger">Battle, round {battle.round}</Badge>}
        {encounter.party_surprised && <Badge tone="warning">Party surprised</Badge>}
        {encounter.monsters_surprised && <Badge tone="success">Monsters surprised</Badge>}
        {encounter.evading && <Badge tone="warning">Party evading</Badge>}
        {encounter.pursuit && <Badge tone="warning">Pursuit</Badge>}
      </div>
      {encounter.stance && <p className={styles.secondaryLine}>{stanceDescription(encounter.stance)}</p>}
      {encounter.groups.map((group) => {
        const alive = group.monster_ids.filter(
          (id) => (monsters.get(id)?.current_hp ?? npcs.get(id)?.current_hp ?? 1) > 0,
        );
        return (
          <section key={group.id} className={styles.group} aria-label={`${group.label_plural}`}>
            <div className={styles.rowHead}>
              <Icon name="skull" size={16} className={styles.dangerIcon} />
              <span className={styles.rowTitle}>
                {alive.length} of {group.monster_ids.length}{' '}
                {group.monster_ids.length === 1 ? group.label : group.label_plural}
              </span>
              <span className={styles.secondary}>{formatFeet(group.distance_feet)} away</span>
              {group.fled ? (
                <Badge tone="neutral">Escaped</Badge>
              ) : group.fleeing ? (
                <Badge tone="warning">Fleeing</Badge>
              ) : null}
            </div>
            <ul className={styles.monsterList}>
              {group.monster_ids.map((id, index) => {
                const monster = monsters.get(id);
                if (monster) {
                  return (
                    <MonsterLine
                      key={id}
                      name={`${capital(templateLabel(monster.template.id, adventure))} ${index + 1}`}
                      current={monster.current_hp}
                      max={monster.max_hp}
                      conditions={monster.conditions}
                      clock={clock}
                      expiries={expiries}
                    />
                  );
                }
                const npc = npcs.get(id);
                if (npc) {
                  return (
                    <MonsterLine
                      key={id}
                      name={npc.name}
                      current={npc.current_hp}
                      max={npc.max_hp}
                      conditions={npc.conditions ?? []}
                      clock={clock}
                      expiries={expiries}
                    />
                  );
                }
                return null;
              })}
            </ul>
          </section>
        );
      })}
      <SectionLabel level={4}>End encounter</SectionLabel>
      <EndEncounterForm />
    </div>
  );
}

function capital(text: string): string {
  return text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;
}
