/**
 * Describe bxapi events as lines of a game log.
 *
 * `describeEvent` turns one event into an `EventLine`: a terse sentence in the voice of a referee, plus the
 * category, tone, icon, and the IDs involved. Dice and target numbers go in a separate `detail` string so the
 * interface can show them on demand. `describeEvents` describes a whole command outcome, learns names from the
 * events first, and joins an attack with the damage it dealt.
 */

import { itemNounByName, magicItemCategory, magicItemTemplateName } from './catalog';
import {
  areaName,
  dungeonName,
  entityName,
  extendContextWithEvents,
  groupName,
  idKind,
  itemList,
  itemName,
  memberName,
  spellName,
  type LearnableEvent,
  type TextContext,
} from './context';
import {
  capitalizeFirst,
  count,
  formatDice,
  formatDiceTotal,
  formatDuration,
  formatFeet,
  formatGameClock,
  formatGold,
  formatInteger,
  joinList,
  lowerFirst,
  pluralize,
  prettifyId,
  signed,
  withArticle,
} from './format';
import { removeDashes, humanizeMessage } from './humanize';
import {
  battleMoveVerb,
  classLabel,
  conditionGained,
  conditionRemoved,
  encounterOutcomeSentence,
  facingLabel,
  healingServiceLabel,
  saveVersus,
  searchKindNoun,
  stanceSentence,
  restKindLabel,
} from './labels';
import { describeRejection } from './rejections';
import type { EventCategory, EventIcon, EventLine, EventTone, GameEvent, LooseEvent } from './types';

const KNOWN_EVENT_TYPES = new Set([
  'adventure_completed',
  'adventure_xp_award',
  'attack_rolled',
  'battle_ended',
  'battle_round',
  'battle_started',
  'leveled_up',
  'condition_gained',
  'condition_removed',
  'curse_revealed',
  'damage_absorbed',
  'damage_dealt',
  'death',
  'declaration_fizzled',
  'detection_rolled',
  'dice_rolled',
  'door',
  'effect_attached',
  'effect_expired',
  'effect_released',
  'effect_ticked',
  'encounter_ended',
  'encounter_group_joined',
  'encounter_started',
  'equipment_destroyed',
  'evasion',
  'exhaustion',
  'fatigue',
  'flag_set',
  'game_over',
  'group_moved',
  'healing_applied',
  'healing_purchased',
  'hit_points_reported',
  'hoard_generated',
  'initiative_rolled',
  'item_acquired',
  'item_consumed',
  'item_identified',
  'item_used',
  'items_dropped',
  'items_given',
  'items_left_behind',
  'items_removed',
  'journal_entry_added',
  'level_drained',
  'light',
  'listened',
  'location_entered',
  'loot_dropped',
  'magic_dispelled',
  'member_added',
  'member_moved',
  'member_removed',
  'member_withdrew',
  'monster_defeated',
  'monster_fled',
  'monster_revived',
  'monsters_left_behind',
  'monsters_spawned',
  'morale_checked',
  'note_recorded',
  'npc_party_spawned',
  'objective_completed',
  'objective_revealed',
  'party_moved',
  'party_reordered',
  'provisions',
  'pursuit',
  'quest_activated',
  'quest_completed',
  'reaction_rolled',
  'rested',
  'saving_throw_rolled',
  'search_completed',
  'spell_book_updated',
  'spell_cast',
  'spell_declared',
  'spell_disrupted',
  'spell_forgotten',
  'spells_memorized',
  'stance_changed',
  'surprise_rolled',
  'targets_selected',
  'time_advanced',
  'trap',
  'treasure_sold',
  'trigger_fired',
  'undead_turned',
  'wandering_check',
  'xp_awarded',
]);

/** True when `describeEvent` has wording for this event type. */
export function isKnownEventType(eventType: string): boolean {
  return KNOWN_EVENT_TYPES.has(eventType);
}

interface Parts {
  text: string;
  category: EventCategory;
  tone: EventTone;
  icon: EventIcon;
  detail?: string | undefined;
  ids?: ReadonlyArray<string | null | undefined>;
  amount?: number | undefined;
}

function isParty(id: string | null | undefined, ctx: TextContext): boolean {
  if (!id) return false;
  return Boolean(ctx.members[id]) || idKind(id) === 'character';
}

const ACTOR_KINDS = new Set(['character', 'monster', 'group', 'npc']);

function actorIdsFrom(ids: ReadonlyArray<string | null | undefined> | undefined): string[] {
  const result: string[] = [];
  for (const id of ids ?? []) {
    if (id && ACTOR_KINDS.has(idKind(id)) && !result.includes(id)) result.push(id);
  }
  return result;
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function nameList(ids: readonly string[], ctx: TextContext): string {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const id of ids) {
    const name = id.startsWith('cell:') ? 'the area' : entityName(id, ctx);
    if (!counts.has(name)) order.push(name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const parts = order.map((name) => {
    const n = counts.get(name) ?? 1;
    if (n === 1) return name;
    const noun = name.replace(/^(?:a|an|the)\s+/i, '');
    return `${n} ${pluralize(noun)}`;
  });
  return joinList(parts);
}

function coinsText(gp: number): string {
  return `${formatGold(gp)} in coin`;
}

function goodsText(itemIds: readonly string[], gp: number, ctx: TextContext): string {
  const parts = itemList(itemIds, ctx);
  if (gp > 0) parts.push(coinsText(gp));
  return parts.length === 0 ? 'nothing' : joinList(parts);
}

/** Phrase for how a weapon is named in an attack: ` with a sword`, ` with its claw`, or nothing. */
function attackWeapon(attackName: string, attackerId: string, ctx: TextContext): string {
  const name = attackName.trim();
  if (name === '' || name.toLowerCase() === 'weapon') return '';
  if (name === 'unarmed') return ' with bare hands';
  if (name === 'improvised') return ' with an improvised weapon';
  if (/^[A-Z]/.test(name)) {
    const noun = itemNounByName(name);
    return ` with ${noun.noArticle ? noun.one : withArticle(noun.one)}`;
  }
  void attackerId;
  void ctx;
  return ` with its ${name}`;
}

function rollDetail(event: {
  roll?: number | null;
  modifier: number;
  total?: number | null;
  required?: number | null;
  defender_ac?: number | null;
  natural?: number | null;
}): string {
  if (event.roll === null || event.roll === undefined) return 'No roll needed.';
  const total = event.total ?? event.roll + event.modifier;
  const parts = [`Rolled ${event.roll} ${signed(event.modifier)} = ${total}`];
  if (event.required !== null && event.required !== undefined) parts.push(`needed ${event.required}`);
  let text = parts.join(', ');
  if (event.defender_ac !== null && event.defender_ac !== undefined)
    text += ` against armour class ${event.defender_ac}`;
  if (event.natural === 20) text += ' (natural 20)';
  else if (event.natural === 1) text += ' (natural 1)';
  return `${text}.`;
}

const DOOR_WORDS: Record<string, string> = { north: 'north', east: 'east', south: 'south', west: 'west' };

function doorSide(direction: string): string {
  return DOOR_WORDS[direction] ?? prettifyId(direction);
}

function sourceNoun(source: string): string {
  switch (source) {
    case 'torch':
      return 'torch';
    case 'lantern':
      return 'lantern';
    case 'oil':
      return 'pool of burning oil';
    case 'sword':
      return "sword's glow";
    case 'light':
      return 'magical light';
    default:
      return prettifyId(source);
  }
}

function foundReference(reference: string, ctx: TextContext): string {
  const [kind, first, second] = reference.split(':');
  switch (kind) {
    case 'secret_door':
      return `a secret door to the ${doorSide(first ?? '')}`;
    case 'room_trap':
      return `a trap in ${first ? areaName(first, ctx) : 'the room'}${second ? ` beyond the ${doorSide(second)} door` : ''}`;
    case 'construction':
      return 'a construction trick';
    default:
      return prettifyId(reference);
  }
}

function effectTarget(targetRef: string, ctx: TextContext): string {
  if (targetRef.startsWith('cell:')) return 'a cell';
  return entityName(targetRef, ctx);
}

function dieAgainst(kind: string, roll: number | null | undefined, chance: number): string {
  const percentile = kind === 'open_locks' || kind === 'treasure_traps';
  if (roll === null || roll === undefined)
    return `No die rolled (chance ${percentile ? `${chance}%` : `${chance} in 6`}).`;
  return percentile
    ? `Rolled ${roll} on d100 against ${chance}%.`
    : `Rolled ${roll} on d6 against ${chance} in 6.`;
}

const DETECTION_ACTIONS: Record<string, { verb: string; pass: string; fail: string }> = {
  listening: { verb: 'listens at the door', pass: 'and the roll succeeds', fail: 'and the roll fails' },
  secret_doors: {
    verb: 'searches for secret doors',
    pass: 'and the roll succeeds',
    fail: 'and the roll fails',
  },
  room_traps: { verb: 'searches for room traps', pass: 'and the roll succeeds', fail: 'and the roll fails' },
  construction: {
    verb: 'searches for construction tricks',
    pass: 'and the roll succeeds',
    fail: 'and the roll fails',
  },
  open_locks: { verb: 'tries to pick the lock', pass: 'and succeeds', fail: 'and fails' },
  treasure_traps: {
    verb: 'checks the treasure for traps',
    pass: 'and the roll succeeds',
    fail: 'and the roll fails',
  },
};

/** Describe one event as a line of the game log. Unknown event types fall back to bxapi's wording. */
export function describeEvent(
  event: GameEvent | LooseEvent,
  ctx: TextContext,
  options: { message?: string } = {},
): EventLine {
  const visibility: 'player' | 'referee' = event.visibility === 'referee' ? 'referee' : 'player';
  if (!KNOWN_EVENT_TYPES.has(event.event_type)) {
    const fallback =
      options.message !== undefined ? humanizeMessage(options.message, ctx) : fallbackEventText(event);
    return {
      text: removeDashes(fallback),
      category: 'system',
      tone: 'neutral',
      icon: 'info',
      actorIds: [],
      code: event.code,
      eventType: event.event_type,
      visibility,
    };
  }
  const parts = describeKnown(event as GameEvent, ctx);
  const line: EventLine = {
    text: removeDashes(capitalizeFirst(parts.text)),
    category: parts.category,
    tone: parts.tone,
    icon: parts.icon,
    actorIds: actorIdsFrom(parts.ids),
    code: event.code,
    eventType: event.event_type,
    visibility,
  };
  if (parts.detail) line.detail = removeDashes(parts.detail);
  if (parts.amount !== undefined) line.amount = parts.amount;
  return line;
}

function unknownCode(event: { code: string }): Parts {
  return { text: fallbackEventText(event), category: 'system', tone: 'neutral', icon: 'info' };
}

/** The wording for an event code that has no template: the code's words as a sentence. */
export function fallbackEventText(event: { code: string }): string {
  return capitalizeFirst(`${event.code.split('.').map(prettifyId).join(' ')}.`);
}

function withNarrative(text: string, narrative: string | null | undefined): string {
  return narrative ? `${text} ${narrative}` : text;
}

function describeKnown(event: GameEvent, ctx: TextContext): Parts {
  switch (event.event_type) {
    // Combat ----------------------------------------------------------------------------------------------------
    case 'initiative_rolled': {
      const first = event.order[0];
      const partyFirst = first !== undefined && isParty(first, ctx);
      const text =
        event.mode === 'side'
          ? partyFirst
            ? 'The party wins initiative and acts first.'
            : 'The monsters win initiative and act first.'
          : `Initiative order: ${joinList(event.order.map((id) => entityName(id, ctx)))}.`;
      const detail = event.entries
        .map((entry) => {
          const key =
            entry.key === 'party'
              ? 'Party'
              : entry.key === 'monsters'
                ? 'Monsters'
                : capitalizeFirst(entityName(entry.key, ctx));
          const rolls = entry.rolls.join(', then ');
          const modifier = entry.modifier !== 0 ? ` ${signed(entry.modifier)} = ${entry.total}` : '';
          return `${key} rolled ${rolls}${modifier}`;
        })
        .join('. ');
      return {
        text,
        detail: detail ? `${detail}.` : undefined,
        category: 'battle',
        tone: 'neutral',
        icon: 'dice',
        ids: event.order,
      };
    }
    case 'attack_rolled': {
      const attacker = entityName(event.attacker_id, ctx);
      const defender = entityName(event.defender_id, ctx);
      const weapon = attackWeapon(event.attack_name, event.attacker_id, ctx);
      const byParty = isParty(event.attacker_id, ctx);
      const targetIsParty = isParty(event.defender_id, ctx);
      const detail = rollDetail(event);
      const ids = [event.attacker_id, event.defender_id];
      if (event.code === 'combat.attack.auto_hit') {
        const text = event.back_stab
          ? `${attacker} back-stabs the helpless ${defender.replace(/^(?:a|an|the)\s+/i, '')}${weapon}.`
          : `${attacker} strikes the helpless ${defender.replace(/^(?:a|an|the)\s+/i, '')}${weapon}.`;
        return { text, detail, category: 'battle', tone: byParty ? 'good' : 'bad', icon: 'sword', ids };
      }
      if (event.code === 'combat.attack.hit') {
        const verb = event.back_stab ? 'back-stabs' : 'hits';
        return {
          text: `${attacker} ${verb} ${defender}${weapon}.`,
          detail,
          category: 'battle',
          tone: byParty ? 'good' : targetIsParty ? 'bad' : 'neutral',
          icon: 'sword',
          ids,
        };
      }
      const target = event.back_stab ? `a back-stab on ${defender}` : defender;
      return {
        text: `${attacker} misses ${target}${weapon}.`,
        detail,
        category: 'battle',
        tone: 'neutral',
        icon: 'sword',
        ids,
      };
    }
    case 'damage_dealt': {
      const target = entityName(event.target_id, ctx);
      const by = event.attacker_id ? ` from ${entityName(event.attacker_id, ctx)}` : '';
      const rollSum = event.rolls.reduce((sum, die) => sum + die, 0);
      const rolled =
        event.rolls.length === 0
          ? undefined
          : rollSum === event.amount
            ? `Damage dice: ${event.rolls.join(' + ')}.`
            : `Damage dice: ${event.rolls.join(' + ')}, which becomes ${event.amount} after modifiers.`;
      const keys = event.keys.length > 0 ? `Damage type: ${event.keys.join(', ')}.` : undefined;
      const detail = [rolled, keys].filter(Boolean).join(' ') || undefined;
      return {
        text: `${target} takes ${event.amount} damage${by}.`,
        detail,
        category: 'damage',
        tone: isParty(event.target_id, ctx) ? 'bad' : 'good',
        icon: 'wound',
        ids: [event.attacker_id, event.target_id],
        amount: event.amount,
      };
    }
    case 'damage_absorbed': {
      const attacker = event.attacker_id
        ? `${possessive(entityName(event.attacker_id, ctx))} attack`
        : 'The attack';
      const keys =
        event.keys.length > 0
          ? `Absorbed: ${event.keys.join(', ')}.`
          : 'Ordinary attacks of that kind do nothing to this creature.';
      return {
        text: `${attacker} has no effect on ${entityName(event.target_id, ctx)}.`,
        detail: keys,
        category: 'damage',
        tone: isParty(event.target_id, ctx) ? 'good' : 'bad',
        icon: 'shield',
        ids: [event.attacker_id, event.target_id],
      };
    }
    case 'saving_throw_rolled': {
      const target = entityName(event.target_id, ctx);
      const versus = saveVersus(event.category);
      const party = isParty(event.target_id, ctx);
      const detail =
        event.roll === null || event.roll === undefined
          ? 'No roll needed.'
          : `Rolled ${event.roll} ${signed(event.modifier)}${event.required !== null && event.required !== undefined ? `, needed ${event.required} or more` : ''}.`;
      if (event.code === 'combat.save.auto') {
        return {
          text: `${target} automatically saves versus ${versus}.`,
          detail,
          category: 'battle',
          tone: party ? 'good' : 'neutral',
          icon: 'shield',
          ids: [event.target_id],
        };
      }
      const passed = event.code === 'combat.save.passed';
      return {
        text: `${target} ${passed ? 'passes' : 'fails'} a saving throw versus ${versus}.`,
        detail,
        category: 'battle',
        tone: party ? (passed ? 'good' : 'bad') : passed ? 'neutral' : 'good',
        icon: 'shield',
        ids: [event.target_id],
      };
    }
    case 'morale_checked': {
      const subject = event.subject === 'party' ? 'The party' : entityName(event.subject, ctx);
      const held =
        event.held ??
        (event.code === 'combat.morale.held' || (event.code === 'combat.morale.exempt' && event.score >= 12));
      const owner = possessive(subject.replace(/^[a-z]/, (letter) => letter));
      const detail =
        event.roll === null || event.roll === undefined
          ? `Morale ${event.score}, so no roll.`
          : `Morale ${event.score}. Rolled ${event.roll} ${signed(event.modifier)} on 2d6.`;
      if (event.code === 'combat.morale.exempt') {
        return {
          text: held
            ? `Morale never applies to ${subject.toLowerCase().startsWith('the ') ? lowerFirst(subject) : subject}.`
            : `${subject} will not fight.`,
          detail,
          category: 'battle',
          tone: 'info',
          icon: 'flag',
          ids: [event.subject],
        };
      }
      return {
        text: `${capitalizeFirst(owner)} morale ${held ? 'holds' : 'breaks'}.`,
        detail,
        category: 'battle',
        tone: held ? 'neutral' : 'good',
        icon: 'flag',
        ids: [event.subject],
      };
    }
    case 'reaction_rolled': {
      const reaction = stanceSentence(event.result);
      return {
        text: `Reaction roll: ${reaction.replace(/^The monsters /, 'the monsters ').replace(/\.$/, '')}.`,
        detail: `Rolled ${event.roll} ${signed(event.modifier)} = ${event.total} on 2d6.`,
        category: 'encounter',
        tone: 'info',
        icon: 'dice',
      };
    }
    case 'condition_gained': {
      const target = entityName(event.target_id, ctx);
      const party = isParty(event.target_id, ctx);
      if (event.condition === 'dead') {
        return {
          text: party ? `${target} dies!` : `${target} dies.`,
          category: 'death',
          tone: party ? 'danger' : 'good',
          icon: 'skull',
          ids: [event.target_id],
        };
      }
      const helpful = event.condition === 'invisible';
      return {
        text: `${target} ${conditionGained(event.condition)}.`,
        category: 'battle',
        tone: party ? (helpful ? 'good' : 'bad') : helpful ? 'bad' : 'good',
        icon: 'warning',
        ids: [event.target_id],
      };
    }
    case 'condition_removed': {
      const target = entityName(event.target_id, ctx);
      const party = isParty(event.target_id, ctx);
      return {
        text: `${target} ${conditionRemoved(event.condition)}.`,
        category: event.condition === 'dead' ? 'death' : 'battle',
        tone: party ? 'good' : 'neutral',
        icon: 'heart',
        ids: [event.target_id],
      };
    }
    case 'effect_attached':
    case 'effect_ticked':
    case 'effect_expired':
    case 'effect_released': {
      const kind = prettifyId(event.kind);
      const target = effectTarget(event.target_ref, ctx);
      const verbs: Record<string, string> = {
        'effects.effect.attached': `A ${kind} effect begins on ${target}.`,
        'effects.effect.ticked': `The ${kind} effect on ${target} takes effect again.`,
        'effects.effect.expired': `The ${kind} effect on ${target} runs out.`,
        'effects.effect.released': `The ${kind} effect on ${target} ends early.`,
      };
      let detail: string | undefined;
      if (
        event.event_type === 'effect_attached' &&
        event.expires_round !== null &&
        event.expires_round !== undefined
      ) {
        detail = `Runs until round ${formatInteger(event.expires_round)} (${formatGameClock(event.expires_round)}).`;
      } else if (event.event_type === 'effect_ticked' || event.event_type === 'effect_expired') {
        detail = `Round ${formatInteger(event.round)} (${formatGameClock(event.round)}).`;
      }
      return {
        text: verbs[event.code] ?? `The ${kind} effect on ${target} changes.`,
        detail,
        category: 'referee',
        tone: 'info',
        icon: 'spell',
        ids: [event.target_ref],
      };
    }
    case 'healing_applied': {
      const target = entityName(event.target_id, ctx);
      const party = isParty(event.target_id, ctx);
      const source: Record<string, string> = {
        magical: 'Magical healing.',
        natural: 'Natural healing from rest.',
        regeneration: 'Regeneration.',
      };
      const detail = source[event.source] ?? `${capitalizeFirst(prettifyId(event.source))} healing.`;
      if (event.code === 'combat.healing.blocked') {
        return {
          text: `${target} can't be healed by ${prettifyId(event.source)} means.`,
          detail,
          category: 'healing',
          tone: party ? 'bad' : 'good',
          icon: 'heart',
          ids: [event.target_id],
        };
      }
      return {
        text:
          event.amount === 0
            ? `${target} regains no hit points.`
            : `${target} regains ${count(event.amount, 'hit point')}.`,
        detail,
        category: 'healing',
        tone: party ? 'good' : 'bad',
        icon: 'heart',
        ids: [event.target_id],
        amount: event.amount,
      };
    }
    case 'death': {
      const target = entityName(event.target_id, ctx);
      const party = isParty(event.target_id, ctx);
      if (event.code === 'combat.death.permanent') {
        return {
          text: party ? `${target} is destroyed for good!` : `${target} is destroyed for good.`,
          category: 'death',
          tone: party ? 'danger' : 'good',
          icon: 'skull',
          ids: [event.target_id],
        };
      }
      return {
        text: party ? `${target} dies!` : `${target} dies.`,
        category: 'death',
        tone: party ? 'danger' : 'good',
        icon: 'skull',
        ids: [event.target_id],
      };
    }
    case 'equipment_destroyed': {
      const target = entityName(event.target_id, ctx);
      const things = joinList(event.item_names.map((name) => itemNounByName(name).one));
      const saved =
        event.saved_items.length > 0
          ? `Saved from destruction: ${joinList(event.saved_items.map((id) => itemName(id, ctx)))}.`
          : undefined;
      return {
        text: `${possessive(target)} equipment is destroyed: ${things}.`,
        detail: saved,
        category: 'item',
        tone: isParty(event.target_id, ctx) ? 'bad' : 'good',
        icon: 'warning',
        ids: [event.target_id],
      };
    }
    case 'level_drained': {
      const target = entityName(event.target_id, ctx);
      const party = isParty(event.target_id, ctx);
      const unit = party ? 'level' : 'Hit Die';
      if (event.code === 'combat.drain.slain') {
        return {
          text: party
            ? `${target} is drained of every level and dies!`
            : `${target} is drained of every Hit Die and dies.`,
          detail: event.spawn_consequence ?? undefined,
          category: 'death',
          tone: party ? 'danger' : 'good',
          icon: 'skull',
          ids: [event.target_id],
          amount: event.levels_lost,
        };
      }
      const lost = event.levels_lost === 1 ? `a ${unit}` : `${event.levels_lost} ${pluralize(unit)}`;
      const detailParts = [`Maximum hit points lowered by ${event.hp_lost}.`];
      if (event.xp_after !== null && event.xp_after !== undefined)
        detailParts.push(`Experience is now ${formatInteger(event.xp_after)}.`);
      return {
        text: `${target} loses ${lost} and is now ${party ? `level ${event.new_level}` : `${count(event.new_level, 'Hit Die', 'Hit Dice')}`}.`,
        detail: detailParts.join(' '),
        category: 'damage',
        tone: party ? 'danger' : 'good',
        icon: 'wound',
        ids: [event.target_id],
        amount: event.levels_lost,
      };
    }
    case 'monster_revived':
      return {
        text: `${entityName(event.target_id, ctx)} gets back up.`,
        category: 'death',
        tone: 'bad',
        icon: 'skull',
        ids: [event.target_id],
      };
    case 'hit_points_reported':
      return {
        text: `${entityName(event.target_id, ctx)} has ${event.current_hp} of ${event.max_hp} hit points.`,
        category: 'damage',
        tone: 'info',
        icon: 'heart',
        ids: [event.target_id],
        amount: event.current_hp,
      };
    case 'targets_selected':
      return {
        text:
          event.target_ids.length === 0
            ? 'The spell reaches no one.'
            : `The spell reaches ${nameList(event.target_ids, ctx)}.`,
        detail: `Targeting: ${prettifyId(event.mode)}.`,
        category: 'magic',
        tone: 'info',
        icon: 'spell',
        ids: event.target_ids,
      };

    // Magic -----------------------------------------------------------------------------------------------------
    case 'spells_memorized': {
      const caster = entityName(event.caster_id, ctx);
      const labels = event.prepared.map(
        (spell) => `${spellName(spell.spell_id, ctx)}${spell.reversed ? ' (reversed)' : ''}`,
      );
      const grouped = new Map<string, number>();
      for (const label of labels) grouped.set(label, (grouped.get(label) ?? 0) + 1);
      const list = [...grouped.entries()].map(([label, n]) => (n === 1 ? label : `${label} (${n} copies)`));
      return {
        text: list.length === 0 ? `${caster} memorizes no spells.` : `${caster} memorizes ${joinList(list)}.`,
        category: 'magic',
        tone: 'info',
        icon: 'book',
        ids: [event.caster_id],
      };
    }
    case 'spell_cast': {
      const caster = entityName(event.caster_id, ctx);
      const spell = `${spellName(event.spell_id, ctx)}${event.reversed ? ' (reversed)' : ''}`;
      const party = isParty(event.caster_id, ctx);
      if (event.code === 'magic.cast.no_effect') {
        return {
          text: `${caster} casts ${spell}, but it has no effect.`,
          category: 'magic',
          tone: party ? 'bad' : 'good',
          icon: 'spell',
          ids: [event.caster_id, ...event.target_ids],
        };
      }
      const at = event.target_ids.length > 0 ? ` at ${nameList(event.target_ids, ctx)}` : '';
      const manual = event.manual ? ' The referee decides what happens.' : '';
      return {
        text: `${caster} casts ${spell}${at}.${manual}`,
        detail: `Spell mode: ${prettifyId(event.mode)}.`,
        category: 'magic',
        tone: 'info',
        icon: 'spell',
        ids: [event.caster_id, ...event.target_ids],
      };
    }
    case 'spell_disrupted': {
      const caster = entityName(event.caster_id, ctx);
      const spell = `${spellName(event.spell_id, ctx)}${event.reversed ? ' (reversed)' : ''}`;
      const party = isParty(event.caster_id, ctx);
      const detail = event.reason ? describeRejection({ code: event.reason, params: {} }, ctx) : undefined;
      const text =
        event.code === 'magic.cast.disrupted'
          ? `${possessive(caster)} ${spell} is disrupted, and the spell is lost.`
          : `${possessive(caster)} ${spell} fizzles, and the spell is lost.`;
      return {
        text,
        detail,
        category: 'magic',
        tone: party ? 'bad' : 'good',
        icon: 'spell',
        ids: [event.caster_id],
      };
    }
    case 'declaration_fizzled': {
      const actor = entityName(event.actor_id, ctx);
      const detail = describeRejection({ code: event.reason, params: {} }, ctx);
      const party = isParty(event.actor_id, ctx);
      if (event.code === 'battle.melee.fizzled') {
        const group = event.group_id ? groupName(event.group_id, ctx) : 'the group';
        const why =
          event.reason === 'battle.declaration.no_target'
            ? `finds nothing left to strike in ${group}`
            : event.reason === 'battle.declaration.not_in_front_rank'
              ? `can't get into the front rank against ${group}`
              : `can't reach ${group}`;
        return {
          text: `${actor} ${why} and makes no attack.`,
          detail,
          category: 'battle',
          tone: party ? 'bad' : 'good',
          icon: 'sword',
          ids: [event.actor_id, event.group_id],
        };
      }
      if (event.code === 'magic.device.fizzled') {
        const device = event.item_id ? itemName(event.item_id, ctx) : 'the device';
        return {
          text: `${possessive(actor)} use of ${device} fizzles, and the device keeps its charge.`,
          detail,
          category: 'magic',
          tone: party ? 'bad' : 'good',
          icon: 'wand',
          ids: [event.actor_id],
        };
      }
      return {
        text: `${possessive(actor)} attempt to turn undead fizzles.`,
        detail,
        category: 'magic',
        tone: party ? 'bad' : 'good',
        icon: 'holy',
        ids: [event.actor_id],
      };
    }
    case 'spell_forgotten':
      return {
        text: `${entityName(event.caster_id, ctx)} forgets ${spellName(event.spell_id, ctx)}${event.reversed ? ' (reversed)' : ''}.`,
        category: 'magic',
        tone: 'bad',
        icon: 'book',
        ids: [event.caster_id],
      };
    case 'spell_book_updated':
      return {
        text: `${entityName(event.caster_id, ctx)} adds ${spellName(event.spell_id, ctx)} to their spell book.`,
        category: 'magic',
        tone: 'good',
        icon: 'book',
        ids: [event.caster_id],
      };
    case 'undead_turned': {
      const caster = entityName(event.caster_id, ctx);
      const text =
        event.code === 'magic.turning.turned'
          ? `${caster} presents the holy symbol, and the undead are turned.`
          : event.code === 'magic.turning.destroyed'
            ? `${caster} presents the holy symbol, and the undead are destroyed.`
            : `${caster} presents the holy symbol, but the turning fails.`;
      const pool =
        event.hd_pool !== null && event.hd_pool !== undefined
          ? ` Affected up to ${count(event.hd_pool, 'Hit Die', 'Hit Dice')}.`
          : '';
      const types = event.types
        .map((entry) => {
          const label = prettifyId(entry.template_id);
          const needed =
            entry.threshold !== null && entry.threshold !== undefined ? `, needed ${entry.threshold}` : '';
          return `${label}: ${TURNING_OUTCOMES[entry.outcome] ?? prettifyId(entry.outcome)}${needed}`;
        })
        .join('; ');
      const detail = `Rolled ${event.roll} on 2d6.${pool}${types ? ` ${types}.` : ''}`;
      return {
        text,
        detail,
        category: 'magic',
        tone: event.code === 'magic.turning.failed' ? 'bad' : 'good',
        icon: 'holy',
        ids: [event.caster_id, ...event.affected_ids],
      };
    }
    case 'magic_dispelled': {
      const caster = entityName(event.caster_id, ctx);
      const released = event.released_effect_ids.length;
      const surviving = event.surviving_effect_ids.length;
      const base = `${caster} dispels ${countA(released, 'effect')}`;
      const text =
        surviving > 0
          ? `${base}, but ${count(surviving, 'effect')} survive${surviving === 1 ? 's' : ''}.`
          : `${base}.`;
      return {
        text,
        category: 'magic',
        tone: 'info',
        icon: 'spell',
        ids: [event.caster_id],
        amount: released,
      };
    }

    // Movement and exploration ---------------------------------------------------------------------------------
    case 'party_moved': {
      const base =
        event.code === 'exploration.party.turned'
          ? `The party turns to face ${event.facing}.`
          : `The party moves to (${event.x}, ${event.y}), ${facingLabel(event.facing)}.`;
      return {
        text: withNarrative(base, event.narrative),
        category: 'movement',
        tone: 'neutral',
        icon: event.code === 'exploration.party.turned' ? 'turn' : 'step',
      };
    }
    case 'party_reordered':
      return {
        text: `The marching order is now ${joinList(event.order.map((id) => memberName(id, ctx)))}.`,
        category: 'movement',
        tone: 'neutral',
        icon: 'party',
        ids: event.order,
      };
    case 'location_entered':
      return describeLocation(event, ctx);
    case 'door': {
      const side = doorSide(event.direction);
      const who = event.character_id ? memberName(event.character_id, ctx) : undefined;
      const place = `Door cell (${event.x}, ${event.y}), side ${event.direction}.`;
      const ids = [event.character_id];
      switch (event.code) {
        case 'exploration.door.opened':
          return {
            text: withNarrative(`The door to the ${side} opens.`, event.narrative),
            detail: place,
            category: 'door',
            tone: 'neutral',
            icon: 'door',
            ids,
          };
        case 'exploration.door.closed':
          return {
            text: `The door to the ${side} closes.`,
            detail: place,
            category: 'door',
            tone: 'neutral',
            icon: 'door',
            ids,
          };
        case 'exploration.door.forced':
          return {
            text: withNarrative(
              `${who ?? 'A party member'} forces the door to the ${side} open.`,
              event.narrative,
            ),
            detail: place,
            category: 'door',
            tone: 'good',
            icon: 'door',
            ids,
          };
        case 'exploration.door.stuck':
          return {
            text: who
              ? `The door to the ${side} won't budge, and ${who} strains in vain.`
              : `The door to the ${side} won't budge.`,
            detail: place,
            category: 'door',
            tone: 'bad',
            icon: 'door',
            ids,
          };
        case 'exploration.door.wedged':
          return {
            text: `An iron spike wedges the door to the ${side}.`,
            detail: place,
            category: 'door',
            tone: 'neutral',
            icon: 'door',
            ids,
          };
        case 'exploration.door.swung_shut':
          return {
            text: 'A door swings shut behind the party.',
            detail: place,
            category: 'door',
            tone: 'neutral',
            icon: 'door',
            ids,
          };
        case 'exploration.door.unlocked':
          return {
            text: `${who ?? 'A party member'} unlocks the door to the ${side}.`,
            detail: place,
            category: 'door',
            tone: 'good',
            icon: 'lock',
            ids,
          };
        default:
          return unknownCode(event);
      }
    }
    case 'listened': {
      const who = memberName(event.character_id, ctx);
      const side = doorSide(event.direction);
      const heard = event.code === 'exploration.listen.heard';
      return {
        text: heard
          ? `${who} hears something beyond the ${side} door.`
          : `${who} hears nothing beyond the ${side} door.`,
        category: 'exploration',
        tone: heard ? 'info' : 'neutral',
        icon: 'ear',
        ids: [event.character_id],
      };
    }
    case 'detection_rolled': {
      const action = DETECTION_ACTIONS[event.kind];
      const detail = dieAgainst(event.kind, event.roll, event.chance);
      if (event.kind === 'trap_spring' || !action) {
        return {
          text: event.passed
            ? "The trap's chance to spring comes up, and it goes off."
            : "The trap's chance to spring comes up, and it stays quiet.",
          detail,
          category: 'exploration',
          tone: 'info',
          icon: 'trap',
          ids: [event.character_id],
        };
      }
      const who = event.character_id ? memberName(event.character_id, ctx) : 'Someone';
      return {
        text: `${who} ${action.verb} ${event.passed ? action.pass : action.fail}.`,
        detail,
        category: 'exploration',
        tone: 'info',
        icon: event.kind === 'listening' ? 'ear' : event.kind === 'open_locks' ? 'lock' : 'search',
        ids: [event.character_id],
      };
    }
    case 'search_completed': {
      const who = memberName(event.character_id, ctx);
      const noun = searchKindNoun(event.kind);
      const found = event.found.map((reference) => foundReference(reference, ctx));
      const action =
        event.kind === 'treasure_traps' ? 'checks the treasure for traps' : `searches for ${noun}`;
      return {
        text:
          found.length === 0
            ? `${who} ${action} and finds nothing.`
            : `${who} ${action} and finds ${joinList(found)}.`,
        category: 'exploration',
        tone: found.length === 0 ? 'neutral' : 'good',
        icon: 'search',
        ids: [event.character_id],
        amount: found.length,
      };
    }
    case 'trap': {
      const who = event.character_id ? memberName(event.character_id, ctx) : undefined;
      const parts = event.trap_ref.split(':');
      const place = parts.length === 3 && parts[2] ? parts[2] : undefined;
      const ids = [event.character_id];
      switch (event.code) {
        case 'exploration.trap.sprung':
          return {
            text: who ? `A trap springs on ${who}!`.replace('!', '.') : 'A trap springs.',
            detail: place ? `Trap: ${prettifyId(place)}.` : undefined,
            category: 'exploration',
            tone: 'danger',
            icon: 'trap',
            ids,
          };
        case 'exploration.trap.safe':
          return {
            text: 'The known trap does not go off.',
            category: 'exploration',
            tone: 'good',
            icon: 'trap',
            ids,
          };
        case 'exploration.trap.found': {
          const beyond = event.direction ? ` beyond the ${doorSide(event.direction)} door` : '';
          return {
            text: `${who ?? 'The party'} finds a trap${beyond}.`,
            category: 'exploration',
            tone: 'good',
            icon: 'trap',
            ids,
          };
        }
        case 'exploration.trap.removed':
          return {
            text: `${who ?? 'The party'} removes the trap.`,
            category: 'exploration',
            tone: 'good',
            icon: 'trap',
            ids,
          };
        case 'exploration.trap.removal_failed':
          return {
            text: `${who ?? 'The party'} fails to remove the trap.`,
            category: 'exploration',
            tone: 'bad',
            icon: 'trap',
            ids,
          };
        default:
          return unknownCode(event);
      }
    }
    case 'item_acquired': {
      const who = memberName(event.character_id, ctx);
      const verb =
        event.origin === 'purchase'
          ? 'buys'
          : event.origin === 'grant'
            ? 'receives'
            : event.origin === 'treasure'
              ? 'takes'
              : 'gets';
      return {
        text: `${who} ${verb} ${goodsText(event.item_ids, event.coins_gp_value, ctx)}.`,
        category: event.origin === 'treasure' ? 'treasure' : 'item',
        tone: 'good',
        icon: event.item_ids.length === 0 ? 'coins' : 'chest',
        ids: [event.character_id],
        amount: event.coins_gp_value > 0 ? event.coins_gp_value : undefined,
      };
    }
    case 'item_consumed':
      return {
        text: `${memberName(event.character_id, ctx)} uses up ${itemName(event.item_id, ctx)}.`,
        category: 'item',
        tone: 'neutral',
        icon: 'chest',
        ids: [event.character_id],
      };
    case 'items_dropped':
      return {
        text: `${memberName(event.character_id, ctx)} drops ${goodsText(event.item_ids, event.coins_gp_value, ctx)}.`,
        category: 'item',
        tone: 'neutral',
        icon: 'chest',
        ids: [event.character_id],
        amount: event.coins_gp_value > 0 ? event.coins_gp_value : undefined,
      };
    case 'items_left_behind':
      return {
        text: `The party can't carry it all, so ${goodsText(event.item_ids, event.coins_gp_value, ctx)} stays where it lies.`,
        category: 'item',
        tone: 'info',
        icon: 'chest',
        amount: event.coins_gp_value > 0 ? event.coins_gp_value : undefined,
      };
    case 'items_given':
      return {
        text: `${memberName(event.character_id, ctx)} gives ${goodsText(event.item_ids, event.coins_gp_value, ctx)} to ${memberName(event.recipient_id, ctx)}.`,
        category: 'item',
        tone: 'neutral',
        icon: 'chest',
        ids: [event.character_id, event.recipient_id],
        amount: event.coins_gp_value > 0 ? event.coins_gp_value : undefined,
      };
    case 'light': {
      const holder = event.character_id ? memberName(event.character_id, ctx) : undefined;
      const noun = sourceNoun(event.source);
      switch (event.code) {
        case 'exploration.light.lit':
          return {
            text: `${holder ?? 'Someone'} lights ${withArticle(noun)}.`,
            category: 'light',
            tone: 'good',
            icon: 'torch',
            ids: [event.character_id],
          };
        case 'exploration.light.extinguished':
          return {
            text: `${holder ?? 'Someone'} puts out the ${noun}.`,
            category: 'light',
            tone: 'neutral',
            icon: 'torch',
            ids: [event.character_id],
          };
        case 'exploration.light.failed':
          return {
            text: `${holder ?? 'Someone'} can't get a flame from the tinder box.`,
            category: 'light',
            tone: 'bad',
            icon: 'torch',
            ids: [event.character_id],
          };
        case 'exploration.light.expired':
          return {
            text: holder ? `The ${noun} that ${holder} carries burns out.` : `The ${noun} burns out.`,
            category: 'light',
            tone: 'bad',
            icon: 'torch',
            ids: [event.character_id],
          };
        default:
          return unknownCode(event);
      }
    }
    case 'rested': {
      const length =
        event.kind === 'turn'
          ? 'one turn'
          : event.kind === 'night'
            ? 'a night'
            : event.kind === 'day'
              ? 'a full day'
              : restKindLabel(event.kind).toLowerCase();
      if (event.code === 'exploration.rest.interrupted') {
        return {
          text: `The party's rest is interrupted (it planned ${length}).`,
          category: 'exploration',
          tone: 'bad',
          icon: 'rest',
        };
      }
      return { text: `The party rests for ${length}.`, category: 'exploration', tone: 'good', icon: 'rest' };
    }
    case 'fatigue':
      return event.code === 'exploration.fatigue.gained'
        ? {
            text: 'The party is fatigued and fights at -1 to attack and damage until it rests.',
            category: 'exploration',
            tone: 'bad',
            icon: 'rest',
          }
        : { text: 'The party recovers from fatigue.', category: 'exploration', tone: 'good', icon: 'rest' };
    case 'provisions': {
      const who = memberName(event.character_id, ctx);
      const supply =
        event.kind === 'water' ? 'water' : event.kind === 'food' ? 'food' : prettifyId(event.kind);
      if (event.code === 'exploration.provisions.consumed') {
        return {
          text: `${who} ${event.kind === 'water' ? 'drinks' : 'eats'} the day's ${supply}.`,
          category: 'exploration',
          tone: 'neutral',
          icon: 'food',
          ids: [event.character_id],
        };
      }
      return {
        text: `${who} has no ${supply} for the day.`,
        category: 'exploration',
        tone: 'bad',
        icon: 'food',
        ids: [event.character_id],
      };
    }
    case 'wandering_check': {
      const detail =
        event.roll === null || event.roll === undefined
          ? `No die rolled (chance ${event.chance} in 6).`
          : `Rolled ${event.roll} on d6 against ${event.chance} in 6.`;
      return {
        text: event.encounter ? 'Wandering monsters appear.' : 'No wandering monsters come.',
        detail,
        category: 'encounter',
        tone: event.encounter ? 'danger' : 'info',
        icon: 'dice',
      };
    }

    // Encounters --------------------------------------------------------------------------------------------------
    case 'encounter_started': {
      const plural = event.monster_name_plural || pluralize(event.monster_name);
      const what = event.count === 1 ? withArticle(event.monster_name) : `${event.count} ${plural}`;
      let text = `The party meets ${what}, ${formatFeet(event.distance_feet)} away.`;
      if (event.party_surprised && event.monsters_surprised) text += ' Both sides are surprised.';
      else if (event.party_surprised) text += ' The party is surprised.';
      else if (event.monsters_surprised) text += ' The monsters are surprised.';
      return {
        text,
        category: 'encounter',
        tone: event.party_surprised && !event.monsters_surprised ? 'danger' : 'info',
        icon: 'monsters',
        amount: event.count,
      };
    }
    case 'encounter_group_joined': {
      const plural = event.label_plural || pluralize(event.label);
      const what = event.count === 1 ? withArticle(event.label) : `${event.count} ${plural}`;
      return {
        text: `${capitalizeFirst(what)} ${event.count === 1 ? 'joins' : 'join'} the encounter, ${formatFeet(event.distance_feet)} away.`,
        category: 'encounter',
        tone: 'danger',
        icon: 'monsters',
        ids: [event.group_id],
        amount: event.count,
      };
    }
    case 'surprise_rolled': {
      const side = event.side === 'party' ? 'The party' : 'The monsters';
      const verb = event.side === 'party' ? 'is' : 'are';
      const detail =
        event.roll === null || event.roll === undefined
          ? 'No roll was needed.'
          : `Rolled ${event.roll} on d6, surprised on 1-${event.threshold}.`;
      return {
        text: `${side} ${verb}${event.surprised ? '' : ' not'} surprised.`,
        detail,
        category: 'encounter',
        tone: 'info',
        icon: 'dice',
      };
    }
    case 'stance_changed': {
      const tone: EventTone =
        event.stance === 'attacks' || event.stance === 'hostile'
          ? 'danger'
          : event.stance === 'friendly'
            ? 'good'
            : 'info';
      return { text: stanceSentence(event.stance), category: 'encounter', tone, icon: 'monsters' };
    }
    case 'evasion':
      return event.code === 'encounter.evasion.succeeded'
        ? { text: 'The party slips away.', category: 'encounter', tone: 'good', icon: 'run' }
        : { text: 'The monsters give chase.', category: 'encounter', tone: 'danger', icon: 'run' };
    case 'pursuit': {
      switch (event.code) {
        case 'encounter.pursuit.distracted':
          return {
            text: 'The monsters stop for what the party dropped.',
            detail: `Chase round ${event.round}.`,
            category: 'encounter',
            tone: 'good',
            icon: 'run',
            amount: event.round,
          };
        case 'encounter.pursuit.escaped':
          return {
            text: 'The party escapes the chase.',
            detail: `Chase round ${event.round}.`,
            category: 'encounter',
            tone: 'good',
            icon: 'run',
            amount: event.round,
          };
        case 'encounter.pursuit.caught':
          return {
            text: 'The monsters catch the party.',
            detail: `Chase round ${event.round}.`,
            category: 'encounter',
            tone: 'danger',
            icon: 'run',
            amount: event.round,
          };
        case 'encounter.pursuit.round':
          return {
            text: `The chase goes on, with the party ${formatFeet(event.gap_feet)} ahead.`,
            detail: `Chase round ${event.round}.`,
            category: 'encounter',
            tone: 'info',
            icon: 'run',
            amount: event.gap_feet,
          };
        default:
          return unknownCode(event);
      }
    }
    case 'exhaustion':
      return event.code === 'encounter.exhaustion.gained'
        ? {
            text: 'The party is exhausted from running and fights at -2 to attack, damage, and armour class.',
            category: 'encounter',
            tone: 'bad',
            icon: 'run',
          }
        : {
            text: 'The party catches its breath, and the exhaustion fades.',
            category: 'encounter',
            tone: 'good',
            icon: 'rest',
          };
    case 'loot_dropped':
      return {
        text: `The fallen leave behind ${goodsText(event.item_ids, event.coins_gp_value, ctx)}.`,
        category: 'treasure',
        tone: 'good',
        icon: 'chest',
        amount: event.coins_gp_value > 0 ? event.coins_gp_value : undefined,
      };
    case 'encounter_ended':
      return {
        text: 'The encounter ends.',
        detail: encounterOutcomeSentence(event.outcome),
        category: 'encounter',
        tone: event.outcome === 'victory' || event.outcome === 'turned' ? 'good' : 'info',
        icon: 'flag',
      };

    // Battle ------------------------------------------------------------------------------------------------------
    case 'battle_started':
      return { text: 'Battle is joined.', category: 'battle', tone: 'danger', icon: 'sword' };
    case 'battle_round':
      return {
        text: `Round ${event.round} begins.`,
        category: 'battle',
        tone: 'neutral',
        icon: 'clock',
        amount: event.round,
      };
    case 'spell_declared':
      return {
        text: `${entityName(event.caster_id, ctx)} begins casting ${spellName(event.spell_id, ctx)}${event.reversed ? ' (reversed)' : ''}.`,
        category: 'magic',
        tone: 'info',
        icon: 'spell',
        ids: [event.caster_id],
      };
    case 'group_moved':
      return {
        text: `${capitalizeFirst(groupName(event.group_id, ctx))} ${groupIsPlural(event.group_id, ctx) ? 'are' : 'is'} now ${formatFeet(event.distance_feet)} away.`,
        category: 'battle',
        tone: 'neutral',
        icon: 'arrow',
        ids: [event.group_id],
        amount: event.distance_feet,
      };
    case 'member_moved':
      return {
        text: `${memberName(event.character_id, ctx)} ${battleMoveVerb(event.move)} to ${formatFeet(event.distance_feet)} from ${groupName(event.group_id, ctx)}.`,
        category: 'battle',
        tone: 'neutral',
        icon: 'arrow',
        ids: [event.character_id, event.group_id],
        amount: event.distance_feet,
      };
    case 'member_withdrew': {
      const who = memberName(event.character_id, ctx);
      const other = memberName(event.replacement_id, ctx);
      return {
        text:
          event.code === 'battle.member.retreated'
            ? `${who} turns and retreats, trading places with ${other}.`
            : `${who} falls back, trading places with ${other}.`,
        category: 'battle',
        tone: 'neutral',
        icon: 'run',
        ids: [event.character_id, event.replacement_id],
      };
    }
    case 'monster_fled':
      return {
        text: `${capitalizeFirst(groupName(event.group_id, ctx))} ${groupIsPlural(event.group_id, ctx) ? 'flee' : 'flees'}.`,
        category: 'battle',
        tone: 'good',
        icon: 'run',
        ids: [event.group_id],
      };
    case 'monsters_left_behind': {
      const known = ctx.groups[event.group_id];
      const noun = known
        ? event.count === 1
          ? known.label
          : known.labelPlural
        : event.count === 1
          ? 'monster'
          : 'monsters';
      return {
        text: `${event.count} helpless ${noun} ${event.count === 1 ? 'is' : 'are'} left behind.`,
        category: 'battle',
        tone: 'good',
        icon: 'monsters',
        ids: [event.group_id, event.source_group_id],
        amount: event.count,
      };
    }
    case 'monster_defeated': {
      const name = entityName(event.monster_id, ctx);
      const verb = event.outcome === 'routed' ? 'is routed' : 'is slain';
      return {
        text: `${name} ${verb}.`,
        detail: event.xp > 0 ? `Worth ${formatInteger(event.xp)} experience points.` : undefined,
        category: 'battle',
        tone: 'good',
        icon: 'skull',
        ids: [event.monster_id],
        amount: event.xp,
      };
    }
    case 'battle_ended':
      switch (event.code) {
        case 'battle.ended.victory':
          return { text: 'The party wins the battle!', category: 'battle', tone: 'good', icon: 'flag' };
        case 'battle.ended.fled':
          return { text: 'The party flees the battle.', category: 'battle', tone: 'info', icon: 'run' };
        case 'battle.ended.defeat':
          return { text: 'The party is defeated.', category: 'battle', tone: 'danger', icon: 'skull' };
        default:
          return unknownCode(event);
      }

    // Treasure and items ---------------------------------------------------------------------------------------
    case 'hoard_generated': {
      const bits: string[] = [];
      if (event.coins_gp_value > 0) bits.push(`${formatGold(event.coins_gp_value)} in coin`);
      if (event.valuable_ids.length > 0) bits.push(count(event.valuable_ids.length, 'valuable'));
      if (event.magic_item_ids.length > 0) bits.push(count(event.magic_item_ids.length, 'magic item'));
      const types =
        event.treasure_types.length > 0 ? `Treasure types: ${event.treasure_types.join(', ')}.` : undefined;
      return {
        text: `Treasure is rolled for ${cacheName(event.cache_ref)}: ${bits.length === 0 ? 'nothing' : joinList(bits)}.`,
        detail: types,
        category: 'treasure',
        tone: 'info',
        icon: 'chest',
        amount: event.coins_gp_value,
      };
    }
    case 'item_used': {
      const who = memberName(event.character_id, ctx);
      const item = itemName(event.instance_id, ctx);
      const manual = event.manual.length > 0 ? ` ${event.manual.join(' ')}` : '';
      const ids = [event.character_id, event.target_id];
      switch (event.code) {
        case 'items.potion.drunk':
          return {
            text: event.target_id
              ? `${who} gives ${memberName(event.target_id, ctx)} ${item} to drink.${manual}`
              : `${who} drinks ${item}.${manual}`,
            category: 'item',
            tone: 'info',
            icon: 'potion',
            ids,
          };
        case 'items.potion.mixed':
          return {
            text: `${event.target_id ? memberName(event.target_id, ctx) : who} mixes potions, the effects cancel out, and sickness takes hold.${manual}`,
            category: 'item',
            tone: 'bad',
            icon: 'potion',
            ids,
          };
        case 'items.scroll.read':
          return {
            text: `${who} reads ${item}, and the words fade.${manual}`,
            category: 'item',
            tone: 'info',
            icon: 'scroll',
            ids,
          };
        case 'items.scroll.cursed':
          return {
            text: `${who} reads ${item}, and a curse takes hold.${manual}`,
            category: 'item',
            tone: 'bad',
            icon: 'scroll',
            ids,
          };
        case 'items.device.activated':
          return { text: `${who} uses ${item}.${manual}`, category: 'item', tone: 'info', icon: 'wand', ids };
        default:
          return unknownCode(event);
      }
    }
    case 'item_identified': {
      const kind = unidentifiedNoun(event.template_id);
      const real = withArticle(templateName(event.template_id, ctx));
      return { text: `The ${kind} turns out to be ${real}.`, category: 'item', tone: 'good', icon: 'star' };
    }
    case 'curse_revealed': {
      const who = memberName(event.character_id, ctx);
      const item = (ctx.items[event.instance_id] ?? templateName(event.template_id, ctx))
        .replace(/,?\s*cursed\b/i, '')
        .trim();
      return {
        text: `${possessive(who)} ${item} is cursed, and ${who} can't get rid of it.`,
        category: 'item',
        tone: 'bad',
        icon: 'warning',
        ids: [event.character_id],
      };
    }
    case 'npc_party_spawned': {
      const roster = event.npc_ids.map(
        (_id, index) => `${classLabel(event.class_ids[index] ?? '')} ${event.levels[index] ?? 1}`,
      );
      return {
        text: `An NPC party (${prettifyId(event.party_kind)}, ${event.alignment}) takes the field: ${joinList(roster)}.`,
        category: 'referee',
        tone: 'info',
        icon: 'monsters',
        ids: event.npc_ids,
        amount: event.npc_ids.length,
      };
    }

    // Town, experience, time, and the session ------------------------------------------------------------------
    case 'adventure_xp_award':
      return {
        text: `The adventure earns ${formatInteger(event.monster_xp)} XP from monsters and ${formatInteger(event.treasure_xp)} XP from treasure, which gives each of ${count(event.survivors.length, 'survivor')} ${formatInteger(event.share)} XP.`,
        category: 'xp',
        tone: 'good',
        icon: 'star',
        ids: event.survivors,
        amount: event.share,
      };
    case 'treasure_sold':
      return {
        text: `${memberName(event.character_id, ctx)} sells ${countA(event.instance_ids.length, 'valuable')} for ${formatGold(event.gp_value)}.`,
        category: 'town',
        tone: 'good',
        icon: 'coins',
        ids: [event.character_id],
        amount: event.gp_value,
      };
    case 'healing_purchased': {
      const who = memberName(event.character_id, ctx);
      const service = healingServiceLabel(event.service).toLowerCase();
      let detail: string | undefined;
      if (event.payers.length > 1) {
        detail = `Paid by ${joinList(event.payers.map((payer, index) => `${memberName(payer, ctx)} (${formatGold(event.payments_gp[index] ?? 0)})`))}.`;
      }
      return {
        text: `${who} buys ${service} at the temple for ${formatGold(event.cost_gp)}.`,
        detail,
        category: 'town',
        tone: 'info',
        icon: 'heart',
        ids: [event.character_id],
        amount: event.cost_gp,
      };
    }
    case 'flag_set':
      return {
        text: `The referee sets the flag ${event.key} to ${String(event.value)}.`,
        category: 'referee',
        tone: 'info',
        icon: 'flag',
      };
    case 'monsters_spawned': {
      const label = ctx.monsters[event.monster_ids[0] ?? '']?.label ?? templateLabel(event.template_id);
      const n = event.monster_ids.length;
      return {
        text: `The referee spawns ${n === 1 ? withArticle(label) : `${n} ${pluralize(label)}`}.`,
        category: 'referee',
        tone: 'info',
        icon: 'monsters',
        ids: event.monster_ids,
        amount: n,
      };
    }
    case 'xp_awarded': {
      const who = memberName(event.character_id, ctx);
      const adjusted =
        event.award !== event.modified_award
          ? `Base award ${formatInteger(event.award)}, adjusted to ${formatInteger(event.modified_award)}.`
          : undefined;
      return {
        text: `${who} gains ${formatInteger(event.modified_award)} experience points.`,
        detail: adjusted,
        category: 'xp',
        tone: 'good',
        icon: 'star',
        ids: [event.character_id],
        amount: event.modified_award,
      };
    }
    case 'leveled_up': {
      const who = memberName(event.character_id, ctx);
      const title = event.title ? ` (${event.title})` : '';
      const detailParts: string[] = [];
      if (event.hp_roll !== null && event.hp_roll !== undefined)
        detailParts.push(
          `Hit die rolled ${event.hp_roll}${event.con_applied ? ', adjusted for Constitution' : ''}.`,
        );
      else detailParts.push('This level adds a flat number of hit points.');
      return {
        text: `${who} reaches level ${event.level_after}${title} and gains ${count(event.hp_gained, 'hit point')}.`,
        detail: detailParts.join(' '),
        category: 'xp',
        tone: 'good',
        icon: 'level',
        ids: [event.character_id],
        amount: event.level_after,
      };
    }
    case 'time_advanced':
      return {
        text: `The referee moves the clock forward ${formatDuration(event.n, normalizeUnit(event.unit))}.`,
        detail: `The clock reads ${formatGameClock(event.rounds_total)} (round ${formatInteger(event.rounds_total)}).`,
        category: 'time',
        tone: 'info',
        icon: 'clock',
        amount: event.n,
      };
    case 'game_over':
      return {
        text: 'The party has fallen, and the game is over.',
        category: 'system',
        tone: 'danger',
        icon: 'skull',
      };
    case 'dice_rolled':
      return {
        text: `The referee rolls ${formatDice(event.expression)} and gets ${event.total}.`,
        detail: formatDiceTotal(event.expression, event.rolls, event.total),
        category: 'referee',
        tone: 'info',
        icon: 'dice',
        amount: event.total,
      };
    case 'trigger_fired':
      return {
        text: withNarrative(`The adventure trigger "${event.trigger_id}" fires.`, event.narrative),
        category: 'referee',
        tone: 'info',
        icon: 'flag',
      };
    case 'journal_entry_added':
      return {
        text: `Journal entry: ${event.text}`,
        detail: `Written at ${formatGameClock(event.rounds)}.`,
        category: 'journal',
        tone: 'info',
        icon: 'journal',
      };
    case 'note_recorded':
      return { text: `Referee note: ${event.text}`, category: 'referee', tone: 'info', icon: 'journal' };
    case 'quest_activated':
      return {
        text: withNarrative(`New quest: ${event.name}.`, event.narrative),
        category: 'quest',
        tone: 'info',
        icon: 'quest',
      };
    case 'objective_revealed': {
      const quest = event.quest_name || prettifyId(event.quest_id);
      const objective = event.name || prettifyId(event.objective_id);
      return {
        text: withNarrative(`New objective in ${quest}: ${objective}.`, event.narrative),
        category: 'quest',
        tone: 'info',
        icon: 'quest',
      };
    }
    case 'objective_completed': {
      const quest = event.quest_name || prettifyId(event.quest_id);
      const objective = event.name || prettifyId(event.objective_id);
      return {
        text: withNarrative(`Objective done in ${quest}: ${objective}.`, event.narrative),
        category: 'quest',
        tone: 'good',
        icon: 'quest',
      };
    }
    case 'quest_completed':
      return {
        text: withNarrative(`Quest complete: ${event.name}.`, event.narrative),
        category: 'quest',
        tone: 'good',
        icon: 'quest',
      };
    case 'adventure_completed': {
      const name = event.name || prettifyId(event.quest_id);
      return {
        text: withNarrative(`${name} is complete, and the party wins the adventure!`, event.narrative),
        category: 'quest',
        tone: 'good',
        icon: 'star',
      };
    }
    case 'items_removed':
      return {
        text: `${memberName(event.character_id, ctx)} loses ${goodsText(event.item_ids, event.coins_gp_value, ctx)}.`,
        category: 'item',
        tone: 'bad',
        icon: 'chest',
        ids: [event.character_id],
        amount: event.coins_gp_value > 0 ? event.coins_gp_value : undefined,
      };
    case 'member_added':
      return {
        text: `${event.name}, a level ${event.level} ${classLabel(event.class_id).toLowerCase()}, joins the party.`,
        category: 'system',
        tone: 'good',
        icon: 'party',
        ids: [event.character_id],
      };
    case 'member_removed': {
      const taker = event.given_to ? ` ${memberName(event.given_to, ctx)} takes their belongings.` : '';
      return {
        text: `${event.name} leaves the party.${taker}`,
        category: 'system',
        tone: 'info',
        icon: 'party',
        ids: [event.character_id, event.given_to],
      };
    }
    default: {
      const unreachable: never = event;
      return { text: fallbackEventText(unreachable), category: 'system', tone: 'neutral', icon: 'info' };
    }
  }
}

const TURNING_OUTCOMES: Record<string, string> = {
  turn: 'turned',
  destroy: 'destroyed',
  fail: 'not turned',
  unaffected: 'not undead',
};

function countA(n: number, noun: string): string {
  return n === 1 ? withArticle(noun) : count(n, noun);
}

function groupIsPlural(groupId: string, ctx: TextContext): boolean {
  const known = ctx.groups[groupId];
  return known ? known.count !== 1 : true;
}

function normalizeUnit(unit: string): 'round' | 'turn' | 'day' {
  return unit === 'turn' || unit === 'day' ? unit : 'round';
}

function cacheName(ref: string): string {
  return /^cache-\d+$/.test(ref) ? 'a treasure cache' : `the ${prettifyId(ref)} cache`;
}

function templateName(templateId: string, ctx: TextContext): string {
  return ctx.items[templateId] ?? magicItemTemplateName(templateId) ?? lowerFirst(prettifyId(templateId));
}

const UNIDENTIFIED_NOUNS: Record<string, string> = {
  armour: 'suit of armour',
  misc: 'magic item',
  potion: 'potion',
  ring: 'ring',
  rod: 'rod',
  staff: 'staff',
  wand: 'wand',
  scroll: 'scroll',
  sword: 'sword',
  weapon: 'weapon',
};

/** What a party sees before an item is identified: `potion`, `scroll`, `magic item`. */
function unidentifiedNoun(templateId: string): string {
  const category = magicItemCategory(templateId);
  return category ? (UNIDENTIFIED_NOUNS[category] ?? 'magic item') : 'magic item';
}

function templateLabel(templateId: string): string {
  return lowerFirst(prettifyId(templateId));
}

function theName(name: string): string {
  return /^the\s/i.test(name) ? lowerFirst(name) : `the ${lowerFirst(name)}`;
}

function describeLocation(
  event: Extract<GameEvent, { event_type: 'location_entered' }>,
  ctx: TextContext,
): Parts {
  const level = event.level_number;
  const via = event.via ?? '';
  const verbs: Record<string, string> = {
    stairs_down: 'descends',
    stairs_up: 'climbs',
    trapdoor: 'falls through a trapdoor',
    chute: 'slides down a chute',
    passage: 'walks through a passage',
    trap: 'is swept away by a trap',
  };
  switch (event.location_kind) {
    case 'town': {
      const town = ctx.townName ?? 'town';
      return {
        text: withNarrative(`The party arrives in ${town}.`, event.narrative),
        category: 'town',
        tone: 'info',
        icon: 'town',
      };
    }
    case 'area': {
      const name = theName(areaName(event.location_id, ctx, event.dungeon_id, level));
      const place =
        level !== null && level !== undefined
          ? `Level ${level}${event.dungeon_id ? ` of ${theName(dungeonName(event.dungeon_id, ctx))}` : ''}.`
          : undefined;
      return {
        text: withNarrative(`The party enters ${name}.`, event.narrative),
        detail: place,
        category: 'movement',
        tone: 'neutral',
        icon: 'step',
      };
    }
    case 'level': {
      const dungeon = theName(dungeonName(event.location_id, ctx));
      const how = verbs[via] ?? 'goes';
      return {
        text: withNarrative(`The party ${how} to level ${level} of ${dungeon}.`, event.narrative),
        category: 'movement',
        tone: 'neutral',
        icon: 'stairs',
      };
    }
    default: {
      const dungeon = theName(dungeonName(event.location_id, ctx));
      const levelText = level !== null && level !== undefined ? `, level ${level}` : '';
      const how =
        via === 'placed'
          ? 'is placed in'
          : via === 'stairs_down' || via === 'stairs_up'
            ? `${verbs[via]} into`
            : verbs[via]
              ? `${verbs[via]} into`
              : 'enters';
      return {
        text: withNarrative(`The party ${how} ${dungeon}${levelText}.`, event.narrative),
        category: 'movement',
        tone: 'neutral',
        icon: 'stairs',
      };
    }
  }
}

// Whole outcomes ---------------------------------------------------------------------------------------------

export interface DescribeEventsOptions {
  /** Join an attack with the damage it dealt. Defaults to true. */
  mergeAttacks?: boolean;
  /** Drop a `dead` condition when a death event for the same creature follows it. Defaults to true. */
  dropRedundant?: boolean;
  /** Collapse a run of wandering-monster checks that found nothing into one line. Defaults to true. */
  collapseChecks?: boolean;
  /** Keep only events with this visibility. Defaults to all events. */
  only?: 'player' | 'referee';
  /** bxapi's own messages, one per event in order, used as the fallback for event types this module doesn't know. */
  messages?: readonly string[];
}

/** True when an event is visible to players. */
export function isPlayerVisible(event: { visibility?: string }): boolean {
  return event.visibility !== 'referee';
}

/**
 * Describe the events of a command outcome as lines of the game log.
 *
 * Before it describes anything, it learns names from the whole list: a monster that is defeated later in the list
 * names that monster's earlier attacks. It then joins each successful attack with the damage that follows it,
 * `Brenna hits a goblin for 5 damage.`, and drops a `dead` condition that a death event repeats.
 */
export function describeEvents(
  events: ReadonlyArray<GameEvent | LooseEvent>,
  ctx: TextContext,
  options: DescribeEventsOptions = {},
): EventLine[] {
  const merge = options.mergeAttacks ?? true;
  const dropRedundant = options.dropRedundant ?? true;
  const collapse = options.collapseChecks ?? true;
  const list = options.only
    ? events.filter((event) => (options.only === 'player' ? isPlayerVisible(event) : !isPlayerVisible(event)))
    : events;
  const learned = extendContextWithEvents(ctx, list as readonly LearnableEvent[]);
  const lines: EventLine[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const event = list[index];
    if (event === undefined) continue;
    if (dropRedundant && event.event_type === 'condition_removed' && event.condition === 'turned') {
      const target = event.target_id;
      if (
        list
          .slice(0, index)
          .some((earlier) => earlier.event_type === 'monster_defeated' && earlier.monster_id === target)
      )
        continue;
    }
    if (
      dropRedundant &&
      (event.event_type === 'death' ||
        (event.event_type === 'condition_gained' && event.condition === 'dead'))
    ) {
      const target = event.target_id;
      const drained = list
        .slice(Math.max(0, index - 4), index)
        .some(
          (earlier) =>
            earlier.event_type === 'level_drained' &&
            earlier.code === 'combat.drain.slain' &&
            earlier.target_id === target,
        );
      if (drained) continue;
    }
    if (dropRedundant && event.event_type === 'condition_gained' && event.condition === 'dead') {
      const target = event.target_id;
      const followed = list
        .slice(index + 1, index + 4)
        .some((later) => later.event_type === 'death' && later.target_id === target);
      if (followed) continue;
    }
    if (collapse && isQuietCheck(event)) {
      let end = index;
      while (end + 1 < list.length && isQuietCheck(list[end + 1])) end += 1;
      const checks = end - index + 1;
      const line = describeEvent(event, learned);
      if (checks > 1) {
        line.text = `No wandering monsters come in ${checks} checks.`;
        delete line.detail;
        line.amount = checks;
      }
      lines.push(line);
      index = end;
      continue;
    }
    if (merge && event.event_type === 'attack_rolled' && event.code !== 'combat.attack.missed') {
      const next = list[index + 1];
      if (
        next &&
        next.event_type === 'damage_absorbed' &&
        next.attacker_id === event.attacker_id &&
        next.target_id === event.defender_id
      ) {
        const attack = describeEvent(event, learned, messageOption(options, index));
        const absorbed = describeEvent(next, learned);
        const merged: EventLine = {
          ...attack,
          text: `${attack.text.replace(/\.$/, '')}, but it has no effect.`,
          category: 'damage',
          tone: attack.tone === 'good' ? 'bad' : 'good',
        };
        const detail = [attack.detail, absorbed.detail].filter(Boolean).join(' ');
        if (detail) merged.detail = detail;
        lines.push(merged);
        index += 1;
        continue;
      }
      if (
        next &&
        next.event_type === 'damage_dealt' &&
        next.attacker_id === event.attacker_id &&
        next.target_id === event.defender_id
      ) {
        const attack = describeEvent(event, learned, messageOption(options, index));
        const damage = describeEvent(next, learned);
        const amount = typeof next.amount === 'number' ? next.amount : 0;
        const text = `${attack.text.replace(/\.$/, '')} for ${amount} damage.`;
        const detail = [attack.detail, damage.detail].filter(Boolean).join(' ');
        const merged: EventLine = {
          ...damage,
          text,
          category: 'damage',
          tone: attack.tone,
          icon: 'sword',
          actorIds: attack.actorIds,
        };
        if (detail) merged.detail = detail;
        else delete merged.detail;
        lines.push(merged);
        index += 1;
        continue;
      }
    }
    lines.push(describeEvent(event, learned, messageOption(options, index)));
  }
  return lines;
}

function isQuietCheck(event: GameEvent | LooseEvent | undefined): boolean {
  if (!event || event.event_type !== 'wandering_check') return false;
  return !('encounter' in event && event.encounter === true);
}

function messageOption(options: DescribeEventsOptions, index: number): { message?: string } {
  const message = options.messages?.[index];
  return message === undefined ? {} : { message };
}
