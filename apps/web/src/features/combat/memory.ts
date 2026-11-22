/**
 * What the combat views remember between renders and between mounts: each member's declaration from earlier
 * rounds (for "same as last round"), which monster group a monster belongs to as the events reveal it, and
 * the encounter as it stood at recent revisions (so a round's playback starts from where everyone stood).
 *
 * It lives at module level because the encounter panel and the battle board mount and unmount as the mode
 * changes, and the playback of a round needs the state from before the round.
 */
import type { EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import type { DeclarationBody } from '@bxvtt/shared/protocol';
import { create } from 'zustand';

/** The encounter and the party at one game revision. */
export interface CombatSnapshot {
  tableId: string;
  revision: number;
  encounter: EncounterView | null;
  party: readonly MemberView[];
}

interface CombatMemory {
  /** The last declaration saved for each member, keyed `table:member`, with the round it was for. */
  declarations: Record<string, { round: number; declaration: DeclarationBody }>;
  /** Monster ID to group ID, keyed `table:monster`, learned from events and the round's declarations. */
  monsterGroups: Record<string, string>;
  /** Recent snapshots, oldest first. */
  snapshots: CombatSnapshot[];
}

const MAX_SNAPSHOTS = 12;

export const useCombatMemory = create<CombatMemory>()(() => ({
  declarations: {},
  monsterGroups: {},
  snapshots: [],
}));

/** Remembers the declarations of a round, so the next round can repeat them. */
export function rememberDeclarations(
  tableId: string,
  round: number,
  declarations: Record<string, DeclarationBody>,
): void {
  const current = useCombatMemory.getState().declarations;
  let changed = false;
  const next = { ...current };
  for (const [memberId, declaration] of Object.entries(declarations)) {
    const key = `${tableId}:${memberId}`;
    if (current[key]?.declaration === declaration) continue;
    next[key] = { round, declaration };
    changed = true;
  }
  if (changed) useCombatMemory.setState({ declarations: next });
}

/** The member's most recent declaration from a round before `round`, or `null`. */
export function previousDeclaration(
  declarations: CombatMemory['declarations'],
  tableId: string,
  memberId: string,
  round: number,
): DeclarationBody | null {
  const entry = declarations[`${tableId}:${memberId}`];
  return entry !== undefined && entry.round < round ? entry.declaration : null;
}

/** Records which group each monster belongs to. */
export function learnMonsterGroups(tableId: string, pairs: ReadonlyArray<[string, string]>): void {
  if (pairs.length === 0) return;
  const current = useCombatMemory.getState().monsterGroups;
  const next = { ...current };
  let changed = false;
  for (const [monsterId, groupId] of pairs) {
    const key = `${tableId}:${monsterId}`;
    if (next[key] === groupId) continue;
    next[key] = groupId;
    changed = true;
  }
  if (changed) useCombatMemory.setState({ monsterGroups: next });
}

/** Records the encounter at a revision. */
export function recordSnapshot(snapshot: CombatSnapshot): void {
  const list = useCombatMemory.getState().snapshots;
  const last = list.at(-1);
  if (
    last !== undefined &&
    last.tableId === snapshot.tableId &&
    last.revision === snapshot.revision &&
    last.encounter === snapshot.encounter &&
    last.party === snapshot.party
  )
    return;
  const rest = list.filter((s) => !(s.tableId === snapshot.tableId && s.revision === snapshot.revision));
  useCombatMemory.setState({ snapshots: [...rest, snapshot].slice(-MAX_SNAPSHOTS) });
}

/** The latest snapshot of the table from before `revision`, or `null`. */
export function snapshotBefore(tableId: string, revision: number): CombatSnapshot | null {
  const list = useCombatMemory.getState().snapshots;
  let best: CombatSnapshot | null = null;
  for (const snapshot of list) {
    if (snapshot.tableId !== tableId || snapshot.revision >= revision) continue;
    if (best === null || snapshot.revision > best.revision) best = snapshot;
  }
  return best;
}

/** Forgets everything. Tests call it between cases. */
export function resetCombatMemory(): void {
  useCombatMemory.setState({ declarations: {}, monsterGroups: {}, snapshots: [] });
}
