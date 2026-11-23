/**
 * What walking into an area does that placing the party there skips. osrlib runs an area's arrival (its keyed
 * monsters, its triggers, and the quest steps that watch for it) only when the party walks in, so a referee who
 * places the party gets these as one-click follow-ups. Each one sends the commands the adventure wrote.
 */
import type { TextContext } from '@bxvtt/shared/text';
import { useParty, type GameCommand } from '@/app';
import { Button } from '@/ui';
import {
  findLevel,
  areaRef,
  type Adventure,
  type AreaSpec,
  type CharacterSheet,
  type KeyedEncounter,
  type TriggerClause,
  type TriggerSpec,
} from '../model/adventure';
import { areaInSentence, encounterText, patternText } from '../model/describe';
import { carriedItems } from '../pickers';
import { CommandOutcome, useRefereeCommand } from '../RefereeCommand';
import { useCommandReason } from '../useCommandReason';
import type { RefereeData } from '../useReferee';
import styles from './sections.module.css';

/** How far away the keyed monsters appear when the referee spawns them. */
const SPAWN_FEET = 20;

/** The spawn commands for an area's keyed monsters, one per group, as the key writes them. */
export function keyedSpawns(encounter: KeyedEncounter): GameCommand[] {
  return encounter.monsters.map((m) => {
    const command: GameCommand = {
      command_type: 'spawn_monsters',
      template_id: m.template_id,
      distance_feet: SPAWN_FEET,
    };
    if (m.count_fixed !== null && m.count_fixed !== undefined) command.count_fixed = m.count_fixed;
    else if (m.count_dice) command.count_dice = m.count_dice;
    else command.count_fixed = 1;
    return command;
  });
}

type Party = ReturnType<typeof useParty>;

/**
 * An adventure command with a party selector (`@party`, `@first`, `@carrier`) made into commands for members.
 * A selector names who the interpreter would choose; the referee's panel chooses the same members.
 */
export function forMembers(
  command: Record<string, unknown> & { command_type: string },
  party: Party,
  sheets: readonly CharacterSheet[],
  ctx: TextContext,
): GameCommand[] {
  const selector = command.character_id;
  const standing = party.filter((m) => m.current_hp > 0);
  if (selector === '@party') return standing.map((m) => ({ ...command, character_id: m.id }));
  if (selector === '@first') return standing[0] ? [{ ...command, character_id: standing[0].id }] : [];
  if (selector === '@carrier') {
    const itemId = command.item_id;
    const carrier = sheets.find((sheet) => carriedItems(sheet, ctx).some((item) => item.id === itemId));
    return carrier?.id ? [{ ...command, character_id: carrier.id }] : [];
  }
  return [command];
}

/** The commands that firing a trigger by hand sends: what it does, its journal line, and the record that it fired. */
export function triggerCommands(
  trigger: TriggerSpec,
  party: Party,
  sheets: readonly CharacterSheet[],
  ctx: TextContext,
): GameCommand[] {
  const source = `trigger:${trigger.id}`;
  const commands: GameCommand[] = trigger.consequences.flatMap((c) =>
    forMembers(
      { ...(c as unknown as Record<string, unknown> & { command_type: string }), source },
      party,
      sheets,
      ctx,
    ),
  );
  const journal = trigger.narrative?.journal;
  if (journal) commands.push({ command_type: 'add_journal_entry', text: journal, source });
  const fired: GameCommand = { command_type: 'mark_trigger_fired', trigger_id: trigger.id };
  if (trigger.narrative?.fired) fired.narrative = trigger.narrative.fired;
  commands.push(fired);
  return commands;
}

/** A button that spawns an area's keyed monsters. */
export function SpawnKeyedButton({
  encounter,
  adventure,
}: {
  encounter: KeyedEncounter;
  adventure: Adventure;
}) {
  const { available, reason } = useCommandReason('spawn_monsters');
  const { runAll, busy, outcome, clear } = useRefereeCommand();
  return (
    <div className={styles.followUp}>
      <Button
        size="sm"
        variant="secondary"
        icon="skull"
        disabled={busy || !available}
        disabledReason={reason}
        onClick={() => void runAll(keyedSpawns(encounter))}
      >
        Spawn {encounterText(encounter, adventure)}
      </Button>
      <span className={styles.secondary}>
        {available ? `${SPAWN_FEET} feet away. Ending their encounter won't mark the area resolved.` : reason}
      </span>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

/** A button that fires a trigger by hand: it sends what the trigger does and records that it fired. */
export function RunTriggerButton({ trigger, data }: { trigger: TriggerSpec; data: RefereeData }) {
  const party = useParty();
  const { runAll, busy, outcome, clear } = useRefereeCommand();
  const fired = data.state?.fired_triggers.includes(trigger.id) ?? false;
  if (fired && !trigger.repeatable) return null;
  return (
    <div className={styles.followUp}>
      <Button
        size="sm"
        variant="secondary"
        icon="flag"
        disabled={busy}
        onClick={() =>
          void runAll(triggerCommands(trigger, party, data.state?.party.members ?? [], data.ctx))
        }
      >
        Fire trigger
      </Button>
      <span className={styles.secondary}>Applies the trigger consequences and marks it fired.</span>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

function entersArea(
  clause: TriggerClause | null | undefined,
  dungeonId: string,
  levelNumber: number,
  areaId: string,
) {
  const p = clause?.pattern;
  return (
    p?.pattern_type === 'area_entered' &&
    p.dungeon_id === dungeonId &&
    p.level_number === levelNumber &&
    p.area_id === areaId &&
    (clause?.conditions ?? []).length === 0
  );
}

/** One quest step that entering the area would take. */
function QuestStep({ command, label }: { command: GameCommand; label: string }) {
  const { run, busy, outcome, clear } = useRefereeCommand();
  return (
    <div className={styles.followUp}>
      <Button size="sm" variant="secondary" icon="flag" disabled={busy} onClick={() => void run(command)}>
        {label}
      </Button>
      <CommandOutcome outcome={outcome} onDismiss={clear} />
    </div>
  );
}

/** Every follow-up for an area the party was placed in. */
export function ArrivalFollowUps({
  data,
  dungeonId,
  levelNumber,
  area,
}: {
  data: RefereeData;
  dungeonId: string;
  levelNumber: number;
  area: AreaSpec;
}) {
  const adventure = data.adventure;
  const record = data.record;
  if (!adventure || !record) return null;
  const level = findLevel(adventure, dungeonId, levelNumber);
  if (!level) return null;
  const encounter = area.encounter;
  const resolved = record.resolvedEncounters.has(areaRef(dungeonId, levelNumber, area.id));
  const triggers = adventure.triggers.filter(
    (t) =>
      t.when.pattern_type === 'area_entered' &&
      t.when.area_id === area.id &&
      t.when.level_number === levelNumber &&
      t.when.dungeon_id === dungeonId,
  );
  const quests = data.state?.quests ?? {};
  const steps: Array<{ key: string; command: GameCommand; label: string }> = [];
  for (const quest of adventure.quests) {
    const state = quests[quest.id];
    const status = state?.status ?? 'inactive';
    if (status === 'inactive' && entersArea(quest.activation, dungeonId, levelNumber, area.id)) {
      steps.push({
        key: `a:${quest.id}`,
        command: { command_type: 'activate_quest', quest_id: quest.id },
        label: `Start “${quest.name}”`,
      });
    }
    if (status !== 'active') continue;
    for (const objective of quest.objectives) {
      const o = state?.objectives[objective.id];
      if (!o?.revealed && entersArea(objective.reveal_when, dungeonId, levelNumber, area.id)) {
        steps.push({
          key: `r:${objective.id}`,
          command: { command_type: 'reveal_objective', quest_id: quest.id, objective_id: objective.id },
          label: `Reveal “${objective.name}”`,
        });
      }
      if (!o?.complete && entersArea(objective.when, dungeonId, levelNumber, area.id)) {
        steps.push({
          key: `c:${objective.id}`,
          command: { command_type: 'complete_objective', quest_id: quest.id, objective_id: objective.id },
          label: `Complete “${objective.name}”`,
        });
      }
    }
  }
  const hasMonsters = encounter !== null && encounter !== undefined && !resolved;
  const nothing = !hasMonsters && triggers.length === 0 && steps.length === 0;
  return (
    <div className={styles.arrival} role="group" aria-label="Arrival actions">
      <p className={styles.prose}>
        The party is in {areaInSentence(area.name)}.{' '}
        {nothing
          ? 'Entering normally triggers nothing else here.'
          : 'Placing the party skips room-entry effects. Run any you want now:'}
      </p>
      {hasMonsters && encounter && <SpawnKeyedButton encounter={encounter} adventure={adventure} />}
      {triggers.map((t) => (
        <div key={t.id} className={styles.followUpGroup}>
          <span className={styles.secondary}>
            {t.narrative?.fired ?? patternText(t.when, data.ctx, adventure)}
          </span>
          <RunTriggerButton trigger={t} data={data} />
        </div>
      ))}
      {steps.map((step) => (
        <QuestStep key={step.key} command={step.command} label={step.label} />
      ))}
    </div>
  );
}
