/**
 * Typed access to the captured bxapi fixtures. Each fixture holds a player view and a trimmed
 * referee view (adventure, dungeon state, and mode) from the same revision. `capture-fixtures.mjs`
 * explains how they were made.
 */
import type { DungeonSpec, DungeonState, PlayerView } from '../model';
import barrow from './barrow.json';
import hills from './hills.json';
import showcaseDark from './showcase-dark.json';
import showcaseExplored from './showcase-explored.json';
import showcaseLevel2 from './showcase-level2.json';

export interface Fixture {
  note: string;
  view: PlayerView;
  referee: {
    mode: string;
    adventure: { name: string; dungeons: DungeonSpec[] };
    dungeon_state: DungeonState;
  };
}

export type FixtureName = 'barrow' | 'hills' | 'showcase-dark' | 'showcase-explored' | 'showcase-level2';

const raw: Record<FixtureName, unknown> = {
  barrow,
  hills,
  'showcase-dark': showcaseDark,
  'showcase-explored': showcaseExplored,
  'showcase-level2': showcaseLevel2,
};

/** The JSON files match the bxapi schema because they are captured bxapi responses. */
export function fixture(name: FixtureName): Fixture {
  return raw[name] as Fixture;
}

/** The level spec for a `"{dungeon}:{level}"` key in a fixture's adventure. */
export function fixtureLevel(f: Fixture, dungeonId: string, levelNumber: number) {
  const level = f.referee.adventure.dungeons
    .find((d) => d.id === dungeonId)
    ?.levels.find((l) => l.number === levelNumber);
  if (!level) throw new Error(`no level ${dungeonId}:${levelNumber}`);
  return level;
}
