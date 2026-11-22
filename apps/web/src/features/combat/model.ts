/**
 * Pure helpers that read the encounter view and the party's sheets to offer combat choices.
 *
 * Nothing here decides what the rules allow. The helpers read the facts that the `BattleDeclaration`
 * documentation tells a client to read (each group's `front_rank` and `member_distance_feet`, each member's
 * `encounter_rate_feet`, `immobile`, `reloading`, and `advance_feet`), turn them into the plausible choices for a
 * member, and explain a choice that those facts rule out. bxapi checks every declaration again when the round
 * resolves, and the board shows its refusal next to the declaration it names.
 */
import type { BattleDeclaration, EncounterGroupView, EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type { DeclarationBody, DeclarationRefusal, Member, Seat } from '@bxvtt/shared/protocol';
import {
  describeRejection,
  formatFeet,
  groupName,
  itemPhrase,
  joinList,
  memberName,
  monsterName,
  resolveItemNoun,
  spellName,
  withArticle,
  type TextContext,
} from '@bxvtt/shared/text';
import { toParamMap } from '@/app';

// Inventory ----------------------------------------------------------------------------------------------------

/** A weapon the member wields, as the inventory reports it. */
export interface WeaponInfo {
  /** The ID a declaration's `weapon_id` takes: a catalog ID, or a magic item's instance ID. */
  id: string;
  name: string;
  melee: boolean;
  missile: boolean;
  /** Whether the weapon has the `reload` quality. */
  reload: boolean;
  /**
   * Whether a missile attack throws the weapon rather than shooting from it: a weapon that is also a melee
   * weapon, such as a dagger or a spear, or a one-handed missile weapon that isn't a sling, such as a javelin.
   */
  thrown: boolean;
  /** The far end of the weapon's long range band, in feet, or `null` for a weapon with no ranges. */
  longRangeFeet: number | null;
}

/** What kind of thing a carried item is, for offering it in a fight. */
export type ItemKind = 'potion' | 'scroll' | 'wand' | 'staff' | 'rod' | 'splash' | 'magic' | 'gear';

/** An item in a member's pack. */
export interface CarriedItem {
  /** The ID a declaration's `item_id` takes: a catalog ID, or a magic item's instance ID. */
  id: string;
  /** The display name: the masked name of an unidentified magic item, such as "a potion". */
  name: string;
  kind: ItemKind;
  quantity: number;
  magic: boolean;
}

export interface MemberGear {
  wielded: WeaponInfo[];
  items: CarriedItem[];
}

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function qualitiesOf(record: Json | null): string[] {
  return asArray(record?.qualities).filter((q): q is string => typeof q === 'string');
}

function longRange(ranges: unknown): number | null {
  const long = asRecord(asRecord(ranges)?.long);
  return asNumber(long?.max_feet);
}

function isThrown(qualities: readonly string[]): boolean {
  if (!qualities.includes('missile')) return false;
  if (qualities.includes('melee')) return true;
  return !qualities.some((q) => q === 'two_handed' || q === 'reload' || q === 'blunt');
}

/** The kind of a magic item from its catalog ID or its masked display name. */
export function magicItemKind(templateId: string | null, display: string): ItemKind {
  const text = `${templateId ?? ''} ${display}`.toLowerCase();
  if (/potion/.test(text)) return 'potion';
  if (/scroll/.test(text)) return 'scroll';
  if (/wand/.test(text)) return 'wand';
  if (/staff/.test(text)) return 'staff';
  if (/\brod\b|rod_of/.test(text)) return 'rod';
  return 'magic';
}

/**
 * Reads the member's wielded weapons and carried items from the inventory that the player view reports.
 *
 * @param member - The member's sheet.
 * @param ctx - The text context, which names catalog items.
 */
export function memberGear(member: MemberView, ctx: TextContext): MemberGear {
  const inventory = asRecord(member.inventory);
  const wielded: WeaponInfo[] = [];
  for (const entry of asArray(inventory?.wielded)) {
    const record = asRecord(entry);
    if (record === null) continue;
    if (record.instance_type === 'magic_item') {
      const id = asString(record.instance_id);
      if (id === null) continue;
      const qualities = qualitiesOf(record);
      wielded.push({
        id,
        name: asString(record.name) ?? asString(record.display) ?? 'a magic weapon',
        melee: qualities.includes('melee'),
        missile: qualities.includes('missile'),
        reload: qualities.includes('reload'),
        thrown: isThrown(qualities),
        longRangeFeet: longRange(record.missile_ranges),
      });
      continue;
    }
    const template = asRecord(record.template);
    const id = asString(template?.id);
    if (template === null || id === null) continue;
    // A weapon lists its qualities on the template. A gear item that works as a weapon, such as a torch,
    // lists them under `combat`.
    const combat = asRecord(template.combat);
    const qualities = qualitiesOf(template).length > 0 ? qualitiesOf(template) : qualitiesOf(combat);
    if (qualities.length === 0) continue;
    wielded.push({
      id,
      name: itemPhrase(resolveItemNoun(id, ctx, { name: asString(template.name) ?? undefined })),
      melee: qualities.includes('melee'),
      missile: qualities.includes('missile') && !qualities.includes('splash'),
      reload: qualities.includes('reload'),
      thrown: isThrown(qualities),
      longRangeFeet: longRange(template.missile_ranges ?? combat?.missile_ranges),
    });
  }

  const items: CarriedItem[] = [];
  for (const entry of asArray(inventory?.items)) {
    const record = asRecord(entry);
    if (record === null) continue;
    const quantity = asNumber(record.quantity) ?? 1;
    if (record.instance_type === 'magic_item') {
      const id = asString(record.instance_id);
      if (id === null || quantity < 1) continue;
      const display = asString(record.name) ?? asString(record.display) ?? 'a magic item';
      items.push({
        id,
        name: display,
        kind: magicItemKind(asString(record.template_id), display),
        quantity,
        magic: true,
      });
      continue;
    }
    const template = asRecord(record.template);
    const id = asString(template?.id);
    if (template === null || id === null) continue;
    const splash = qualitiesOf(asRecord(template.combat)).includes('splash');
    items.push({
      id,
      name: resolveItemNoun(id, ctx, { name: asString(template.name) ?? undefined }).one,
      kind: splash ? 'splash' : 'gear',
      quantity,
      magic: false,
    });
  }
  return { wielded, items };
}

/** Whether the member carries an item with this catalog ID. */
export function carries(gear: MemberGear, itemId: string): boolean {
  return gear.items.some((item) => item.id === itemId);
}

/** The items a member can use in a fight with a `use_item` declaration. */
export function usableItems(gear: MemberGear): CarriedItem[] {
  return gear.items.filter((item) => item.kind !== 'gear' && item.kind !== 'magic');
}

// The encounter ------------------------------------------------------------------------------------------------

/** The groups still in the fight: not fled, with someone alive. */
export function liveGroups(encounter: EncounterView | null): EncounterGroupView[] {
  return (encounter?.groups ?? []).filter((group) => !group.fled && group.count > 0);
}

/** The member's distance to a group: the battle's per-member distance, or the group's distance outside battle. */
export function memberDistance(group: EncounterGroupView, memberId: string): number {
  return group.member_distance_feet[memberId] ?? group.distance_feet;
}

/** The nearest live group to a member, the first in the view's order on a tie. */
export function nearestGroup(encounter: EncounterView | null, memberId: string): EncounterGroupView | null {
  let best: EncounterGroupView | null = null;
  for (const group of liveGroups(encounter)) {
    if (best === null || memberDistance(group, memberId) < memberDistance(best, memberId)) best = group;
  }
  return best;
}

/** Whether the member is alive and able to act this round. */
export function isDeclarer(encounter: EncounterView | null, memberId: string): boolean {
  return encounter?.declarers.includes(memberId) ?? false;
}

/**
 * The members who stand within 5 feet of this member on the range track. The `BattleDeclaration` documentation
 * says two members reach each other when their advances differ by 5 feet or less, which a give, a potion given
 * to drink, and a touch need.
 */
export function membersInReach(encounter: EncounterView | null, memberId: string): string[] {
  const advances = encounter?.advance_feet ?? {};
  const mine = advances[memberId];
  if (mine === undefined) return [];
  return Object.entries(advances)
    .filter(([id, advance]) => id !== memberId && Math.abs(advance - mine) <= 5)
    .map(([id]) => id);
}

/** How far apart two members stand on the range track, or `null` when either has no place. */
export function memberGap(encounter: EncounterView | null, a: string, b: string): number | null {
  const advances = encounter?.advance_feet ?? {};
  const first = advances[a];
  const second = advances[b];
  return first === undefined || second === undefined ? null : Math.abs(first - second);
}

// Attacks ------------------------------------------------------------------------------------------------------

/**
 * How a member would attack a group this round:
 *
 * - `melee`: within 5 feet, or in the group's front rank, so the member attacks where they stand.
 * - `missile`: a wielded missile weapon reaches the group, so the member shoots from where they stand.
 * - `close`: the group is within the member's encounter rate plus 5 feet, so the member closes and attacks.
 * - `out_of_reach`: none of these, and `reason` says why.
 */
export interface AttackPlan {
  group: EncounterGroupView;
  distance: number;
  kind: 'melee' | 'missile' | 'close' | 'out_of_reach';
  weapon: WeaponInfo | null;
  /** One line about the attack for the choice, such as "Closes 20 feet, then attacks". */
  note: string;
  /** Why the member can't attack the group this round, when `kind` is `out_of_reach`. */
  reason: string | null;
}

/**
 * Plans a member's attack on a group from the facts that the view reports.
 *
 * @param member - The attacking member.
 * @param encounter - The encounter view.
 * @param group - The target group.
 * @param gear - The member's gear.
 * @param weaponId - A wielded weapon the player chose, or `null` to let the session choose.
 */
export function planAttack(
  member: MemberView,
  encounter: EncounterView,
  group: EncounterGroupView,
  gear: MemberGear,
  weaponId: string | null = null,
): AttackPlan {
  const distance = memberDistance(group, member.id);
  const chosen = weaponId === null ? null : (gear.wielded.find((w) => w.id === weaponId) ?? null);
  const melee = chosen ?? gear.wielded.find((w) => w.melee) ?? null;
  const base = { group, distance };
  if (group.front_rank.includes(member.id) || distance <= 5) {
    return {
      ...base,
      kind: 'melee',
      weapon: melee,
      note: melee ? `In reach. Strikes with ${melee.name}.` : 'In reach. Strikes unarmed.',
      reason: null,
    };
  }
  const reloading = encounter.reloading.includes(member.id);
  const missiles = (chosen ? [chosen] : gear.wielded).filter((w) => w.missile && !(reloading && w.reload));
  const reaching = missiles.find((w) => w.longRangeFeet === null || w.longRangeFeet >= distance);
  if (reaching) {
    return {
      ...base,
      kind: 'missile',
      weapon: reaching,
      note: reaching.thrown
        ? `Throws ${reaching.name} ${formatFeet(distance)}.`
        : `Shoots with ${reaching.name} from ${formatFeet(distance)}.`,
      reason: null,
    };
  }
  const name = member.name;
  if (encounter.immobile.includes(member.id)) {
    return {
      ...base,
      kind: 'out_of_reach',
      weapon: null,
      note: '',
      reason: `${name} can't move this round, and ${formatFeet(distance)} is too far to strike.`,
    };
  }
  const rate = member.encounter_rate_feet;
  if (distance <= rate + 5) {
    return {
      ...base,
      kind: 'close',
      weapon: melee,
      note: `Closes ${formatFeet(Math.max(0, distance - 5))}, then attacks.`,
      reason: null,
    };
  }
  const shortRange = missiles.find((w) => w.longRangeFeet !== null);
  const reason =
    shortRange && shortRange.longRangeFeet !== null
      ? `Out of range: ${formatFeet(distance)} away, and ${shortRange.name} reaches ${formatFeet(shortRange.longRangeFeet)}.`
      : `Out of reach: ${formatFeet(distance)} away, and ${name} moves ${formatFeet(rate)} a round.`;
  return { ...base, kind: 'out_of_reach', weapon: null, note: '', reason };
}

/** The declaration for an attack plan. */
export function attackDeclaration(
  plan: AttackPlan,
  options: { weaponId?: string | null; backStab?: boolean } = {},
): DeclarationBody {
  const body: DeclarationBody = { action: 'attack', target_group_id: plan.group.id };
  if (options.weaponId) body.weapon_id = options.weaponId;
  if (plan.kind === 'close') body.move = 'close';
  if (options.backStab) body.back_stab = true;
  return body;
}

/**
 * The common case: attack the nearest group with the wielded weapon, closing in when that brings the member
 * into reach. Returns `null` when no group is left, and the plan with its reason when the group is out of reach.
 */
export function quickAttack(
  member: MemberView,
  encounter: EncounterView | null,
  gear: MemberGear,
): { plan: AttackPlan; declaration: DeclarationBody | null } | null {
  if (encounter === null) return null;
  const group = nearestGroup(encounter, member.id);
  if (group === null) return null;
  const plan = planAttack(member, encounter, group, gear);
  return { plan, declaration: plan.kind === 'out_of_reach' ? null : attackDeclaration(plan) };
}

// Words for declarations ---------------------------------------------------------------------------------------

function targetPhrase(ids: readonly string[], ctx: TextContext): string {
  const members = ids.filter((id) => id.startsWith('character-')).map((id) => memberName(id, ctx));
  // Monsters a player can't tell apart read as a count, such as "2 goblins", not "a goblin and a goblin".
  const counts = new Map<string, { n: number; plural: string }>();
  for (const id of ids.filter((i) => !i.startsWith('character-'))) {
    const name = monsterName(id, ctx);
    const known = ctx.monsters[id];
    const sole = Object.values(ctx.groups).find((g) => withArticle(g.label) === name);
    const plural = known?.labelPlural ?? sole?.labelPlural ?? 'monsters';
    const entry = counts.get(name) ?? { n: 0, plural };
    entry.n += 1;
    counts.set(name, entry);
  }
  const monsters = [...counts.entries()].map(([name, { n, plural }]) => (n === 1 ? name : `${n} ${plural}`));
  return joinList([...members, ...monsters]);
}

function declaredItem(itemId: string | null | undefined, gear: MemberGear | null, ctx: TextContext): string {
  if (!itemId) return 'an item';
  const carried = gear?.items.find((item) => item.id === itemId);
  if (carried?.magic) return carried.name;
  return itemPhrase(resolveItemNoun(itemId, ctx, carried ? { name: carried.name } : {}));
}

/**
 * Describes a declaration in a short phrase for the round's list, such as "Attack the goblins, closing in".
 *
 * @param declaration - The declaration.
 * @param ctx - The text context.
 * @param gear - The declaring member's gear, to name items and weapons.
 */
export function describeDeclaration(
  declaration: Partial<BattleDeclaration> | DeclarationBody,
  ctx: TextContext,
  gear: MemberGear | null = null,
): string {
  const d = declaration as Partial<BattleDeclaration>;
  const group = d.target_group_id ? groupName(d.target_group_id, ctx) : null;
  const targets = d.targets ?? [];
  let text: string;
  switch (d.action) {
    case 'attack': {
      const weapon = d.weapon_id ? gear?.wielded.find((w) => w.id === d.weapon_id) : undefined;
      text = `${d.back_stab ? 'Back-stab' : 'Attack'} ${group ?? 'the monsters'}`;
      if (weapon) text += ` with ${weapon.name}`;
      if (d.move === 'close') text += ', closing in';
      break;
    }
    case 'cast': {
      const spell = spellName(d.spell_id, ctx);
      const at = targets.length > 0 ? targetPhrase(targets, ctx) : group;
      text = `Cast ${d.reversed ? `reversed ${spell}` : spell}${at ? ` at ${at}` : ''}`;
      break;
    }
    case 'move':
      if (d.move === 'close') text = `Close in on ${group ?? 'the monsters'}`;
      else if (d.move === 'fighting_withdrawal') text = 'Fighting withdrawal';
      else if (d.move === 'retreat') text = 'Retreat';
      else text = 'Move';
      if (d.replacement_id) text += `, trading places with ${memberName(d.replacement_id, ctx)}`;
      break;
    case 'use_item': {
      const carried = d.item_id ? gear?.items.find((item) => item.id === d.item_id) : undefined;
      const item = declaredItem(d.item_id, gear, ctx);
      if (carried?.kind === 'potion') {
        text = targets[0] ? `Give ${memberName(targets[0], ctx)} ${item} to drink` : `Drink ${item}`;
      } else if (carried?.kind === 'splash') {
        text = `Throw ${item} at ${group ?? 'the monsters'}`;
      } else if (carried?.kind === 'scroll') {
        text = `Read ${item}`;
      } else if (group) {
        text = `Use ${item} on ${group}`;
      } else if (targets[0]) {
        text = `Use ${item} on ${targetPhrase(targets, ctx)}`;
      } else {
        text = `Use ${item}`;
      }
      break;
    }
    case 'give_item':
      text = `Give ${declaredItem(d.item_id, gear, ctx)} to ${targets[0] ? memberName(targets[0], ctx) : 'a party member'}`;
      break;
    case 'turn_undead':
      text = 'Turn undead';
      break;
    case 'hold':
      text = 'Hold';
      break;
    default:
      text = 'An action';
  }
  if (d.gaze_defense === 'avert_eyes') text += ', averting eyes';
  if (d.gaze_defense === 'mirror') text += ', watching in a mirror';
  return text;
}

/** A declaration as the server stores it, without `character_id`, so it can be sent again. */
export function declarationBody(declaration: Partial<BattleDeclaration> | DeclarationBody): DeclarationBody {
  const { character_id: _id, ...rest } = declaration as Record<string, unknown>;
  return rest as DeclarationBody;
}

/**
 * Why last round's declaration no longer fits, from what the view reports, or `null` when it can be sent
 * again. bxapi still checks it when the round resolves.
 */
export function repeatProblem(
  declaration: DeclarationBody,
  member: MemberView,
  encounter: EncounterView | null,
  gear: MemberGear,
  ctx: TextContext,
): string | null {
  const d = declaration as Partial<BattleDeclaration>;
  if (d.target_group_id) {
    const group = encounter?.groups.find((g) => g.id === d.target_group_id);
    if (!group || group.fled || group.count === 0) {
      return `${capitalize(groupName(d.target_group_id, ctx))} ${group?.fled ? 'have fled' : 'are gone'}.`;
    }
  }
  if (d.action === 'cast' && d.spell_id) {
    const memorized = member.memorized_spells.some((s) => asRecord(s)?.spell_id === d.spell_id);
    if (!memorized) return `${member.name} has no ${spellName(d.spell_id, ctx)} spell left.`;
  }
  if ((d.action === 'use_item' || d.action === 'give_item') && d.item_id) {
    if (!gear.items.some((item) => item.id === d.item_id))
      return `${member.name} no longer carries that item.`;
  }
  for (const target of d.targets ?? []) {
    if (target.startsWith('character-') && !(encounter?.declarers.includes(target) ?? false)) {
      return `${memberName(target, ctx)} can't act this round.`;
    }
  }
  return null;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// People -------------------------------------------------------------------------------------------------------

/** The table member in a party member's seat, or `null` for an empty seat, which referees control. */
export function seatOwner(
  seats: readonly Seat[],
  members: readonly Member[],
  memberId: string,
): Member | null {
  const seat = seats.find((s) => s.member_id === memberId);
  if (!seat?.user_id) return null;
  return members.find((m) => m.user_id === seat.user_id) ?? null;
}

// Refusals -----------------------------------------------------------------------------------------------------

/**
 * The text of the last attempt's refusals, by member, and the refusals that name no member under `null`.
 */
export function refusalTexts(
  refusals: readonly DeclarationRefusal[],
  ctx: TextContext,
): { byMember: Record<string, string[]>; general: string[] } {
  const byMember: Record<string, string[]> = {};
  const general: string[] = [];
  const add = (memberId: string, text: string) => {
    const list = byMember[memberId] ?? [];
    if (!list.includes(text)) list.push(text);
    byMember[memberId] = list;
  };
  for (const refusal of refusals) {
    const text = describeRejection({ code: refusal.code, params: toParamMap(refusal.params) }, ctx);
    const candidates = refusal.candidates ?? [];
    if (refusal.member_id !== null) add(refusal.member_id, text);
    else if (candidates.length === 1 && candidates[0]) add(candidates[0], text);
    else if (candidates.length > 1)
      for (const id of candidates) add(id, `One of these declarations was refused: ${lowerFirst(text)}`);
    else if (!general.includes(text)) general.push(text);
  }
  return { byMember, general };
}

function lowerFirst(text: string): string {
  // Keep a sentence that starts with a name capitalized.
  return /^(The|A|An|This|That|It|One|Every|No)\b/.test(text)
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

// Spells -------------------------------------------------------------------------------------------------------

/** The member's memorized spells, one entry per spell with a count of copies, in memorization order. */
export function memorizedSpells(
  member: MemberView,
): Array<{ spellId: string; reversed: boolean; copies: number }> {
  const list: Array<{ spellId: string; reversed: boolean; copies: number }> = [];
  for (const entry of member.memorized_spells) {
    const record = asRecord(entry);
    const spellId = asString(record?.spell_id);
    if (spellId === null) continue;
    const reversed = record?.reversed === true;
    const existing = list.find((s) => s.spellId === spellId && s.reversed === reversed);
    if (existing) existing.copies += 1;
    else list.push({ spellId, reversed, copies: 1 });
  }
  return list;
}

/** A spell's reach in feet from its range spec, for a range stated in feet or a touch, otherwise `null`. */
export function spellRangeFeet(
  rangeSpec: { kind?: string; feet?: number | null; per_level_feet?: number | null } | null | undefined,
): number | null {
  if (!rangeSpec) return null;
  if (rangeSpec.kind === 'touch') return 5;
  if (rangeSpec.kind === 'feet' && typeof rangeSpec.feet === 'number' && !rangeSpec.per_level_feet)
    return rangeSpec.feet;
  return null;
}

/** A label for a spell mode from its targeting, such as "One creature" or "By Hit Dice". */
export function spellModeLabel(targeting: string | null | undefined): string {
  switch (targeting) {
    case 'self':
      return 'On the caster';
    case 'single':
      return 'One creature';
    case 'up_to_n':
      return 'Several creatures';
    case 'hd_budget':
      return 'By Hit Dice';
    case 'area':
      return 'An area';
    case 'gaze':
      return 'A gaze';
    default:
      return 'Cast';
  }
}
