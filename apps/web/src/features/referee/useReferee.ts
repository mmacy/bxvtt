/**
 * The referee's data in one place: the referee state, the adventure document, the text context, and what play
 * has recorded. Each part comes from the referee hooks in `@/app`, which return `null` for a player and for a
 * referee with the lens off, so every referee view goes blank with them.
 */
import type { RefereeState } from '@bxvtt/shared/protocol';
import type { TextContext } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { useAdventureDocument, useRefereeState, useTextContext } from '@/app';
import type { ProblemMessage } from '@/app';
import {
  areaAt,
  asAdventure,
  findLevel,
  partyPlace,
  playRecord,
  type Adventure,
  type AreaSpec,
  type DungeonSpec,
  type LevelSpec,
  type PartyPlace,
  type PlayRecord,
} from './model/adventure';

export interface RefereeData {
  state: RefereeState | null;
  adventure: Adventure | null;
  adventureLoading: boolean;
  adventureError: ProblemMessage | null;
  ctx: TextContext;
  record: PlayRecord | null;
  place: PartyPlace | null;
  /** The party's dungeon, level, and area, when it is in a dungeon and the adventure has loaded. */
  here: { dungeon: DungeonSpec; level: LevelSpec; area: AreaSpec | null; x: number; y: number } | null;
}

/** Reads everything the referee panel shows. */
export function useRefereeData(): RefereeData {
  const state = useRefereeState();
  const document = useAdventureDocument();
  const ctx = useTextContext();
  const adventure = useMemo(() => asAdventure(document.data), [document.data]);
  const record = useMemo(() => (state ? playRecord(state) : null), [state]);
  const place = useMemo(() => (state ? partyPlace(state) : null), [state]);
  const here = useMemo(() => {
    if (!adventure || !place || place.kind !== 'dungeon') return null;
    const level = findLevel(adventure, place.dungeonId, place.levelNumber);
    const dungeon = adventure.dungeons.find((d) => d.id === place.dungeonId);
    if (!level || !dungeon) return null;
    return { dungeon, level, area: areaAt(level, place.x, place.y), x: place.x, y: place.y };
  }, [adventure, place]);
  return {
    state,
    adventure,
    adventureLoading: document.loading,
    adventureError: document.error,
    ctx,
    record,
    place,
    here,
  };
}
