/**
 * Turns one game entry into the lines the feed shows: bxapi's events described by the text layer, filtered for
 * the reader, with repeats dropped, each line weighed by how much it matters to the story, and runs of battle
 * movement folded into one expandable line.
 */
import type { GameEntry } from '@bxvtt/shared/protocol';
import { describeEvents, facingLabel, type EventLine, type TextContext } from '@bxvtt/shared/text';

/** How much a line matters: a step down a corridor is `minor`, and a party member's death is `critical`. */
export type LineWeight = 'minor' | 'normal' | 'major' | 'critical';

const WEIGHT_ORDER: Record<LineWeight, number> = { minor: 0, normal: 1, major: 2, critical: 3 };

/** One line of a game entry. */
export interface NarratedLine extends EventLine {
  key: string;
  weight: LineWeight;
}

/** A line, or several lines of battle movement folded into one. */
export type NarrationItem =
  | { kind: 'line'; line: NarratedLine }
  | { kind: 'cluster'; key: string; summary: string; lines: NarratedLine[] };

/** What one game entry says. */
export interface Narration {
  items: NarrationItem[];
  /** A heading for the entry from its events, such as "Round 2" for a battle round. */
  headline: string | null;
  /** The weight of the entry's most important line. */
  weight: LineWeight;
  /** Whether every line is hidden from players. */
  refereeOnly: boolean;
  /** Every line's text, for search. */
  text: string;
}

const MINOR_EVENTS = new Set([
  'party_moved',
  'member_moved',
  'group_moved',
  'initiative_rolled',
  'hit_points_reported',
  'time_advanced',
  'targets_selected',
  'spell_declared',
]);

const MAJOR_EVENTS = new Set([
  'leveled_up',
  'quest_activated',
  'quest_completed',
  'objective_completed',
  'objective_revealed',
  'journal_entry_added',
  'encounter_started',
  'adventure_xp_award',
  'hoard_generated',
  'curse_revealed',
  'level_drained',
]);

const CRITICAL_CODES = new Set(['session.game_over', 'battle.ended.defeat', 'session.adventure.completed']);

/**
 * How much a line matters to the story.
 *
 * @param line - The line.
 * @param ctx - The text context, to tell a party member from a monster.
 */
export function lineWeight(line: EventLine, ctx: TextContext): LineWeight {
  if (CRITICAL_CODES.has(line.code)) return 'critical';
  if (line.eventType === 'death' || (line.eventType === 'condition_gained' && line.code.includes('dead'))) {
    const target = line.actorIds.find((id) => id in ctx.members);
    return target !== undefined ? 'critical' : 'normal';
  }
  if (line.code === 'battle.ended.victory') return 'major';
  if (line.code === 'exploration.trap.sprung') return 'major';
  if (MAJOR_EVENTS.has(line.eventType)) return 'major';
  if (line.category === 'treasure' && line.tone === 'good') return 'major';
  if (line.eventType === 'battle_round') return 'minor';
  if (MINOR_EVENTS.has(line.eventType)) return 'minor';
  if (line.eventType === 'provisions' && line.tone !== 'bad') return 'minor';
  return 'normal';
}

/** The events of an entry that the reader should see. A referee with the lens off sees what players see. */
export function visibleEvents(entry: GameEntry, lens: boolean): GameEntry['events'] {
  if (lens) return entry.events;
  return entry.events.filter((event) => (event as { visibility?: string }).visibility !== 'referee');
}

const ROUND = /^Round (\d+) begins\.$/;

/**
 * Describes a game entry for the feed.
 *
 * @param entry - The game entry.
 * @param ctx - The text context from `useTextContext`.
 * @param options - `lens` is whether the reader is a referee with the lens on.
 */
export function narrateEntry(entry: GameEntry, ctx: TextContext, options: { lens: boolean }): Narration {
  const described = describeEvents(entry.events, ctx, {
    messages: entry.messages,
    ...(options.lens ? {} : { only: 'player' as const }),
  });
  let headline: string | null = null;
  const lines: NarratedLine[] = [];
  described.forEach((line, index) => {
    const round = ROUND.exec(line.text);
    if (round && headline === null) {
      headline = `Round ${round[1]}`;
      return;
    }
    // The cell of a step or a door is for a referee with the lens on.
    const { refereeDetail, ...rest } = line;
    const shown = options.lens && refereeDetail !== undefined ? { ...rest, refereeDetail } : rest;
    lines.push({ ...shown, key: `${entry.seq}-${index}`, weight: lineWeight(line, ctx) });
  });

  const items: NarrationItem[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (line.eventType === 'member_moved' || line.eventType === 'group_moved') {
      let end = index;
      while (end + 1 < lines.length) {
        const next = lines[end + 1];
        if (next?.eventType !== 'member_moved' && next?.eventType !== 'group_moved') break;
        end += 1;
      }
      const run = lines.slice(index, end + 1);
      if (run.length >= 3) {
        items.push({ kind: 'cluster', key: `${line.key}-moves`, summary: movementSummary(run), lines: run });
        index = end;
        continue;
      }
    }
    items.push({ kind: 'line', line });
  }

  const weight = lines.reduce<LineWeight>(
    (max, line) => (WEIGHT_ORDER[line.weight] > WEIGHT_ORDER[max] ? line.weight : max),
    'minor',
  );
  return {
    items,
    headline,
    weight,
    refereeOnly: lines.length > 0 && lines.every((line) => line.visibility === 'referee'),
    text: [headline ?? '', ...lines.map((line) => line.text)].join(' '),
  };
}

function movementSummary(run: readonly NarratedLine[]): string {
  const party = run.filter((line) => line.eventType === 'member_moved').length;
  const monsters = run.length - party;
  const parts: string[] = [];
  if (party > 0) parts.push(party === 1 ? 'one party member moves' : `${party} party members move`);
  if (monsters > 0) parts.push(monsters === 1 ? 'the monsters move' : `the monsters move ${monsters} times`);
  const text = parts.join(', and ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// Movement runs -----------------------------------------------------------------------------------------------

/** One step or turn of the party, from a `party_moved` event. */
export interface PartyStep {
  turned: boolean;
  /** The direction the party faces afterward, such as `north`. */
  facing: string;
}

const MOVE_COMMANDS = new Set(['move_party', 'turn_party']);

/**
 * The steps of an entry when it is nothing but party movement, or `null` when it says anything else. A move that
 * enters an area, sets off a trap, or meets monsters tells part of the story, so it isn't plain movement. A quiet
 * wandering monster check, which only a referee sees, still counts as plain movement.
 *
 * @param entry - The game entry.
 * @param lens - Whether the reader is a referee with the lens on.
 */
export function movementSteps(
  entry: GameEntry,
  lens: boolean,
): { steps: PartyStep[]; checks: number } | null {
  if (entry.command_type === null || !MOVE_COMMANDS.has(entry.command_type)) return null;
  const events = visibleEvents(entry, lens);
  const steps: PartyStep[] = [];
  let checks = 0;
  for (const raw of events) {
    const event = raw as {
      event_type: string;
      code: string;
      facing?: unknown;
      narrative?: unknown;
      encounter?: unknown;
    };
    if (event.event_type === 'party_moved') {
      if (typeof event.narrative === 'string' && event.narrative !== '') return null;
      steps.push({
        turned: event.code === 'exploration.party.turned',
        facing: typeof event.facing === 'string' ? event.facing : '',
      });
      continue;
    }
    if (event.event_type === 'wandering_check' && event.encounter !== true) {
      checks += 1;
      continue;
    }
    return null;
  }
  return { steps, checks };
}

/** A sentence for a run of party movement: "The party moves 6 steps and turns once, facing west." */
export function movementRunText(steps: readonly PartyStep[]): string {
  const moves = steps.filter((step) => !step.turned).length;
  const turns = steps.length - moves;
  const last = steps.at(-1);
  // A single step or turn reads the way the text layer says it.
  if (steps.length === 1 && last !== undefined && last.facing !== '') {
    return last.turned ? `The party turns to face ${last.facing}.` : `The party moves ${last.facing}.`;
  }
  // Steps that all go one way read as a direction: "The party moves 3 steps north."
  const facings = new Set(steps.map((step) => step.facing));
  if (turns === 0 && facings.size === 1 && last !== undefined && last.facing !== '') {
    return `The party moves ${moves} steps ${last.facing}.`;
  }
  const parts: string[] = [];
  if (moves > 0) parts.push(moves === 1 ? 'moves one step' : `moves ${moves} steps`);
  if (turns > 0) parts.push(turns === 1 ? 'turns once' : `turns ${turns} times`);
  const action = parts.length > 0 ? parts.join(' and ') : 'stays where it is';
  const facing = last && last.facing !== '' ? `, ${facingLabel(last.facing)}` : '';
  return `The party ${action}${facing}.`;
}
