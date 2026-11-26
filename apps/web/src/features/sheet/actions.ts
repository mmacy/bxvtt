/**
 * Small helpers for the member actions on the sheet: whether a command is legal now and whether the user may
 * send it for this member, and names for effects.
 */
import type { LegalCommand } from '@bxvtt/shared/protocol';
import {
  ROUNDS_PER_DAY,
  ROUNDS_PER_TURN,
  capitalizeFirst,
  count,
  prettifyId,
  type TextContext,
} from '@bxvtt/shared/text';
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

/**
 * A name for an effect kind, such as `light` or `protection_from_evil`. A spell's effect has the spell's ID as its
 * kind, and the player view names that spell, including a spell the adventure bundles, so a name in `ctx` comes
 * first.
 *
 * @param kind - The effect's kind.
 * @param ctx - The table's text context, which holds the spell names the player view states.
 */
export function effectLabel(kind: string, ctx?: TextContext): string {
  const spell = ctx?.spells[kind];
  if (spell) return capitalizeFirst(spell);
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
