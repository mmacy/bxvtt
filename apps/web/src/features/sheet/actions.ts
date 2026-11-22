/**
 * Small helpers for the member actions on the sheet: whether a command is legal now and whether the user may
 * send it for this member, and names for effects.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import type { LegalCommand } from '@bxvtt/shared/protocol';
import { ROUNDS_PER_DAY, ROUNDS_PER_TURN, capitalizeFirst, count, prettifyId } from '@bxvtt/shared/text';
import { useCanSend, useLegalCommand, type Permission } from '@/app';

/** A member command as the sheet offers it. */
export interface MemberCommand {
  /** The legal command, or `null` when bxapi doesn't offer it in this mode. Hide the control then. */
  legal: LegalCommand | null;
  /** Whether the user may send it for the member. Disable the control with `reason` when not. */
  permission: Permission;
}

/**
 * Whether a member command is on offer now, and whether this user may send it for the member.
 *
 * @param commandType - The command, such as `equip_item`.
 * @param memberId - The acting member.
 */
export function useMemberCommand(commandType: string, memberId: string): MemberCommand {
  const legal = useLegalCommand(commandType);
  const permission = useCanSend(commandType, memberId);
  return { legal, permission };
}

const EFFECT_KINDS: Record<string, string> = {
  light: 'Light',
  fatigue: 'Fatigue',
  darkness: 'Darkness',
  bless: 'Bless',
  haste: 'Haste',
  shield: 'Shield',
  invisibility: 'Invisibility',
  protection_from_evil: 'Protection from evil',
  resist_cold: 'Resist cold',
  resist_fire: 'Resist fire',
  detect_magic: 'Detect magic',
  detect_evil: 'Detect evil',
  infravision: 'Infravision',
  levitate: 'Levitation',
  fly: 'Flying',
  silence: 'Silence',
  web: 'Web',
  hold: 'Held',
  sleep: 'Asleep',
  charm: 'Charmed',
  potion: 'Potion',
};

/** A name for an effect kind, such as `light` or `protection_from_evil`. */
export function effectLabel(kind: string): string {
  return EFFECT_KINDS[kind] ?? capitalizeFirst(prettifyId(kind).toLowerCase());
}

/** The time left on an effect, as bxapi reports it in rounds, or `null` when it has no end players can see. */
export function effectRemaining(rounds: number | null | undefined): string | undefined {
  if (rounds === null || rounds === undefined) return undefined;
  if (rounds <= 0) return 'ending';
  return `${compactDuration(rounds)} left`;
}

/** A duration in rounds in the largest unit that fits, such as `3 turns` or `5 rounds`. */
export function compactDuration(rounds: number): string {
  const total = Math.max(0, Math.round(rounds));
  const days = Math.floor(total / ROUNDS_PER_DAY);
  const turns = Math.floor((total % ROUNDS_PER_DAY) / ROUNDS_PER_TURN);
  const rest = total % ROUNDS_PER_TURN;
  if (days > 0) return turns > 0 ? `${count(days, 'day')}, ${count(turns, 'turn')}` : count(days, 'day');
  // Past a turn, the leftover rounds are noise at the table, so the time rounds up to whole turns.
  if (turns > 0) return count(turns + (rest > 0 ? 1 : 0), 'turn');
  return count(rest, 'round');
}

/** How long a light has left for a status line: `about 6 turns` when a turn or more is left, else the rounds. */
export function lightTimeLeft(rounds: number | null | undefined): string | null {
  if (rounds === null || rounds === undefined) return null;
  if (rounds >= ROUNDS_PER_TURN) {
    const turns = Math.round(rounds / ROUNDS_PER_TURN);
    return turns === 1 ? 'about 1 turn' : `about ${turns} turns`;
  }
  return rounds === 1 ? '1 round' : `${rounds} rounds`;
}

/**
 * What a member's light is, for "Brenna's torch": the one kind of light source in the pack, or `light` when the
 * pack holds none or more than one kind, as the map words it.
 */
export function lightNoun(member: MemberView | undefined): string {
  const inventory = member?.inventory as { items?: unknown } | undefined;
  const items = Array.isArray(inventory?.items) ? inventory.items : [];
  const kinds = new Set<string>();
  for (const item of items) {
    const template = (item as { template?: { id?: unknown; params?: Record<string, unknown> } }).template;
    if (typeof template?.id === 'string' && typeof template.params?.light_radius_feet === 'number')
      kinds.add(template.id);
  }
  const [only] = kinds;
  return kinds.size === 1 && (only === 'torch' || only === 'lantern') ? only : 'light';
}

/** A member's light as the play screen words it everywhere: "Brenna's torch, about 6 turns left". */
export function lightPhrase(name: string, rounds: number | null | undefined, noun = 'light'): string {
  const left = lightTimeLeft(rounds);
  return left ? `${name}'s ${noun}, ${left} left` : `${name}'s ${noun}`;
}
