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

/** The events and messages of an entry that the reader should see. A referee with the lens off sees what players see. */
export function visibleEvents(
  entry: GameEntry,
  lens: boolean,
): { events: GameEntry['events']; messages: string[] } {
  if (lens) return { events: entry.events, messages: entry.messages };
  const events: GameEntry['events'] = [];
  const messages: string[] = [];
  entry.events.forEach((event, index) => {
    if ((event as { visibility?: string }).visibility === 'referee') return;
    events.push(event);
    const message = entry.messages[index];
    if (message !== undefined) messages.push(message);
  });
  return { events, messages };
}

/** Drops a line that repeats an earlier line of the same entry, keeping the copy players can see. */
function dropRepeats(lines: EventLine[]): EventLine[] {
  const kept: EventLine[] = [];
  const byText = new Map<string, number>();
  for (const line of lines) {
    const seen = byText.get(line.text);
    if (seen === undefined) {
      byText.set(line.text, kept.length);
      kept.push(line);
      continue;
    }
    const earlier = kept[seen];
    if (earlier && earlier.visibility === 'referee' && line.visibility === 'player') kept[seen] = line;
  }
  return kept;
}

const ROUND = /^Round (\d+) begins\.$/;
const STEP = /^The party moves to \(-?\d+, -?\d+\), (facing [^.]+)\.(.*)$/s;
const DOOR_CELL = /^Door cell \(-?\d+, -?\d+\), side \w+\.$/;

/**
 * Takes map coordinates out of a line. The text layer names the cell a party steps to and the cell of a door,
 * which reads like a log rather than a referee, and the map already shows where the party is.
 */
export function withoutCoordinates(line: EventLine): EventLine {
  let next = line;
  const step = STEP.exec(line.text);
  if (step) next = { ...next, text: `The party moves one step, ${step[1]}.${step[2] ?? ''}` };
  if (next.detail !== undefined && DOOR_CELL.test(next.detail)) {
    const { detail: _detail, ...rest } = next;
    next = rest;
  }
  return next;
}

/**
 * Describes a game entry for the feed.
 *
 * @param entry - The game entry.
 * @param ctx - The text context from `useTextContext`.
 * @param options - `lens` is whether the reader is a referee with the lens on.
 */
export function narrateEntry(entry: GameEntry, ctx: TextContext, options: { lens: boolean }): Narration {
  const { events, messages } = visibleEvents(entry, options.lens);
  const described = dropRepeats(describeEvents(events, ctx, { messages }));
  let headline: string | null = null;
  const lines: NarratedLine[] = [];
  described.forEach((line, index) => {
    const round = ROUND.exec(line.text);
    if (round && headline === null) {
      headline = `Round ${round[1]}`;
      return;
    }
    lines.push({ ...withoutCoordinates(line), key: `${entry.seq}-${index}`, weight: lineWeight(line, ctx) });
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
  const { events } = visibleEvents(entry, lens);
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

/** A sentence for a run of party movement: "The party moves 6 times and turns once, and now faces west." */
export function movementRunText(steps: readonly PartyStep[]): string {
  const moves = steps.filter((step) => !step.turned).length;
  const turns = steps.length - moves;
  const last = steps.at(-1);
  const parts: string[] = [];
  if (moves > 0) parts.push(moves === 1 ? 'moves one step' : `moves ${moves} steps`);
  if (turns > 0) parts.push(turns === 1 ? 'turns once' : `turns ${turns} times`);
  const action = parts.length > 0 ? parts.join(' and ') : 'stays where it is';
  const facing = last && last.facing !== '' ? `, ${facingLabel(last.facing)}` : '';
  return `The party ${action}${facing}.`;
}
