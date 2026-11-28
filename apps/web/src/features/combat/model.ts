/**
 * Pure helpers that read the encounter view and the party's sheets to offer combat choices.
 *
 * Nothing here decides what the rules allow. The helpers read facts the view states (each group's `front_rank`,
 * the wielded weapons' qualities, and the encounter's `immobile` and `reloading` lists) and turn them into the
 * choices to offer a member. They never judge whether an attack, a spell, or a touch reaches its target: bxapi's
 * round preview judges each declaration once it's declared, and the board shows its refusal next to the member.
 */
import type { BattleDeclaration, EncounterGroupView, EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type {
  DeclarationBody,
  DeclarationRefusal,
  DeclarationsState,
  Member,
  RoundProjection,
  Seat,
} from '@bxvtt/shared/protocol';
import {
  battleActionLabel,
  describeRejection,
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
  /** Whether it's a gear item that works as a weapon, such as a torch, rather than a weapon. */
  improvised: boolean;
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
        improvised: false,
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
      improvised: asString(template.item_type) !== 'weapon',
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

/** How far apart two members stand on the range track, or `null` when either has no place. */
export function memberGap(encounter: EncounterView | null, a: string, b: string): number | null {
  const advances = encounter?.advance_feet ?? {};
  const first = advances[a];
  const second = advances[b];
  return first === undefined || second === undefined ? null : Math.abs(first - second);
}

// Attacks ------------------------------------------------------------------------------------------------------

/**
 * One way a member can attack a group this round. The client never judges whether the attack reaches: bxapi's
 * round preview does that once the player declares it, and the board shows its refusal.
 *
 * - `melee`: the member is in the group's `front_rank`, so they attack where they stand.
 * - `missile`: the member wields a missile weapon they can fire this round, so they shoot or throw from where they
 *   stand.
 * - `close`: the member closes on the group and attacks it in the same round.
 */
export interface AttackPlan {
  group: EncounterGroupView;
  /** The member's distance to the group, from `member_distance_feet`. */
  distance: number;
  kind: 'melee' | 'missile' | 'close';
  /** The wielded weapon the attack names in its words, or `null` when the member has none for it. */
  weapon: WeaponInfo | null;
  /** One line about the attack for the choice, such as "Shoots with a sling.". */
  note: string;
  /** Why the member can't make this attack this round, from a list bxapi states, or `null`. */
  reason: string | null;
}

/**
 * The attacks a member can declare on a group, from the facts the view states: the group's `front_rank`, the
 * wielded weapons' qualities, and the encounter's `reloading` and `immobile` lists. A member in the front rank
 * attacks where they stand. Anyone else can shoot with a missile weapon and can close in and attack. Whether a
 * shot or a close reaches is bxapi's to say, so every choice stays open.
 *
 * @param member - The attacking member.
 * @param encounter - The encounter view.
 * @param group - The target group.
 * @param gear - The member's gear.
 * @param weaponId - A wielded weapon the player chose, or `null` to let the session choose.
 */
export function attackPlans(
  member: MemberView,
  encounter: EncounterView,
  group: EncounterGroupView,
  gear: MemberGear,
  weaponId: string | null = null,
): AttackPlan[] {
  const distance = memberDistance(group, member.id);
  const chosen = weaponId === null ? null : (gear.wielded.find((w) => w.id === weaponId) ?? null);
  const melee =
    chosen ?? gear.wielded.find((w) => w.melee && !w.improvised) ?? gear.wielded.find((w) => w.melee) ?? null;
  const strikes = melee ? `strikes with ${melee.name}` : 'strikes unarmed';
  const base = { group, distance };
  if (group.front_rank.includes(member.id)) {
    return [{ ...base, kind: 'melee', weapon: melee, note: `${capitalize(strikes)}.`, reason: null }];
  }
  const plans: AttackPlan[] = [];
  const reloading = encounter.reloading.includes(member.id);
  const missiles = (chosen ? [chosen] : gear.wielded).filter((w) => w.missile);
  const missile = missiles.find((w) => !(reloading && w.reload));
  // A weapon bxapi lists as reloading can't shoot this round. It stays in the list, unavailable with the reason, so
  // the shot doesn't vanish without a word.
  const reloadingWeapon = missile ? undefined : missiles.find((w) => reloading && w.reload);
  const shooter = missile ?? reloadingWeapon;
  if (shooter) {
    plans.push({
      ...base,
      kind: 'missile',
      weapon: shooter,
      note: shooter.thrown ? `Throws ${shooter.name}.` : `Shoots with ${shooter.name}.`,
      reason: missile ? null : `${member.name} is reloading ${shooter.name} this round.`,
    });
  }
  plans.push({
    ...base,
    kind: 'close',
    weapon: melee,
    note: `Closes in, then ${strikes}.`,
    reason: encounter.immobile.includes(member.id) ? `${member.name} can't move this round.` : null,
  });
  return plans;
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

export interface SuggestionFacts {
  /** Whether the member's class casts spells (a magic ability in the class catalog), at any level. */
  casts: boolean;
}

/** Whether the member wears armour or carries a shield, from the inventory. */
export function hasArmour(member: MemberView): boolean {
  const inventory = asRecord(member.inventory);
  return asRecord(inventory?.worn_armour) !== null || asRecord(inventory?.shield) !== null;
}

// Hide and back-stab -------------------------------------------------------------------------------------------

/** The members bxapi lets declare a hide or a back-stab this round. */
export interface StealthLists {
  canHide: readonly string[];
  canBackStab: readonly string[];
}

/**
 * The preview's projection when it was judged at the game's current revision, and otherwise `null`. The store
 * applies the game and the declarations as separate frames, so just after a round resolves the new game can arrive
 * beside the last round's projection. Until the declarations catch up, readers fall back to the encounter.
 *
 * @param declarations - The table's declarations state, or `null` when there is none.
 * @param revision - The revision of the game the store holds, or `null` when there is no game.
 */
export function currentProjection(
  declarations: DeclarationsState | null | undefined,
  revision: number | null,
): RoundProjection | null {
  if (!declarations?.projection || declarations.revision !== revision) return null;
  return declarations.projection;
}

/**
 * Who can hide and who can back-stab this round: the preview's lists, judged beside the planned declarations, when
 * the server has a projection, and otherwise the encounter's lists.
 *
 * @param encounter - The open encounter.
 * @param projection - The projection `currentProjection` returns, or `null` when there is none.
 */
export function stealthLists(
  encounter: EncounterView,
  projection: RoundProjection | null | undefined,
): StealthLists {
  return projection
    ? { canHide: projection.can_hide, canBackStab: projection.can_back_stab }
    : { canHide: encounter.can_hide, canBackStab: encounter.can_back_stab };
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
    case 'hide':
      text = 'Hide in shadows';
      break;
    default:
      text = d.action ? battleActionLabel(d.action) : 'An action';
  }
  if (d.gaze_defense === 'avert_eyes') text += ', averting eyes';
  if (d.gaze_defense === 'mirror') text += ', using a mirror';
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
      return `${capitalize(groupName(d.target_group_id, ctx))} ${group?.fled ? 'have escaped' : 'are gone'}.`;
    }
  }
  if (d.action === 'move' && d.move === 'close' && d.target_group_id && encounter) {
    const group = encounter.groups.find((g) => g.id === d.target_group_id);
    if (group && group.front_rank.includes(member.id))
      return `${member.name} already stands in melee with ${groupName(d.target_group_id, ctx)}.`;
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
 * The text of the refusals of the stored declarations, by member, and the refusals that name no member under
 * `general`. The server previews the declarations as members declare, so these say what the session would
 * refuse before anyone resolves the round.
 */
export function refusalTexts(
  refusals: readonly DeclarationRefusal[],
  ctx: TextContext,
): { byMember: Record<string, string[]>; general: string[] } {
  const byMember: Record<string, string[]> = {};
  const general: string[] = [];
  for (const refusal of refusals) {
    const text = describeRejection({ code: refusal.code, params: toParamMap(refusal.params) }, ctx);
    if (refusal.member_id === null) {
      if (!general.includes(text)) general.push(text);
      continue;
    }
    const list = byMember[refusal.member_id] ?? [];
    if (!list.includes(text)) list.push(text);
    byMember[refusal.member_id] = list;
  }
  return { byMember, general };
}

/**
 * The members whose stored declarations hold up the round, in the order of `declarers`: each current declarer
 * that a refusal names. A refusal that names a member who can no longer act blocks nothing, because that member
 * has no action left to change. The board's Resolve buttons and the action bar's read the same list.
 */
export function blockingMembers(
  refusals: readonly DeclarationRefusal[],
  declarers: readonly string[],
): string[] {
  return declarers.filter((id) => refusals.some((refusal) => refusal.member_id === id));
}

/** Why Resolve round is unavailable while the named members' actions won't work, or `null` for no names. */
export function blockedReason(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return names.length === 1
    ? `${joinList(names)} needs a different action first.`
    : `${joinList(names)} need different actions first.`;
}

/** Why Resolve round is unavailable after bxapi refused the round as a whole and no action has changed since. */
export const ROUND_REFUSED_REASON = "The round can't resolve until an action changes.";

/** That the round waits for the named members to change their actions, or `null` for no names. */
export function blockedNote(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return names.length === 1
    ? `${joinList(names)} needs a different action before the round can resolve.`
    : `${joinList(names)} need different actions before the round can resolve.`;
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

/** One way to cast a spell, as a spell template states it. */
export interface SpellModeLike {
  key: string;
  /** osrlib's label for the mode, such as `Blind a creature`. */
  display_name: string;
}

/**
 * The option label for each way to cast a spell form: the mode's `display_name`, such as "Blind a creature". A
 * form with a single mode has nothing to choose between, and osrlib labels that mode from its key, so its one
 * option takes the form's name instead.
 *
 * @param modes - The modes of the spell form being cast: the spell's own, or its reversed form's.
 * @param formName - The name of the form being cast, as the dialog's title names it, such as "Darkness".
 */
export function spellModeOptions(
  modes: readonly SpellModeLike[],
  formName: string,
): Array<{ value: string; label: string }> {
  return modes.map((mode) => ({
    value: mode.key,
    label: modes.length === 1 ? formName : mode.display_name,
  }));
}

/**
 * A spell's range as the rules catalog writes it, such as "120’", from the structured `range_spec` when it's a
 * distance in feet. An adventure's own spell can write the same range as "120 feet", so the catalog and the game's
 * spells read alike. Any other range keeps its own text, such as "The caster".
 */
export function spellRangeText(spell: {
  range: string;
  range_spec?: { kind: string; feet?: number | null } | null;
}): string {
  const spec = spell.range_spec;
  return spec?.kind === 'feet' && typeof spec.feet === 'number' ? `${spec.feet}’` : spell.range;
}
