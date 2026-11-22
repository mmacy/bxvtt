/**
 * Plain-English wording for every rejection code that osrlib can return.
 *
 * A rejection is a refusal: bxapi returns `accepted: false` with a list of `{ code, params }`. Each template
 * here is written for the player who made the choice. It says what was wrong in the game's terms and, where it
 * helps, what to do instead. `{name|format}` marks a param; see `template.ts` for the formats.
 *
 * The coverage test reads `data/codes.json`, which `tools/extract-codes.py` extracts from osrlib, and fails when
 * a code has no template here, or when a template uses a param that osrlib never passes with its code.
 */

import type { components } from '../bxapi';
import type { TextContext } from './context';
import { emptyContext } from './context';
import { capitalizeFirst, prettifyId } from './format';
import { removeDashes } from './humanize';
import { renderTemplate, type ParamMap, type Template } from './template';

export type Rejection = components['schemas']['Rejection'];

export const REJECTION_TEMPLATES: Record<string, Template> = {
  // Battle declarations ----------------------------------------------------------------------------------------
  'battle.declaration.back_stab_no_ability':
    "{character|member} can't back-stab, because only thieves have that ability.",
  'battle.declaration.back_stab_not_attack':
    'A back-stab has to be an attack. Choose Attack for {character|member}, or turn off the back-stab.',
  'battle.declaration.back_stab_not_melee':
    "{character|member} can't back-stab with a missile weapon, because a back-stab is a melee attack.",
  'battle.declaration.back_stab_target_aware':
    "The monsters are on guard, so {character|member} can't back-stab them. A back-stab works only in the free round after the party surprises the monsters.",
  'battle.declaration.cannot_move':
    "{character|member} can't move this round. Have them attack from where they stand, or hold.",
  'battle.declaration.cast_cannot_move':
    "A caster can't move in the round they cast, so {character|member} can cast or move, but not both.",
  'battle.declaration.invisible_target': "{target|entity} is invisible and can't be targeted.",
  'battle.declaration.item_unusable':
    "{item|itemcap} can't be used that way in battle. Throw only splash weapons, such as a flask of oil, and attack only with weapons.",
  'battle.declaration.member_out_of_reach':
    '{character|member} is too far from {target|entity} to reach them. A member has to stand within 5 feet to hand over an item or touch someone.',
  'battle.declaration.missing_move':
    'Choose how {character|member} moves: close in, fighting withdrawal, or retreat.',
  'battle.declaration.missing_spell': 'Choose a spell and a spell mode for {character|member}.',
  'battle.declaration.move_not_combinable':
    "{character|member} can't move and do that in the same round. Only an attack can close in first, so choose one or the other.",
  'battle.declaration.no_mirror':
    'Choose another way to guard against the gaze, because {character|member} has no mirror to fight by.',
  'battle.declaration.no_target': [
    { when: ['group'], text: "There's no one left to attack in {group|group}." },
    {
      when: ['character'],
      text: '{character|member} has no undead to turn, because none are in this battle.',
    },
    { text: 'No monster is left to target.' },
  ],
  'battle.declaration.not_in_front_rank':
    "{character|member} isn't in the front rank, so they can't attack in melee. Close with the monsters first, or use a missile weapon or spell.",
  'battle.declaration.replacement_unavailable':
    "{character|member} can't trade places with {replacement|member}. The member they name has to be able to act and can't be falling back this round.",
  'battle.declaration.roster_mismatch': [
    {
      when: ['expected', 'declared'],
      text: 'Every member who can act has to declare, and no one else. This round needs declarations from {expected|members}, but you sent {declared|members}.',
    },
    { text: 'Every member who can act has to declare, and no one else.' },
  ],
  'battle.declaration.unknown_action': "{action|action} isn't something a member can do in battle.",
  'battle.declaration.unknown_group':
    "The group {character|member} is aiming at isn't in the fight any more. Choose another group.",
  'battle.declaration.weapon_not_wielded':
    "{item|itemcap} isn't wielded. Equip the weapon before attacking with it.",
  'battle.none_active': "There's no battle to resolve.",

  // Attacks ----------------------------------------------------------------------------------------------------
  'combat.attack.attacker_blind': "{attacker|entity} is blind and can't attack.",
  'combat.attack.attacker_incapacitated': "{attacker|entity} can't attack while {condition|condition}.",
  'combat.attack.out_of_range': [
    {
      when: ['attacker', 'distance_feet'],
      text: '{attacker|entity} is {distance_feet|feet} from the target, out of range for that weapon. Move closer or choose another weapon.',
    },
    { text: 'The target is out of range for that weapon. Move closer or choose another weapon.' },
  ],
  'combat.attack.out_of_reach': [
    {
      when: ['attacker', 'distance_feet'],
      text: '{attacker|entity} is {distance_feet|feet} from the target, too far for a melee attack. Close in first, or use a missile weapon or spell.',
    },
    {
      when: ['target', 'distance_feet'],
      text: '{target|entity} is {distance_feet|feet} away, too far for a melee attack. Close in first, or use a missile weapon or spell.',
    },
    {
      when: ['distance_feet'],
      text: 'The target is {distance_feet|feet} away, too far for a melee attack. Close in first, or use a missile weapon or spell.',
    },
    {
      text: 'The target is too far away for a melee attack. Close in first, or use a missile weapon or spell.',
    },
  ],
  'combat.attack.reload':
    "{attacker|entity} fired last round and has to reload, so they can't fire again this round.",
  'combat.breath.exhausted': '{monster|entity} has used its breath weapon as often as it can today.',
  'combat.breath.no_breath_weapon': '{monster|entity} has no breath weapon.',

  // Character creation -----------------------------------------------------------------------------------------
  'creation.adjustment.above_cap':
    '{ability|ability} is {score} now, and raising it by {amount} would take it above 18. Raise it by less.',
  'creation.adjustment.below_floor':
    "{ability|ability} is {score} now, and lowering it by {amount} would take it below 9. A score can't be traded down past 9.",
  'creation.adjustment.class_restriction': "This class can't lower {ability|ability}.",
  'creation.adjustment.not_lowerable':
    "{ability|ability} can't be lowered. Only Strength, Intelligence, and Wisdom can be traded for points.",
  'creation.adjustment.points_mismatch':
    'Lowering scores earns {points_available|count:point}, and you spent {points_spent|number}. Raise prime requisites by exactly 1 for every 2 points you lower.',
  'creation.adjustment.prime_requisite_lowered':
    "{ability|ability} is a prime requisite for this class, so it can't be lowered.",
  'creation.adjustment.raise_not_prime_requisite':
    "Only a prime requisite can be raised, and {ability|ability} isn't one for this class.",
  'creation.adjustment.reduction_not_even':
    "Scores are lowered in steps of 2, so {ability|ability} can't be lowered by {amount}. Lower it by an even number.",
  'creation.class.requirements_not_met':
    '{class|classcap} need {ability|ability} {minimum|number} or higher, and this character has {score|number}.',
  'creation.languages.duplicate_choice':
    'You chose {language|raw} more than once. Pick each language only once.',
  'creation.languages.duplicates_native':
    'This class already speaks {language|raw}. Pick a different language.',
  'creation.languages.not_available': "{language|raw} isn't a language this character can choose.",
  'creation.languages.too_many':
    'This character can learn {allowed|count:extra language}, but you chose {chosen|number}.',

  // Encounters and chases --------------------------------------------------------------------------------------
  'encounter.evade.already_evading':
    'The party is already running. Wait to keep running, or drop something behind to slow the monsters.',
  'encounter.evade.nothing_to_drop':
    'The party has no {drop|raw} to drop. Run without dropping anything, or choose something else.',
  'encounter.none_active': "There's no encounter to act on.",
  'encounter.parley.mid_pursuit':
    "The monsters are chasing the party, so there's no time to talk. Keep running or fight.",
  'encounter.spawn.mid_pursuit': "Monsters can't join a chase that is under way. Wait until the chase ends.",
  'encounter.turning.mid_pursuit': "The party can't turn undead in the middle of a chase.",

  // Exploration ------------------------------------------------------------------------------------------------
  'exploration.action.requires_light':
    "It's too dark for {character|member} to do that. Light a torch or lantern first.",
  'exploration.door.already_closed': 'The door is already closed.',
  'exploration.door.already_open': 'The door is already open.',
  'exploration.door.gate_refused': [
    { when: ['refusal'], text: '{refusal|raw}' },
    {
      when: ['direction'],
      text: "The door to the {direction|direction} won't open. The party doesn't have what it needs to pass yet.",
    },
    { text: "The door won't open. The party doesn't have what it needs to pass yet." },
  ],
  'exploration.door.locked':
    'The door is locked. A thief can pick the lock, or the party can find another way.',
  'exploration.door.no_door': [
    {
      when: ['direction'],
      text: "There's no door to the {direction|direction}. Choose a side with a door the party has found.",
    },
    { text: "There's no door on that side. Choose a side with a door the party has found." },
  ],
  'exploration.door.no_spike': 'No one in the party has an iron spike to wedge the door with.',
  'exploration.door.not_stuck': "The door isn't stuck, so there's nothing to force. Open it instead.",
  'exploration.door.stuck': 'The door is stuck. Have a strong member force it open.',
  'exploration.door.wedged':
    "An iron spike already holds the door in place, so it can't be closed or wedged again.",
  'exploration.feature.emptied': 'That treasure has already been taken.',
  'exploration.feature.unknown':
    "The party can't find that cache or pile here. Move to the cell that holds it first.",
  'exploration.give.same_member':
    "{character|member} can't give items to themselves. Choose another party member.",
  'exploration.item.not_carried': "That character doesn't have {item|carried}.",
  'exploration.item.not_equipped': "{item|itemcap} isn't equipped, so it can't be taken off.",
  'exploration.light.no_flame':
    '{character|member} has no tinder box, and the party has no open flame to light it from. Nothing can be lit.',
  'exploration.light.not_a_source':
    "{item|itemcap} can't be lit. Light a torch, a lantern, or a flask of oil.",
  'exploration.light.not_burning': '{character|member} has no torch or lantern burning.',
  'exploration.listen.already_tried':
    '{character|member} has already listened at that door. Send someone else.',
  'exploration.lock.locked_out':
    "{character|member} failed to pick that lock and can't try again until they gain a level.",
  'exploration.lock.no_tools': "{character|member} needs thieves' tools to pick a lock.",
  'exploration.lock.not_a_thief': "Only a thief can pick locks, and {character|member} isn't one.",
  'exploration.lock.not_locked': "That door isn't locked.",
  'exploration.move.blocked': [
    {
      when: ['direction'],
      text: 'A wall or a closed door blocks the way {direction|direction}. Open a door first, or choose another direction.',
    },
    { text: 'A wall or a closed door blocks the way. Open a door first, or choose another direction.' },
  ],
  'exploration.move.cannot_move': [
    {
      when: ['reason'],
      text: "The party can't move, because {reason|moveReason}. Drop some gear or treasure, or hand it to someone with room.",
    },
    { when: ['character'], text: "{character|member} can't move, so the party can't move either." },
    { text: "The party can't move right now." },
  ],
  'exploration.party.bad_order':
    'A marching order has to list every party member exactly once, including the dead.',
  'exploration.search.already_tried':
    '{character|member} has already made that search here. Send someone else, or search for something different.',
  'exploration.stairs.none': 'There are no stairs or other way between levels on this cell.',
  'exploration.transition.gate_refused': [
    { when: ['refusal'], text: '{refusal|raw}' },
    { text: "Something bars the way. The party doesn't have what it needs to pass yet." },
  ],
  'exploration.trap.already_resolved': 'That trap has already gone off or been removed.',
  'exploration.trap.not_a_thief': "Only a thief can work on traps, and {character|member} isn't one.",
  'exploration.trap.not_found': 'No one has found a trap on that cache. Have a thief inspect it first.',
  'exploration.travel.not_at_entrance':
    "The party can travel to town only from the dungeon's entrance. Walk back to it first.",

  // Items ------------------------------------------------------------------------------------------------------
  'items.coins.insufficient': "{character|member} doesn't have enough {coin|coin}.",
  'items.curse.stuck':
    '{item|itemcap} is cursed and stays with its bearer. The curse has to be lifted first, for example by the temple.',
  'items.device.inert': '{item|itemcap} has no charges left and does nothing.',
  'items.equip.armour_forbidden': "{class|classcap} can't wear armour.",
  'items.equip.armour_not_allowed': "{class|classcap} aren't allowed to wear {item|item}.",
  'items.equip.not_equippable':
    "{item|itemcap} can't be equipped. Only armour, shields, rings, and weapons are worn or wielded.",
  'items.equip.not_usable': "{item|itemcap} can't be used by that character's class.",
  'items.equip.shield_forbidden': "{class|classcap} can't use shields.",
  'items.equip.two_handed_with_shield': [
    {
      when: ['item'],
      text: "{item|itemcap} needs both hands, so it can't be wielded with a shield. Take off the shield first.",
    },
    { text: "A shield can't be carried with a two-handed weapon. Put one of them away first." },
  ],
  'items.equip.weapon_forbidden': "{class|classcap} can't use {item|item}.",
  'items.equip.weapon_not_allowed':
    "{class|classcap} can use only certain weapons, and {item|item} isn't one of them.",
  'items.purchase.insufficient_funds': "That costs {cost_gp|gp}, and there isn't enough gold to pay for it.",
  'items.purchase.not_stocked': "The town doesn't sell {item|item}.",
  'items.remove.not_carried': "{character|member} isn't carrying {item|item}.",
  'items.ring.hands_full': 'Only two rings can be worn at once. Take one off before putting on {item|item}.',
  'items.scroll.no_such_spell': "That scroll doesn't hold {spell|spell}.",
  'items.scroll.spent': '{item|itemcap} has no spells left.',
  'items.scroll.wrong_caster':
    "{item|itemcap} holds spells that the reader can't cast. Choose a character whose class uses that kind of magic.",
  'items.use.battle_only': '{item|itemcap} can be used only in battle.',
  'items.use.not_usable': "{item|itemcap} can't be used by that character's class.",
  'items.use.target_cannot_be_healed': "{target|member} can't be healed by {item|item} right now.",
  'items.use.target_cannot_drink':
    "{target|member} can't drink {item|item}, because they can't act right now.",
  'items.use.target_not_allowed':
    "{target|entity} isn't in the party, so can't drink {item|item}. A potion can be given only to a party member.",
  'items.use.target_required': 'Choose a target for {item|item}.',
  'items.use.unknown_target': "That target isn't in the party or the encounter.",

  // Magic ------------------------------------------------------------------------------------------------------
  'magic.book.already_chosen':
    "{character|member} already has spells in their spell book, so starting spells can't be chosen again.",
  'magic.book.capacity_exceeded':
    "The spell book holds only {capacity|count:spell} of level {spell_level|number}, so {spell|spell} doesn't fit.",
  'magic.book.capacity_mismatch':
    'The spell book needs exactly {capacity|count:spell} of level {spell_level|number}, but {chosen|number} were chosen.',
  'magic.book.duplicate': '{spell|spellcap} is already in the spell book.',
  'magic.book.not_arcane': "{class|classcap} don't keep spell books. Only arcane casters do.",
  'magic.book.unknown_spell': "That spell isn't in the game's spell list.",
  'magic.book.wrong_list':
    "{spell|spellcap} is a {list|spelllist} spell, and this class can't keep spells from that list in its spell book.",
  'magic.cast.anti_magic_shell': 'An anti-magic shell stops {caster|member} from casting.',
  'magic.cast.caster_incapacitated': "{caster|member} can't cast while {condition|condition}.",
  'magic.cast.caster_restrained': "{caster|member} can't cast while {restraint|restraint}.",
  'magic.cast.not_memorized':
    "That caster doesn't have {spell|spell} memorized{reversed|inreverse}. Casters memorize spells after a night's rest.",
  'magic.cast.not_reversible': '{spell|spellcap} has no reversed form.',
  'magic.cast.out_of_range':
    'The target is {distance_feet|feet} away, but {spell|spell} reaches only {range_feet|feet}.',
  'magic.cast.silenced_area':
    '{caster|member} is standing in an area of silence, so no spell can be cast here.',
  'magic.cast.target_count':
    'This spell mode takes {expected|count:target}, but you chose {supplied|number}.',
  'magic.cast.target_must_be_creature': '{spell|spellcap} can target only creatures, not a place.',
  'magic.cast.unknown_mode': [
    {
      when: ['spell', 'mode'],
      text: '{spell|spellcap} has no {mode|mode} mode. Choose one of the modes it lists.',
    },
    { text: 'That spell has no such mode. Choose one of the modes it lists.' },
  ],
  'magic.cast.unknown_spell': "That spell isn't in the game's spell list.",
  'magic.cast.unknown_target': "That target isn't in the party or the encounter.",
  'magic.memorize.divine_reverses_at_cast':
    'A cleric picks the reversed form when casting, not when memorizing. Memorize {spell|spell} as it is.',
  'magic.memorize.needs_sleep':
    "{character|member} can't prepare spells yet. The party has to rest for a night first.",
  'magic.memorize.not_a_caster': "{class|classcap} can't memorize spells.",
  'magic.memorize.not_in_book': "{spell|spellcap} isn't in the spell book, so it can't be memorized.",
  'magic.memorize.not_reversible': '{spell|spellcap} has no reversed form to memorize.',
  'magic.memorize.slots_exceeded':
    'This caster has {slots|count:slot} for level {spell_level|number} spells, but {selected|number} were chosen.',
  'magic.memorize.unknown_spell': "That spell isn't in the game's spell list.",
  'magic.memorize.wrong_list':
    "{spell|spellcap} is a {list|spelllist} spell, and this class can't memorize spells from that list.",
  'magic.turning.caster_incapacitated': "{caster|member} can't turn undead while {condition|condition}.",
  'magic.turning.not_a_turner': "{class|classcap} can't turn undead.",

  // Party changes ----------------------------------------------------------------------------------------------
  'party.add.carries_instances':
    "{name|raw} can't join while carrying {item|item}, because a new member can't bring an item that already has a game ID. Remove it first.",
  'party.add.id_assigned':
    "That character already belongs to a game, so can't be added as a new member. Use a fresh copy of the character.",
  'party.add.under_effects':
    "{name|raw} is under a spell or condition, so can't join the party until it ends.",
  'party.remove.carries_quest_item':
    '{character|member} is carrying {item|item}, which a quest needs. Give it to a member who is staying first.',
  'party.remove.last_standing': "{character|member} is the last member standing, so can't leave.",
  'party.remove.same_member': "A member can't give their belongings to themselves. Choose another member.",

  // Session ----------------------------------------------------------------------------------------------------
  'session.command.member_incapacitated': "{character|member} can't act right now.",
  'session.command.no_door': [
    { when: ['x', 'y'], text: 'The cell at ({x|number}, {y|number}) has no door on that side.' },
    { text: 'That cell has no door on that side.' },
  ],
  'session.command.no_living_members': 'No one in the party is alive to do that.',
  'session.command.out_of_bounds': "That cell is outside the level's map.",
  'session.command.quest_state': [
    { when: ['objective', 'state'], text: 'That objective is already {state|raw}.' },
    { when: ['state'], text: 'That quest is {state|questStatus}.' },
    { text: "The quest isn't in the right state for that." },
  ],
  'session.command.unknown_item': "That item isn't in this game's catalog.",
  'session.command.unknown_location': "{dungeon|dungeon} isn't a dungeon in this adventure.",
  'session.command.unknown_member': 'No party member matches that character.',
  'session.command.unknown_monster': "That monster isn't in this game's catalog.",
  'session.command.unknown_objective': 'That quest has no such objective.',
  'session.command.unknown_quest': 'This adventure has no such quest.',
  'session.command.wrong_mode': "You can't {command|command} {mode|modephrase}.",

  // Town -------------------------------------------------------------------------------------------------------
  'town.healing.caster_level_out_of_range':
    "A level {caster_level|number} cleric can't cast {item|service}. Choose a level from {minimum|number} to {maximum|number}.",
  'town.healing.no_effect':
    "{item|service} would do nothing for {character|member}, so the temple won't cast it.",
  'town.sell.no_fixed_value':
    'No buyer will pay a fixed price for {item|item}. Only gems and jewellery sell for their full value.',
};

/** Build a sentence from the words of a code that has no template: `items.equip.too_heavy` gives `Equip too heavy`. */
export function fallbackRejectionText(code: string): string {
  const words = code.split('.').slice(1).map(prettifyId);
  const reason = words.length > 0 ? words.join(' ') : prettifyId(code);
  return `That wasn't allowed (${reason}).`;
}

/**
 * Describe a rejection in one or two sentences for the player who made the choice. A code that this module
 * doesn't know gets a sentence built from the code's words.
 *
 * @param rejection A rejection from a command outcome, with `code` and `params`.
 * @param ctx Names for the IDs in the params. Defaults to an empty context.
 */
export function describeRejection(
  rejection: { code: string; params?: ParamMap | undefined },
  ctx: TextContext = emptyContext(),
): string {
  const template = Object.hasOwn(REJECTION_TEMPLATES, rejection.code)
    ? REJECTION_TEMPLATES[rejection.code]
    : undefined;
  if (template === undefined) return fallbackRejectionText(rejection.code);
  return removeDashes(renderTemplate(template, rejection.params ?? {}, ctx));
}

/** Describe every rejection of an outcome, dropping repeats and joining them into a list of sentences. */
export function describeRejections(
  rejections: ReadonlyArray<{ code: string; params?: ParamMap | undefined }>,
  ctx: TextContext = emptyContext(),
): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const rejection of rejections) {
    const line = describeRejection(rejection, ctx);
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines;
}

/** Join the descriptions of several rejections into one paragraph. */
export function describeRejectionsText(
  rejections: ReadonlyArray<{ code: string; params?: ParamMap | undefined }>,
  ctx: TextContext = emptyContext(),
): string {
  return describeRejections(rejections, ctx).map(capitalizeFirst).join(' ');
}
