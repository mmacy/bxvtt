/**
 * Small readers over the party's sheets in the player view. They read what bxapi states, such as a thief's
 * skills or the params of a carried item, and never work out a rule.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import type { PlayerView } from '@bxvtt/shared/protocol';
import { ROUNDS_PER_TURN, formatDurationRounds } from '@bxvtt/shared/text';

/** A mundane item in a member's pack, as the player view serializes it. */
export interface PackItem {
  id: string;
  name: string;
  quantity: number;
  params: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The mundane items in a member's pack. The player view types the inventory loosely, so this reads each
 * entry with checks and skips magic items, which have no template.
 */
export function packItems(member: MemberView): PackItem[] {
  const items = member.inventory['items'];
  if (!Array.isArray(items)) return [];
  const out: PackItem[] = [];
  for (const entry of items) {
    const item = record(entry);
    if (item === null || item['instance_type'] !== 'item') continue;
    const template = record(item['template']);
    if (template === null || typeof template['id'] !== 'string') continue;
    out.push({
      id: template['id'],
      name: typeof template['name'] === 'string' ? template['name'] : template['id'],
      quantity: typeof item['quantity'] === 'number' ? item['quantity'] : 1,
      params: record(template['params']) ?? {},
    });
  }
  return out;
}

/** Whether bxapi lists the member as dead. */
export function isDead(member: MemberView): boolean {
  return member.conditions.includes('dead');
}

/** The members who aren't dead, in marching order. */
export function livingMembers(party: readonly MemberView[]): MemberView[] {
  return party.filter((member) => !isDead(member));
}

/** Whether the member's sheet lists a thief skill. */
export function hasThiefSkill(member: MemberView, skill: string): boolean {
  const skills = member.thief_skills as Record<string, unknown> | undefined;
  return skills !== undefined && skill in skills;
}

/** A light source a member carries: an item whose params state a light radius. */
export interface CarriedLight {
  memberId: string;
  itemId: string;
  /** The item's catalog name, such as `Torches (6)`. */
  name: string;
  quantity: number;
}

/** The torches and lanterns the members carry. */
export function carriedLights(party: readonly MemberView[]): CarriedLight[] {
  const lights: CarriedLight[] = [];
  for (const member of party) {
    for (const item of packItems(member)) {
      if (typeof item.params['light_radius_feet'] !== 'number') continue;
      lights.push({ memberId: member.id, itemId: item.id, name: item.name, quantity: item.quantity });
    }
  }
  return lights;
}

/** Whether a dropped flask of oil lies on the party's cell, which `light_source` can set alight. */
export function oilOnCell(view: PlayerView): boolean {
  const location = view.location;
  if (location.kind !== 'dungeon' || !location.position) return false;
  const [x, y] = location.position;
  const ref = `${location.dungeon_id}:${location.level_number}:${x},${y}`;
  const pile = view.piles[ref];
  return pile !== undefined && pile.items.some((id) => id === 'oil_flask' || id.startsWith('oil_flask'));
}

/** A light burning on a member, from the player view's effects. */
export interface BurningLight {
  memberId: string;
  /** Rounds left, or `null` when it doesn't expire. */
  remainingRounds: number | null;
}

/** The lights burning in the party, and whether magical darkness is on a member. */
export function partyLight(view: PlayerView): { lights: BurningLight[]; darkness: boolean } {
  const lights: BurningLight[] = [];
  let darkness = false;
  for (const effect of view.effects) {
    if (effect.kind === 'light' || effect.kind === 'continual_light') {
      // One entry for each member: the light that lasts longest, or one that never goes out.
      const existing = lights.find((light) => light.memberId === effect.character_id);
      const rounds = effect.remaining_rounds;
      if (!existing) lights.push({ memberId: effect.character_id, remainingRounds: rounds });
      else if (existing.remainingRounds !== null && (rounds === null || rounds > existing.remainingRounds))
        existing.remainingRounds = rounds;
    }
    if (effect.kind === 'darkness' || effect.kind === 'continual_darkness') darkness = true;
  }
  return { lights, darkness };
}

/**
 * How long a light has left, short enough for a status line: `6 turns` when a turn or more is left, and the
 * rounds when less is left. A turn is 60 rounds.
 */
export function lightTimeLeft(rounds: number | null): string | null {
  if (rounds === null) return null;
  if (rounds >= ROUNDS_PER_TURN) {
    const turns = Math.round(rounds / ROUNDS_PER_TURN);
    return turns === 1 ? 'about 1 turn' : `about ${turns} turns`;
  }
  return rounds === 1 ? '1 round' : `${rounds} rounds`;
}

/** How long a light has left, in full: `5 turns and 57 rounds (59 minutes 30 seconds)`. */
export function lightTimeLeftFull(rounds: number | null): string | null {
  return rounds === null ? null : formatDurationRounds(rounds);
}
