/**
 * Turns a resolved round's events into beats for playback, and the battlefield into a state that each beat
 * changes: who moved where, whose hit points fell, who went down.
 *
 * The numbers come from the events (`damage_dealt.amount`, `member_moved.advance_feet`, and so on). Nothing
 * here computes a rule. When playback ends, the board shows the view bxapi sent after the round.
 */
import type { EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import {
  conditionLabel,
  describeEvents,
  extendContextWithEvents,
  idKind,
  type EventIcon,
  type EventLine,
  type LooseEvent,
  type TextContext,
} from '@bxvtt/shared/text';
import type { IconName } from '@/ui';

/** An event as the feed delivers it. Fields are read defensively, because bxapi can add event types. */
export type AnyEvent = LooseEvent;

// The battlefield ----------------------------------------------------------------------------------------------

export interface TrackMember {
  id: string;
  name: string;
  classId: string;
  /** Feet forward of the party line, or `null` for a member with no place, such as the dead. */
  advance: number | null;
  hp: number;
  maxHp: number;
  conditions: string[];
  down: boolean;
}

export interface TrackGroup {
  id: string;
  label: string;
  labelPlural: string;
  distance: number;
  count: number;
  /** Whether the group got away and left the battle. */
  fled: boolean;
  /** Whether the group broke and is running. A fleeing group stays in the battle until it gets away. */
  fleeing: boolean;
  conditions: Record<string, number>;
  categories: string[];
  frontRank: string[];
}

export interface TrackState {
  members: Record<string, TrackMember>;
  memberOrder: string[];
  groups: Record<string, TrackGroup>;
  groupOrder: string[];
}

/** Builds the battlefield from the view. */
export function trackFromView(encounter: EncounterView | null, party: readonly MemberView[]): TrackState {
  const members: Record<string, TrackMember> = {};
  const inBattle = encounter?.in_battle ?? false;
  for (const member of party) {
    const down =
      member.conditions.includes('dead') || member.conditions.includes('petrified') || member.current_hp <= 0;
    const advance = encounter?.advance_feet[member.id];
    members[member.id] = {
      id: member.id,
      name: member.name,
      classId: member.class_id,
      advance: advance ?? (inBattle || down ? null : 0),
      hp: member.current_hp,
      maxHp: member.max_hp,
      conditions: [...member.conditions],
      down,
    };
  }
  const groups: Record<string, TrackGroup> = {};
  for (const group of encounter?.groups ?? []) {
    groups[group.id] = {
      id: group.id,
      label: group.label,
      labelPlural: group.label_plural || group.label,
      distance: group.distance_feet,
      count: group.count,
      fled: group.fled,
      fleeing: group.fleeing,
      conditions: { ...group.condition_counts },
      categories: [...group.categories],
      frontRank: [...group.front_rank],
    };
  }
  return {
    members,
    memberOrder: party.map((m) => m.id),
    groups,
    groupOrder: (encounter?.groups ?? []).map((g) => g.id),
  };
}

/** Finds the group of a monster, or `null` when the client can't tell. */
export type MonsterGroupLookup = (monsterId: string) => string | null;

function str(event: AnyEvent, key: string): string | null {
  const value = event[key];
  return typeof value === 'string' ? value : null;
}

function num(event: AnyEvent, key: string): number | null {
  const value = event[key];
  return typeof value === 'number' ? value : null;
}

/** The token a creature ID lands on: the member itself, or a monster's group. */
export function tokenFor(id: string | null, lookup: MonsterGroupLookup): string | null {
  if (id === null) return null;
  if (idKind(id) === 'character') return id;
  if (idKind(id) === 'group') return id;
  return lookup(id);
}

/** Applies one event to the battlefield. Returns a new state when anything changed. */
export function applyEvent(state: TrackState, event: AnyEvent, lookup: MonsterGroupLookup): TrackState {
  const member = (id: string | null) => (id !== null ? state.members[id] : undefined);
  const withMember = (id: string, patch: Partial<TrackMember>): TrackState => {
    const current = state.members[id];
    return current ? { ...state, members: { ...state.members, [id]: { ...current, ...patch } } } : state;
  };
  const withGroup = (id: string | null, patch: (g: TrackGroup) => Partial<TrackGroup>): TrackState => {
    const current = id !== null ? state.groups[id] : undefined;
    return current && id !== null
      ? { ...state, groups: { ...state.groups, [id]: { ...current, ...patch(current) } } }
      : state;
  };
  switch (event.event_type) {
    case 'member_moved': {
      const id = str(event, 'character_id');
      const advance = num(event, 'advance_feet');
      return id !== null && advance !== null ? withMember(id, { advance }) : state;
    }
    case 'group_moved': {
      const distance = num(event, 'distance_feet');
      return distance !== null ? withGroup(str(event, 'group_id'), () => ({ distance })) : state;
    }
    case 'damage_dealt': {
      const target = str(event, 'target_id');
      const amount = num(event, 'amount') ?? 0;
      const m = member(target);
      return m ? withMember(m.id, { hp: Math.max(0, m.hp - amount) }) : state;
    }
    case 'healing_applied': {
      if (event.code !== 'combat.healing.applied') return state;
      const m = member(str(event, 'target_id'));
      const amount = num(event, 'amount') ?? 0;
      return m ? withMember(m.id, { hp: Math.min(m.maxHp, m.hp + amount) }) : state;
    }
    case 'death': {
      const target = str(event, 'target_id');
      const m = member(target);
      if (m) return withMember(m.id, { down: true, hp: Math.min(m.hp, 0), advance: null });
      return withGroup(tokenFor(target, lookup), (g) => ({ count: Math.max(0, g.count - 1) }));
    }
    case 'condition_gained':
    case 'condition_removed': {
      const target = str(event, 'target_id');
      const condition = str(event, 'condition');
      if (condition === null) return state;
      const gained = event.event_type === 'condition_gained';
      const m = member(target);
      if (m) {
        const conditions = gained
          ? [...new Set([...m.conditions, condition])]
          : m.conditions.filter((c) => c !== condition);
        return withMember(m.id, {
          conditions,
          down: m.down || (gained && (condition === 'dead' || condition === 'petrified')),
        });
      }
      // A group's dead are counted off its size, not listed as a condition.
      if (condition === 'dead') return state;
      return withGroup(tokenFor(target, lookup), (g) => {
        const count = Math.max(0, (g.conditions[condition] ?? 0) + (gained ? 1 : -1));
        const conditions = { ...g.conditions };
        if (count === 0) delete conditions[condition];
        else conditions[condition] = count;
        return { conditions };
      });
    }
    case 'monster_fled':
      // The group breaks and runs, but stays in the battle until a `monster_escaped` takes it off the track.
      return withGroup(str(event, 'group_id'), () => ({ fleeing: true }));
    case 'monster_escaped':
      return withGroup(str(event, 'group_id'), () => ({ fleeing: true, fled: true }));
    default:
      return state;
  }
}

// Beats --------------------------------------------------------------------------------------------------------

/** Something to float over a token for a moment. */
export interface Pop {
  tokenId: string;
  kind: 'damage' | 'heal' | 'miss' | 'death' | 'condition' | 'hide';
  text: string;
}

/** One step of a round's playback. */
export interface Beat {
  index: number;
  events: AnyEvent[];
  lines: EventLine[];
  durationMs: number;
  pops: Pop[];
  /** The tokens this beat is about, actor first. */
  focus: string[];
  /** An attack roll to show on a die. */
  roll: { natural: number; modifier: number; total: number; hit: boolean } | null;
  /** Whether every event in the beat is referee-only. */
  referee: boolean;
}

/** Bookkeeping events that stay in the feed and out of the playback. */
const QUIET_EVENTS = new Set([
  'effect_attached',
  'effect_expired',
  'effect_released',
  'effect_ticked',
  'time_advanced',
  'hit_points_reported',
  'targets_selected',
  'light',
  'provisions',
  'flag_set',
  'note_recorded',
  'monsters_spawned',
  'wandering_check',
  'hoard_generated',
  'dice_rolled',
]);

/** Events that follow a spell, a turning, or an item use and belong to its beat. */
const FOLLOW_ON = new Set([
  'saving_throw_rolled',
  'condition_gained',
  'condition_removed',
  'damage_dealt',
  'damage_absorbed',
  'healing_applied',
  'item_identified',
  'item_consumed',
]);

/** Events that start a beat and gather what follows them. */
const LEADERS = new Set(['spell_cast', 'undead_turned', 'item_used', 'magic_dispelled']);

/** Event types that run together into one beat when they come in a row. */
const RUNS = new Set([
  'member_moved',
  'group_moved',
  'monster_defeated',
  'xp_awarded',
  'condition_gained',
  'condition_removed',
  'saving_throw_rolled',
  'member_withdrew',
]);

/**
 * How long a beat stays on screen at normal speed. A beat lasts long enough to read what it says: a moment to
 * find the strip and take in the die, then reading time in proportion to the text, within a floor and a ceiling.
 * A beat that changes the fight holds a little longer, so a death or a spell lands before the next attack.
 */
export const PACE = {
  /** Time to look at the strip and take in the die or the icon, before reading. */
  settleMs: 500,
  /** Reading time for each character of text on the strip: about 40 characters a second. */
  perCharMs: 24,
  /** The shortest and the longest a beat lasts, before any hold. */
  minMs: 1000,
  maxMs: 3500,
  /** The extra time a beat holds after it is read, by what it shows. */
  holdMs: { death: 900, spell: 600, end: 1200 },
} as const;

/** The text that the strip shows for a beat: the first line and its numbers, two more lines, and a count. */
export function beatText(lines: readonly EventLine[]): string {
  const [first, ...rest] = lines;
  if (first === undefined) return '';
  const parts = [first.text, first.detail ?? '', ...rest.slice(0, 2).map((line) => line.text)];
  if (rest.length > 2) parts.push(`And ${rest.length - 2} more.`);
  return parts.filter((part) => part !== '').join(' ');
}

/** The hold a beat earns, from the most important thing in it. */
function holdFor(events: readonly AnyEvent[]): number {
  const types = new Set(events.map((e) => e.event_type));
  if (types.has('battle_ended') || types.has('encounter_ended') || types.has('game_over'))
    return PACE.holdMs.end;
  const fell = events.some(
    (e) => e.event_type === 'condition_gained' && (e.condition === 'petrified' || e.condition === 'dead'),
  );
  if (types.has('death') || fell) return PACE.holdMs.death;
  if (types.has('spell_cast') || types.has('undead_turned') || types.has('magic_dispelled'))
    return PACE.holdMs.spell;
  return 0;
}

/**
 * How long a beat lasts at normal speed, in milliseconds.
 *
 * @param lines - The lines the beat shows.
 * @param events - The events behind them, for the hold.
 */
export function beatDuration(lines: readonly EventLine[], events: readonly AnyEvent[]): number {
  const reading = PACE.settleMs + beatText(lines).length * PACE.perCharMs;
  return Math.min(PACE.maxMs, Math.max(PACE.minMs, reading)) + holdFor(events);
}

function popsFor(events: AnyEvent[], lookup: MonsterGroupLookup): Pop[] {
  const pops: Pop[] = [];
  for (const event of events) {
    switch (event.event_type) {
      case 'damage_dealt': {
        const token = tokenFor(str(event, 'target_id'), lookup);
        if (token) pops.push({ tokenId: token, kind: 'damage', text: `−${num(event, 'amount') ?? 0}` });
        break;
      }
      case 'healing_applied': {
        const token = tokenFor(str(event, 'target_id'), lookup);
        if (token && event.code === 'combat.healing.applied')
          pops.push({ tokenId: token, kind: 'heal', text: `+${num(event, 'amount') ?? 0}` });
        break;
      }
      case 'attack_rolled': {
        const token = tokenFor(str(event, 'defender_id'), lookup);
        if (token && event.code === 'combat.attack.missed')
          pops.push({ tokenId: token, kind: 'miss', text: 'Miss' });
        break;
      }
      case 'death': {
        const token = tokenFor(str(event, 'target_id'), lookup);
        if (token)
          pops.push({
            tokenId: token,
            kind: 'death',
            text: idKind(token) === 'character' ? 'Dead' : 'Slain',
          });
        break;
      }
      case 'hide_attempted': {
        // The players learn that the member tried to hide, never whether it worked.
        const token = tokenFor(str(event, 'character_id'), lookup);
        if (token) pops.push({ tokenId: token, kind: 'hide', text: 'Hiding' });
        break;
      }
      case 'condition_gained': {
        const condition = str(event, 'condition');
        const token = tokenFor(str(event, 'target_id'), lookup);
        if (token && condition && condition !== 'dead') {
          const text = conditionLabel(condition);
          if (!pops.some((p) => p.tokenId === token && p.text === text))
            pops.push({ tokenId: token, kind: 'condition', text });
        }
        break;
      }
      default:
        break;
    }
  }
  return pops;
}

function focusFor(lines: EventLine[], lookup: MonsterGroupLookup): string[] {
  const focus: string[] = [];
  for (const line of lines) {
    for (const id of line.actorIds) {
      const token = tokenFor(id, lookup);
      if (token && !focus.includes(token)) focus.push(token);
    }
  }
  return focus;
}

function rollFor(events: AnyEvent[]): Beat['roll'] {
  const attack = events.find((e) => e.event_type === 'attack_rolled');
  if (!attack) return null;
  const natural = num(attack, 'roll');
  if (natural === null) return null;
  return {
    natural,
    modifier: num(attack, 'modifier') ?? 0,
    total: num(attack, 'total') ?? natural,
    hit: attack.code !== 'combat.attack.missed',
  };
}

/** Splits events into the slices that make one beat each, by the rules above. */
export function sliceBeats(events: readonly AnyEvent[]): AnyEvent[][] {
  const slices: AnyEvent[][] = [];
  let index = 0;
  while (index < events.length) {
    const event = events[index];
    if (event === undefined) break;
    const slice = [event];
    index += 1;
    if (event.event_type === 'attack_rolled') {
      const next = events[index];
      if (
        next &&
        (next.event_type === 'damage_dealt' || next.event_type === 'damage_absorbed') &&
        next.target_id === event.defender_id
      ) {
        slice.push(next);
        index += 1;
      }
    } else if (LEADERS.has(event.event_type)) {
      while (index < events.length && FOLLOW_ON.has(events[index]?.event_type ?? '')) {
        const next = events[index];
        if (next) slice.push(next);
        index += 1;
      }
    } else if (RUNS.has(event.event_type)) {
      while (index < events.length && events[index]?.event_type === event.event_type) {
        const next = events[index];
        if (next) slice.push(next);
        index += 1;
      }
    }
    slices.push(slice);
  }
  return slices;
}

export interface BeatOptions {
  /** Keep referee-only events. Only for a referee with the lens on. */
  includeReferee: boolean;
  /** bxapi's messages, one for each event, for event types the text layer doesn't know. */
  messages?: readonly string[];
  lookup: MonsterGroupLookup;
}

/**
 * Builds the beats of a round.
 *
 * @param events - The events of the feed entry, as the reader received them.
 * @param ctx - The text context.
 * @param options - Whether to keep referee events, the messages, and the monster group lookup.
 */
export function buildBeats(events: readonly AnyEvent[], ctx: TextContext, options: BeatOptions): Beat[] {
  const learned = extendContextWithEvents(ctx, events as never);
  const kept: Array<{ event: AnyEvent; message: string | undefined }> = [];
  events.forEach((event, i) => {
    if (QUIET_EVENTS.has(event.event_type)) return;
    if (!options.includeReferee && event.visibility === 'referee') return;
    kept.push({ event, message: options.messages?.[i] });
  });
  const messageOf = new Map(kept.map((k) => [k.event, k.message]));
  const beats: Beat[] = [];
  for (const slice of sliceBeats(kept.map((k) => k.event))) {
    const messages = slice.map((e) => messageOf.get(e) ?? '');
    const lines = describeEvents(slice, learned, { messages, collapseChecks: false });
    if (lines.length === 0) continue;
    // Two slices can say the same thing, such as a member gaining the dead condition and then dying. They play
    // as one beat, so the strip never shows the same sentence twice.
    const previous = beats.at(-1);
    if (previous && sameText(previous.lines, lines)) {
      const events = [...previous.events, ...slice];
      beats[beats.length - 1] = {
        ...previous,
        events,
        durationMs: beatDuration(previous.lines, events),
        pops: popsFor(events, options.lookup),
        referee: previous.referee && slice.every((e) => e.visibility === 'referee'),
      };
      continue;
    }
    beats.push({
      index: beats.length,
      events: slice,
      lines,
      durationMs: beatDuration(lines, slice),
      pops: popsFor(slice, options.lookup),
      focus: focusFor(lines, options.lookup),
      roll: rollFor(slice),
      referee: slice.every((e) => e.visibility === 'referee'),
    });
  }
  return beats;
}

function sameText(a: readonly EventLine[], b: readonly EventLine[]): boolean {
  return a.length === b.length && a.every((line, i) => line.text === b[i]?.text);
}

/** The battlefield after each beat: entry `i` is the state once beat `i` has played. */
export function trackStates(
  start: TrackState,
  beats: readonly Beat[],
  lookup: MonsterGroupLookup,
): TrackState[] {
  const states: TrackState[] = [];
  let state = start;
  for (const beat of beats) {
    for (const event of beat.events) state = applyEvent(state, event, lookup);
    states.push(state);
  }
  return states;
}

// The round in a few words -------------------------------------------------------------------------------------

export interface RoundDigest {
  round: number | null;
  /** `party` or `monsters`, whoever acted first, when initiative was rolled by side. */
  first: 'party' | 'monsters' | null;
  damageDealt: number;
  damageTaken: number;
  healed: number;
  /** Party members who died or turned to stone. */
  fallen: string[];
  /** Monster deaths by group token, or under `null` when the group is unknown. */
  slain: Array<{ groupId: string | null; count: number }>;
  fleeing: string[];
  /** The groups that got away and left the battle this round. */
  escaped: string[];
  /** Conditions gained, by token (a member, or a monster's group, or `null` when unknown). */
  conditions: Array<{ tokenId: string | null; condition: string; count: number }>;
  outcome: 'victory' | 'defeat' | 'fled' | null;
}

/** Conditions that the round's other chips already cover, or that matter only to the referee. */
const DIGEST_SKIPS = new Set(['dead', 'petrified', 'averted_eyes']);

/** Sums up a round from its events. */
export function digestRound(events: readonly AnyEvent[], lookup: MonsterGroupLookup): RoundDigest {
  const digest: RoundDigest = {
    round: null,
    first: null,
    damageDealt: 0,
    damageTaken: 0,
    healed: 0,
    fallen: [],
    slain: [],
    fleeing: [],
    escaped: [],
    conditions: [],
    outcome: null,
  };
  for (const event of events) {
    switch (event.event_type) {
      case 'battle_round':
        digest.round = num(event, 'round');
        break;
      case 'initiative_rolled': {
        const order = Array.isArray(event.order) ? event.order : [];
        const first = order[0];
        if (typeof first === 'string') digest.first = idKind(first) === 'character' ? 'party' : 'monsters';
        break;
      }
      case 'damage_dealt': {
        const target = str(event, 'target_id') ?? '';
        const amount = num(event, 'amount') ?? 0;
        if (idKind(target) === 'character') digest.damageTaken += amount;
        else digest.damageDealt += amount;
        break;
      }
      case 'healing_applied':
        if (event.code === 'combat.healing.applied' && idKind(str(event, 'target_id') ?? '') === 'character')
          digest.healed += num(event, 'amount') ?? 0;
        break;
      case 'death': {
        const target = str(event, 'target_id') ?? '';
        if (idKind(target) === 'character') {
          if (!digest.fallen.includes(target)) digest.fallen.push(target);
        } else {
          const groupId = lookup(target);
          const entry = digest.slain.find((s) => s.groupId === groupId);
          if (entry) entry.count += 1;
          else digest.slain.push({ groupId, count: 1 });
        }
        break;
      }
      case 'condition_gained': {
        const condition = str(event, 'condition') ?? '';
        const target = str(event, 'target_id') ?? '';
        if (condition === 'petrified' && idKind(target) === 'character' && !digest.fallen.includes(target))
          digest.fallen.push(target);
        if (DIGEST_SKIPS.has(condition) || condition === '') break;
        const tokenId = tokenFor(target, lookup);
        const entry = digest.conditions.find((c) => c.tokenId === tokenId && c.condition === condition);
        if (entry) entry.count += 1;
        else digest.conditions.push({ tokenId, condition, count: 1 });
        break;
      }
      case 'monster_fled': {
        const group = str(event, 'group_id');
        if (group && !digest.fleeing.includes(group)) digest.fleeing.push(group);
        break;
      }
      case 'monster_escaped': {
        const group = str(event, 'group_id');
        if (group && !digest.escaped.includes(group)) digest.escaped.push(group);
        digest.fleeing = digest.fleeing.filter((id) => id !== group);
        break;
      }
      case 'battle_ended':
        digest.outcome =
          event.code === 'battle.ended.victory'
            ? 'victory'
            : event.code === 'battle.ended.defeat'
              ? 'defeat'
              : 'fled';
        break;
      default:
        break;
    }
  }
  return digest;
}

/**
 * Pairs each monster with the group a party member declared against, from the round's attacks and spells, so a
 * player's board can float damage over the right group.
 */
export function monsterGroupsFromRound(
  events: readonly AnyEvent[],
  declarations: Record<string, { target_group_id?: string | null }>,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const event of events) {
    if (event.event_type === 'attack_rolled') {
      const attacker = str(event, 'attacker_id');
      const defender = str(event, 'defender_id');
      const group = attacker ? declarations[attacker]?.target_group_id : null;
      if (defender && group && idKind(defender) !== 'character') pairs.push([defender, group]);
    } else if (event.event_type === 'spell_cast') {
      const caster = str(event, 'caster_id');
      const group = caster ? declarations[caster]?.target_group_id : null;
      const targets = Array.isArray(event.target_ids) ? event.target_ids : [];
      if (group)
        for (const target of targets)
          if (typeof target === 'string' && idKind(target) !== 'character') pairs.push([target, group]);
    }
  }
  return pairs;
}

// Icons --------------------------------------------------------------------------------------------------------

const ICONS: Partial<Record<EventIcon, IconName>> = {
  step: 'footprints',
  run: 'footprints',
  sword: 'weapon-sword',
  shield: 'shield',
  arrow: 'weapon-bow',
  dice: 'dice',
  wound: 'heart',
  heart: 'heart',
  skull: 'skull',
  spell: 'spell',
  book: 'book',
  holy: 'class-cleric',
  scroll: 'scroll',
  potion: 'potion',
  wand: 'wand',
  coins: 'coins',
  chest: 'chest',
  gem: 'gem',
  star: 'flag',
  level: 'arrow-up',
  monsters: 'battle',
  clock: 'clock',
  referee: 'referee',
  info: 'info',
  flag: 'flag',
  party: 'users',
  warning: 'warning',
  ear: 'ear',
  torch: 'torch',
};

/** The kit icon for a line's icon hint. */
export function lineIcon(icon: EventIcon): IconName {
  return ICONS[icon] ?? 'info';
}
