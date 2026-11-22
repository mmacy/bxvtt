/**
 * The battle round the party is declaring for. osrlib's `battle_round` counts the rounds already resolved, and a
 * monsters' free round counts as the first, so the round being declared is `battle_round + 1`. The battle board,
 * the top bar, and the playback's "Round N begins" all show this number.
 *
 * ```tsx
 * const round = useBattleRound(); // 1 while the party declares for the first round
 * ```
 */
import { useTableStore } from './table/context';

/**
 * The round being declared for an encounter view.
 *
 * @param encounter - The player view's encounter, or `null`.
 * @returns The round number, from 1, or `null` when no battle is open.
 */
export function battleRound(encounter: { battle_round?: number | null } | null | undefined): number | null {
  if (encounter === null || encounter === undefined) return null;
  const resolved = encounter.battle_round;
  return resolved === null || resolved === undefined ? null : resolved + 1;
}

/** The battle round the party is declaring for, from 1, or `null` when no battle is open. */
export function useBattleRound(): number | null {
  return useTableStore((s) => battleRound(s.game?.view.encounter));
}
