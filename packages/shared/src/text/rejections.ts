/**
 * Plain-English wording for every rejection code that osrlib can return.
 *
 * A rejection is a refusal: bxapi returns `accepted: false` with a list of `{ code, params }`. Each template
 * here is written for the player who made the choice. It says what was wrong in the game's terms and, where it
 * helps, what to do instead. `{name|format}` marks a param; see `template.ts` for the formats.
 *
 * The coverage test reads `data/codes.json`, which `tools/extract-codes.py` extracts from osrlib, and fails when
 * a code has no template here, or when a template uses a param that osrlib never passes with its code. A refusal
 * of a battle declaration also names the declaring member in `character`, which the extractor can't see, so
 * [`DECLARATION_CODES`][DECLARATION_CODES] lists the codes that can carry it.
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
    "{character|member} can't back-stab. Turn off Back-stab to attack normally.",
  'battle.declaration.back_stab_not_attack':
    'Back-stab only works with an attack. Choose Attack for {character|member}, or turn off back-stab.',
  'battle.declaration.back_stab_not_melee':
    "{character|member} can't back-stab with a missile weapon. Switch to a melee weapon or turn off back-stab.",
  'battle.declaration.back_stab_target_aware':
    "The monsters have noticed {character|member}, so a back-stab won't work. Turn off Back-stab to attack normally.",
  'battle.declaration.cannot_move':
    "{character|member} can't move this round. Attack in place or choose Hold.",
  'battle.declaration.cast_cannot_move':
    "{character|member} can't move and cast a spell in the same round. Clear the move or choose another action.",
  'battle.declaration.hide_in_front_rank':
    "{character|member} will be in the front rank this round and can't hide there. Choose another action.",
  'battle.declaration.hide_not_a_thief':
    "{character|member} can't hide in shadows. Only a character with thief skills can.",
  'battle.declaration.invisible_target': [
    {
      when: ['character', 'target'],
      text: "{target|entity} is invisible, so {character|member} can't target it. Choose another target.",
    },
    { when: ['target'], text: '{target|entity} is invisible. Choose another target.' },
    {
      when: ['character'],
      text: "That target is invisible, so {character|member} can't target it. Choose another target.",
    },
    { text: "That target is invisible and can't be targeted. Choose another target." },
  ],
  'battle.declaration.item_unusable': [
    {
      when: ['character'],
      text: "{character|member} can't use {item|item} that way in battle. Attack with a weapon, or use a potion, scroll, wand, staff, or flask of oil.",
    },
    {
      text: "{item|itemcap} can't be used that way in battle. Attack with a weapon, or use a potion, scroll, wand, staff, or flask of oil.",
    },
  ],
  'battle.declaration.member_out_of_reach':
    '{character|member} is too far from {target|entity}. Stay within 5 feet to hand over an item or touch an ally.',
  'battle.declaration.missing_move':
    'Choose how {character|member} moves: close in, fighting withdrawal, or retreat.',
  'battle.declaration.missing_spell': 'Choose a spell and a spell mode for {character|member}.',
  'battle.declaration.move_not_combinable':
    "{character|member} can't combine movement with that action. You can move in the same round only when closing in to attack.",
  'battle.declaration.no_mirror':
    "{character|member} isn't carrying a mirror. Avert eyes instead, or fight without gaze protection.",
  'battle.declaration.no_target': [
    // An attack or a staff's strike names the group and the declaring member. A turning names the member alone.
    {
      when: ['character', 'group'],
      text: 'No targets remain in {group|group} for {character|member} to strike. Choose another group.',
    },
    { when: ['group'], text: 'No targets remain in {group|group}. Choose another group.' },
    {
      when: ['character'],
      text: 'There are no undead in this battle for {character|member} to turn.',
    },
    { text: 'No monsters remain to target.' },
  ],
  'battle.declaration.not_in_front_rank':
    "{character|member} isn't in the front rank, so they can't reach the monsters in melee or with a touch. Close with the monsters first, or use a missile weapon or a spell with range.",
  'battle.declaration.replacement_unavailable':
    "{character|member} can't trade places with {replacement|member}. Choose a party member who can act and isn't falling back this round.",
  'battle.declaration.roster_mismatch': [
    {
      when: ['expected', 'declared'],
      text: 'Declare an action for {expected|members} this round. You declared for {declared|members}.',
    },
    { text: 'Declare an action for each party member who can act this round.' },
  ],
  'battle.declaration.target_count': [
    {
      when: ['character', 'expected'],
      text: '{character|possessive} action needs {expected|count:target}, but you chose {supplied|number}.',
    },
    { text: 'Choose one target for that action.' },
  ],
  'battle.declaration.unknown_action': [
    {
      when: ['character'],
      text: "{action|action} isn't a battle action {character|member} can take. Choose another action.",
    },
    { text: "{action|action} isn't a valid battle action." },
  ],
  'battle.declaration.unknown_group':
    'The group {character|member} targeted is no longer in the fight. Choose another group.',
  'battle.declaration.weapon_not_wielded': [
    {
      when: ['character'],
      text: "{character|member} isn't wielding {item|item}. Wield the weapon before attacking with it.",
    },
    { text: "{item|itemcap} isn't equipped. Wield the weapon before attacking with it." },
  ],
  'battle.none_active': "The party isn't in a battle.",

  // Attacks ----------------------------------------------------------------------------------------------------
  'combat.attack.attacker_blind': "{attacker|entity} is blind and can't attack.",
  'combat.attack.attacker_incapacitated': "{attacker|entity} can't attack while {condition|condition}.",
  'combat.attack.out_of_range': [
    {
      when: ['attacker', 'distance_feet'],
      text: '{attacker|entity} is {distance_feet|feet} from the target, out of range for that weapon. Move closer or choose another weapon.',
    },
    {
      when: ['character', 'distance_feet'],
      text: '{character|member} is {distance_feet|feet} from the target, out of range for that weapon. Move closer or choose another weapon.',
    },
    { text: 'The target is out of range for that weapon. Move closer or choose another weapon.' },
  ],
  'combat.attack.out_of_reach': [
    {
      when: ['attacker', 'distance_feet'],
      text: '{attacker|entity} is {distance_feet|feet} from the target, too far for a melee attack. Close in first, or use a missile weapon or a spell.',
    },
    {
      when: ['character', 'target', 'distance_feet'],
      text: '{character|member} is {distance_feet|feet} from {target|entity}, too far to reach in melee. Close in first, or use a missile weapon or a spell.',
    },
    {
      when: ['character', 'distance_feet'],
      text: '{character|member} is {distance_feet|feet} from the target, too far for a melee attack. Close in first, or use a missile weapon or a spell.',
    },
    {
      when: ['target', 'distance_feet'],
      text: '{target|entity} is {distance_feet|feet} away, too far for a melee attack. Close in first, or use a missile weapon or a spell.',
    },
    {
      when: ['distance_feet'],
      text: 'The target is {distance_feet|feet} away, too far for a melee attack. Close in first, or use a missile weapon or a spell.',
    },
    {
      text: 'The target is too far away for a melee attack. Close in first, or use a missile weapon or a spell.',
    },
  ],
  'combat.attack.reload': '{attacker|entity} fired last round and must reload this round.',
  'combat.breath.exhausted': '{monster|entity} has used its breath weapon as often as it can today.',
  'combat.breath.no_breath_weapon': '{monster|entity} has no breath weapon.',

  // Character creation -----------------------------------------------------------------------------------------
  'creation.adjustment.above_cap':
    '{ability|ability} is {score}, so raising it by {amount} exceeds the maximum of 18. Choose a smaller increase.',
  'creation.adjustment.below_floor':
    "{ability|ability} is {score}, so lowering it by {amount} drops it below 9. Ability scores can't be lowered below 9.",
  'creation.adjustment.class_restriction': "This class can't lower {ability|ability}.",
  'creation.adjustment.not_lowerable':
    "{ability|ability} can't be lowered. Only Strength, Intelligence, and Wisdom can be traded for points.",
  'creation.adjustment.points_mismatch':
    'You gained {points_available|count:point} from lowering scores, but you spent {points_spent|number}. Raise a prime requisite by 1 for every 2 points you lower.',
  'creation.adjustment.prime_requisite_lowered':
    "You can't lower {ability|ability} because it is a prime requisite for this class.",
  'creation.adjustment.raise_not_prime_requisite':
    "{ability|ability} isn't a prime requisite for this class, so you can't raise it.",
  'creation.adjustment.reduction_not_even':
    "You can't lower {ability|ability} by {amount}. Lower ability scores by an even number, in steps of 2.",
  'creation.class.requirements_not_met':
    '{class|classcap} require {ability|ability} {minimum|number} or higher, but this character has {score|number}.',
  'creation.languages.duplicate_choice':
    'You chose {language|raw} more than once. Pick each language only once.',
  'creation.languages.duplicates_native':
    'This character already speaks {language|raw}. Pick a different language.',
  'creation.languages.not_available':
    "{language|raw} isn't available to this character. Pick a language from the list.",
  'creation.languages.too_many':
    'This character can learn {allowed|count:extra language}, but you chose {chosen|number}.',

  // Encounters and chases --------------------------------------------------------------------------------------
  'encounter.evade.already_evading':
    'The party is already fleeing. Choose Wait to keep running, or drop food or treasure to slow the pursuit.',
  'encounter.evade.nothing_to_drop':
    'The party has no {drop|raw} to drop. Run without dropping anything, or choose something else.',
  'encounter.none_active': "The party isn't in an encounter.",
  'encounter.parley.mid_pursuit':
    "The monsters are chasing the party, so there's no time to talk. Keep running or fight.",
  'encounter.spawn.mid_pursuit': "You can't spawn monsters during a chase. Wait until the chase ends.",
  'encounter.turning.mid_pursuit': "You can't turn undead during a chase. Keep running or turn and fight.",

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
  'exploration.door.locked': 'The door is locked. Have a thief pick the lock, or find another way.',
  'exploration.door.no_door': [
    {
      when: ['direction'],
      text: "There's no door to the {direction|direction}. Choose a side with a door the party has found.",
    },
    { text: "There's no door on that side. Choose a side with a door the party has found." },
  ],
  'exploration.door.no_spike': 'No one in the party is carrying an iron spike to wedge the door.',
  'exploration.door.not_stuck': "The door isn't stuck. Open it normally instead of forcing it.",
  'exploration.door.stuck': 'The door is stuck. Choose a party member to force it open.',
  'exploration.door.wedged':
    "The door is already wedged with an iron spike, so you can't close or wedge it again.",
  'exploration.feature.emptied': 'The party has already taken that treasure.',
  // Taking, inspecting, and disarming treasure all get this code, so it never says whether a trap exists.
  'exploration.feature.unknown': "The party can't do that here.",
  'exploration.give.same_member':
    "{character|member} can't give items to themselves. Choose another party member.",
  'exploration.item.not_carried': [
    { when: ['character'], text: "{character|member} doesn't have {item|carried}." },
    { text: "That character doesn't have {item|carried}." },
  ],
  'exploration.item.not_equipped': "{item|itemcap} isn't equipped right now.",
  'exploration.light.no_flame':
    '{character|member} has no tinder box, and no one in the party has an open flame to light from.',
  'exploration.light.not_a_source':
    "You can't light {item|item}. Choose a torch, a lantern, or a flask of oil.",
  'exploration.light.not_burning': '{character|member} has no torch or lantern burning.',
  'exploration.listen.already_tried':
    '{character|member} has already listened at that door. Have another party member try.',
  'exploration.lock.locked_out':
    "{character|member} failed to pick that lock and can't try again until they gain a level.",
  'exploration.lock.no_tools': "{character|member} needs thieves' tools to pick a lock.",
  'exploration.lock.not_a_thief': "{character|member} isn't a thief. Only a thief can pick locks.",
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
      text: "The party can't move because {reason|moveReason}. Drop some gear or treasure, or give it to someone who can carry more.",
    },
    { when: ['character'], text: "{character|member} can't move, so the party can't advance." },
    { text: "The party can't move right now." },
  ],
  'exploration.party.bad_order':
    'Include every party member in the marching order exactly once, including fallen members.',
  'exploration.search.already_tried':
    '{character|member} has already searched for that here. Have another party member search, or look for something else.',
  'exploration.stairs.none': 'There are no stairs, trapdoors, or passages to another level here.',
  'exploration.transition.gate_refused': [
    { when: ['refusal'], text: '{refusal|raw}' },
    { text: "The way is barred. The party doesn't have what it needs to pass yet." },
  ],
  'exploration.trap.already_resolved': 'That trap has already sprung or been disarmed.',
  'exploration.trap.not_a_thief':
    "{character|member} isn't a thief. Only a thief can find and disarm treasure traps.",
  'exploration.travel.not_at_entrance':
    'You can return to town only from the dungeon entrance. Walk back to the entrance first.',

  // Items ------------------------------------------------------------------------------------------------------
  'items.coins.insufficient': "{character|member} doesn't have enough {coin|coin}.",
  'items.curse.stuck':
    "{item|itemcap} is cursed, so you can't put it away or drop it until the curse is removed.",
  'items.device.inert': '{item|itemcap} has no charges left.',
  'items.equip.armour_forbidden': "{class|classcap} can't wear armour.",
  'items.equip.armour_not_allowed': "{class|classcap} can't wear {item|item}.",
  'items.equip.not_equippable':
    "You can't equip {item|item}. Only weapons, armour, shields, and rings can be equipped.",
  'items.equip.not_usable': "That character's class can't equip {item|item}.",
  'items.equip.shield_forbidden': "{class|classcap} can't use shields.",
  'items.equip.two_handed_with_shield': [
    {
      when: ['item'],
      text: "{item|itemcap} is a two-handed weapon, so you can't wield it with a shield. Unequip the shield first.",
    },
    { text: "You can't use a shield while wielding a two-handed weapon. Unequip one of them first." },
  ],
  'items.equip.weapon_forbidden': "{class|classcap} can't use {item|item}.",
  'items.equip.weapon_not_allowed': "{class|classcap} can't wield {item|item}.",
  'items.purchase.insufficient_funds': "That costs {cost_gp|gp}, but you don't have enough gold.",
  'items.purchase.not_stocked': "Merchants in town don't sell {item|item}.",
  'items.remove.not_carried': "{character|member} isn't carrying {item|item}.",
  'items.ring.hands_full':
    'A character can wear at most two rings. Unequip a ring before putting on {item|item}.',
  'items.scroll.no_such_spell': "That scroll doesn't contain {spell|spell}.",
  'items.scroll.spent': '{item|itemcap} has no spells left.',
  'items.scroll.wrong_caster': [
    {
      when: ['character'],
      text: "{character|member} can't read {item|item}. Choose a caster whose class uses that kind of magic.",
    },
    { text: "That character can't read {item|item}. Choose a caster whose class uses that kind of magic." },
  ],
  'items.use.battle_only': 'You can use {item|item} only during a battle.',
  'items.use.not_usable': [
    { when: ['character'], text: "{character|possessive} class can't use {item|item}." },
    { text: "That character's class can't use {item|item}." },
  ],
  'items.use.target_cannot_be_healed': "{target|entity} can't be healed by {item|item} right now.",
  'items.use.target_cannot_drink': "{target|member} can't act right now and can't drink {item|item}.",
  'items.use.target_healed_today': [
    {
      when: ['target'],
      text: '{item|itemcap} has already healed {target|entity} today. Choose someone else.',
    },
    { text: '{item|itemcap} has already healed them today. Choose someone else.' },
  ],
  'items.use.target_not_allowed': [
    {
      when: ['character', 'target'],
      text: "{target|entity} isn't in the party. {character|member} can give {item|item} only to a party member.",
    },
    { text: "{target|entity} isn't in the party. You can give {item|item} only to a party member." },
  ],
  'items.use.target_required': 'Choose a target for {item|item}.',
  'items.use.unknown_target': [
    {
      when: ['character'],
      text: "{character|possessive} target isn't here. Choose another target.",
    },
    { text: "That target isn't here. Choose another target." },
  ],

  // Magic ------------------------------------------------------------------------------------------------------
  'magic.book.already_chosen': '{character|member} already has starting spells in their spell book.',
  'magic.book.capacity_exceeded':
    "The spell book fits at most {capacity|count:spell} of level {spell_level|number}, so there's no room for {spell|spell}.",
  'magic.book.capacity_mismatch':
    'Choose {capacity|count:spell} of level {spell_level|number} for the spell book. You chose {chosen|number}.',
  'magic.book.duplicate': '{spell|spellcap} is already in the spell book.',
  'magic.book.not_arcane': "{class|classcap} don't keep spell books.",
  'magic.book.unknown_spell': "{spell|spellcap} isn't available in this adventure.",
  'magic.book.wrong_list': "{spell|spellcap} is a {list|spelllist} spell, which this class can't learn.",
  'magic.cast.anti_magic_shell': 'An anti-magic shell blocks {caster|member} from casting spells.',
  'magic.cast.caster_incapacitated': "{caster|member} can't cast while {condition|condition}.",
  'magic.cast.caster_restrained': "{caster|member} can't cast while {restraint|restraint}.",
  'magic.cast.not_memorized': [
    {
      when: ['character'],
      text: "{character|member} doesn't have {spell|spell} memorized{reversed|inreverse}.",
    },
    {
      text: "That caster doesn't have {spell|spell} memorized{reversed|inreverse}.",
    },
  ],
  'magic.cast.not_reversible': '{spell|spellcap} has no reversed form.',
  'magic.cast.out_of_range': [
    {
      when: ['character'],
      text: 'The target is {distance_feet|feet} from {character|member}, but {spell|spell} reaches only {range_feet|feet}.',
    },
    { text: 'The target is {distance_feet|feet} away, but {spell|spell} reaches only {range_feet|feet}.' },
  ],
  'magic.cast.silenced_area': "{caster|member} is standing in magical silence and can't cast spells.",
  'magic.cast.target_count': [
    {
      when: ['character'],
      text: '{character|possessive} spell takes {expected|count:target} in this mode, but you chose {supplied|number}.',
    },
    { text: 'This spell mode takes {expected|count:target}, but you chose {supplied|number}.' },
  ],
  'magic.cast.target_must_be_creature': 'Choose a creature to target with {spell|spell}, not a location.',
  'magic.cast.unknown_mode': [
    {
      when: ['spell', 'mode'],
      text: "{spell|spellcap} has no {mode|mode} mode. Choose one of the spell's available modes.",
    },
    { text: "That spell doesn't support that mode. Choose one of the spell's available modes." },
  ],
  'magic.cast.unknown_spell': "{spell|spellcap} isn't available in this adventure.",
  'magic.cast.unknown_target': [
    {
      when: ['character'],
      text: "{character|possessive} target has fallen or isn't here. Choose another target.",
    },
    {
      text: "That target has fallen or isn't here. Choose another target.",
    },
  ],
  'magic.memorize.divine_reverses_at_cast':
    "{spell|spellcap} is reversed when it's cast, not when it's memorized. Memorize it in its normal form.",
  'magic.memorize.needs_sleep': "{character|member} needs a night's rest before preparing spells.",
  'magic.memorize.not_a_caster': "{class|classcap} can't memorize spells.",
  'magic.memorize.not_in_book': "{spell|spellcap} isn't in this caster's spell book.",
  'magic.memorize.not_reversible': '{spell|spellcap} has no reversed form to memorize.',
  'magic.memorize.slots_exceeded':
    'This caster has {slots|count:slot} for level {spell_level|number} spells, but you chose {selected|number}.',
  'magic.memorize.unknown_spell': "{spell|spellcap} isn't available in this adventure.",
  'magic.memorize.wrong_list':
    "{spell|spellcap} is a {list|spelllist} spell, which this class can't memorize.",
  'magic.turning.caster_incapacitated': "{caster|member} can't turn undead while {condition|condition}.",
  'magic.turning.not_a_turner': "{class|classcap} can't turn undead.",

  // Party changes ----------------------------------------------------------------------------------------------
  'party.add.carries_instances':
    "{name|raw} can't join the party while carrying {item|item} from another game. Remove that item first.",
  'party.add.id_assigned':
    "That character is already in another game. Add a fresh character who hasn't joined a game yet.",
  'party.add.under_effects':
    "{name|raw} is under an active spell or condition and can't join the party until it ends.",
  'party.remove.carries_quest_item':
    '{character|member} is carrying {item|item}, which is needed for a quest. Give it to another party member first.',
  'party.remove.last_standing':
    "{character|member} is the last party member standing and can't leave the party.",
  'party.remove.same_member':
    "{character|member} can't leave their belongings to themselves. Choose another party member.",

  // Session ----------------------------------------------------------------------------------------------------
  'session.command.member_incapacitated': [
    // A hand-over in battle names the giver as `character` and the recipient as `target`.
    {
      when: ['character', 'target'],
      text: "{target|member} can't act right now, so {character|member} can't hand them anything.",
    },
    { text: "{character|member} can't act right now." },
  ],
  'session.command.no_door': [
    { when: ['x', 'y'], text: 'The cell at ({x|number}, {y|number}) has no door on that side.' },
    { text: 'That cell has no door on that side.' },
  ],
  'session.command.no_living_members': 'No living party members remain to do that.',
  'session.command.out_of_bounds': 'That square is outside the level map.',
  'session.command.quest_state': [
    { when: ['objective', 'state'], text: 'That objective is already {state|raw}.' },
    { when: ['state'], text: 'That quest is {state|questStatus}.' },
    { text: "The quest isn't in the right state for that." },
  ],
  'session.command.unknown_item': "That item isn't available in this adventure.",
  'session.command.unknown_location': "{dungeon|dungeon} isn't a dungeon in this adventure.",
  'session.command.unknown_member': [
    // A hand-over in battle names the giver as `character` and the recipient as `target`.
    {
      when: ['character', 'target'],
      text: '{character|member} can hand items only to a member of the party. Choose another party member.',
    },
    { text: "That character isn't in the party." },
  ],
  'session.command.unknown_monster': "That monster type isn't available in this adventure.",
  'session.command.unknown_objective': 'That quest has no such objective.',
  'session.command.unknown_quest': 'This adventure has no such quest.',
  'session.command.wrong_mode': "You can't {command|command} {mode|modephrase}.",

  // Town -------------------------------------------------------------------------------------------------------
  'town.healing.caster_level_out_of_range':
    "A level {caster_level|number} cleric can't cast {item|service}. Choose a level from {minimum|number} to {maximum|number}.",
  'town.healing.no_effect': "{character|member} doesn't need {item|service} right now.",
  'town.sell.no_fixed_value': 'Merchants in town buy only gems and jewellery, not {item|item}.',
};

/**
 * The codes that can refuse a battle declaration with the declaring member in their `character` param, which
 * osrlib adds to every refusal of a declaration, including the kernel's checks that a declaration passes
 * through. `data/codes.json` lists the params that osrlib's code passes directly, so the coverage test also
 * allows `character` for these codes. A code that a declaration can return but that's missing here still reads
 * well, just without the member's name.
 *
 * Two codes also name the recipient of a hand-over in `target`: `session.command.unknown_member` and
 * `session.command.member_incapacitated`.
 */
export const DECLARATION_CODES: ReadonlySet<string> = new Set([
  'battle.declaration.invisible_target',
  'battle.declaration.item_unusable',
  'battle.declaration.target_count',
  'battle.declaration.unknown_action',
  'battle.declaration.weapon_not_wielded',
  'combat.attack.out_of_range',
  'combat.attack.out_of_reach',
  'exploration.item.not_carried',
  'items.scroll.wrong_caster',
  'items.use.not_usable',
  'items.use.target_not_allowed',
  'items.use.unknown_target',
  'magic.cast.not_memorized',
  'magic.cast.out_of_range',
  'magic.cast.target_count',
  'magic.cast.unknown_target',
  'session.command.member_incapacitated',
  'session.command.unknown_member',
]);

/** The params that a declaration adds to a code, beyond those `data/codes.json` lists. */
export function declarationParams(code: string): readonly string[] {
  if (code === 'session.command.member_incapacitated' || code === 'session.command.unknown_member')
    return ['character', 'target'];
  return DECLARATION_CODES.has(code) ? ['character'] : [];
}

/** Build a sentence from the words of a code that has no template: `items.equip.too_heavy` gives `Equip too heavy`. */
export function fallbackRejectionText(code: string): string {
  const words = code.split('.').slice(1).map(prettifyId);
  const reason = words.length > 0 ? words.join(' ') : prettifyId(code);
  return `You can't do that: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
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

// Ability trades in progress -----------------------------------------------------------------------------------

/**
 * The refusals that describe a trade of ability points the player has not finished, not a choice that breaks a
 * rule. The first click on a minus button lowers a score by 1, which is odd, and the second lowers it by 2, which
 * buys a point the player hasn't spent yet. Both are the next step toward a valid trade, so the wizard shows them as
 * guidance. Every other refusal about a trade (a score that can't be lowered or raised, the floor, the cap) means
 * the player chose something bxapi won't take, and stays a warning. A code that is not listed here, including one
 * that bxapi adds later, is a warning until someone decides otherwise.
 */
const TRADE_IN_PROGRESS_CODES: ReadonlySet<string> = new Set([
  'creation.adjustment.reduction_not_even',
  'creation.adjustment.points_mismatch',
]);

/**
 * Whether a refusal describes an ability trade the player is still making.
 *
 * @param code - The rejection code.
 */
export function isTradeInProgress(code: string): boolean {
  return TRADE_IN_PROGRESS_CODES.has(code);
}

/**
 * What to do next, for each trade in progress. Each sentence uses only what bxapi's refusal carries. The
 * `points_mismatch` params already state the points in the unit that a prime requisite spends, so no sentence
 * converts between lowering and raising.
 */
const TRADE_GUIDANCE_TEMPLATES: Record<string, Template> = {
  'creation.adjustment.reduction_not_even':
    "You've lowered {ability|ability} by {amount}. Lower a score by an even amount to gain points.",
  'creation.adjustment.points_mismatch.unspent':
    "You've gained {points_available|count:point} from lowering scores. Raise a prime requisite to finish the trade.",
  'creation.adjustment.points_mismatch.partly_spent':
    "You've gained {points_available|count:point} from lowering scores and spent {points_spent|number}. Raise a prime requisite to spend the rest.",
  'creation.adjustment.points_mismatch.unfunded':
    "You've spent {points_spent|count:point} without lowering a score to pay for the trade. Lower a score to gain points, or reset to your rolled scores.",
  'creation.adjustment.points_mismatch.overspent':
    "You've gained {points_available|count:point} from lowering scores, but you spent {points_spent|number}. Raise a prime requisite by less, or lower a score to gain more points.",
};

function tradeGuidanceKey(rejection: { code: string; params?: ParamMap | undefined }): string | undefined {
  if (rejection.code !== 'creation.adjustment.points_mismatch') return rejection.code;
  const available = Number(rejection.params?.points_available);
  const spent = Number(rejection.params?.points_spent);
  if (!Number.isFinite(available) || !Number.isFinite(spent)) return undefined;
  if (spent === 0) return `${rejection.code}.unspent`;
  if (available === 0) return `${rejection.code}.unfunded`;
  return `${rejection.code}.${spent < available ? 'partly_spent' : 'overspent'}`;
}

/**
 * Describes a trade in progress as guidance about the next step, in the player's terms. A rejection that
 * {@link isTradeInProgress} doesn't list, or one that lacks the params the guidance needs, gets the sentence
 * from {@link describeRejection}.
 *
 * @param rejection - A rejection from a character check, with `code` and `params`.
 * @param ctx - Names for the IDs in the params. Defaults to an empty context.
 */
export function describeTradeGuidance(
  rejection: { code: string; params?: ParamMap | undefined },
  ctx: TextContext = emptyContext(),
): string {
  const key = isTradeInProgress(rejection.code) ? tradeGuidanceKey(rejection) : undefined;
  const template =
    key !== undefined && Object.hasOwn(TRADE_GUIDANCE_TEMPLATES, key)
      ? TRADE_GUIDANCE_TEMPLATES[key]
      : undefined;
  if (template === undefined) return describeRejection(rejection, ctx);
  return removeDashes(renderTemplate(template, rejection.params ?? {}, ctx));
}
