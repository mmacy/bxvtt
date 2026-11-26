/**
 * Builders for the parts of bxapi's player view that tests make up: a whole view, a feature, a pile, and the
 * party's cell in a fixture snapshot. Each builder fills every field the view requires, so a test sets only the
 * fields it is about.
 *
 * ```ts
 * const snapshot = fixtureSnapshot('exploring', 'player');
 * addFeatureAtParty(snapshot, { id: 'feature:chest', description: 'An iron-bound chest.' });
 * addPileAtParty(snapshot, { contents: [{ item_id: 'torch', quantity: 1 }] });
 * setRoomTrap(snapshot, 'found');
 * ```
 */
import type { EnteredAreaView, ExploredLevelView, MapFeatureView, PileView } from '@bxvtt/shared/bxapi';
import type { GameState, PlayerView } from '@bxvtt/shared/protocol';
import type { HereFeature } from '../here';
import type { Snapshot } from './fixtures';

/** A player view with every required field empty, in the exploring mode, with `fields` on top. */
export function playerView(fields: Partial<PlayerView> = {}): PlayerView {
  return {
    adventure_name: 'Test adventure',
    adventure_description: '',
    town_name: 'Town',
    town_description: '',
    town_services: [],
    town_healing_prices: {},
    party: [],
    location: { kind: 'town' },
    clock_rounds: 0,
    mode: 'exploring',
    explored: [],
    dungeons: [],
    can_travel_to_town: false,
    features_here: [],
    piles: {},
    emptied_caches: [],
    effects: [],
    spell_names: {},
    reversed_spell_names: {},
    spell_levels: {},
    item_names: {},
    item_names_plural: {},
    fatigued: false,
    exhausted: false,
    deprivation: {},
    journal: [],
    quests: [],
    encounter: null,
    ...fields,
  };
}

/** An explored level with no cells, edges, or features, with `fields` on top. */
export function exploredLevel(
  fields: Partial<ExploredLevelView> & Pick<ExploredLevelView, 'dungeon_id' | 'level_number'>,
): ExploredLevelView {
  return { cells: [], edges: {}, areas: [], features: [], transitions: [], entrance: null, ...fields };
}

/** An entered area with no trap the party knows, with `fields` on top. */
export function enteredArea(fields: Partial<EnteredAreaView> & Pick<EnteredAreaView, 'id'>): EnteredAreaView {
  return { name: '', description: '', cells: [], trap_state: null, ...fields };
}

/** A treasure cache of the player view that the party hasn't emptied and knows no trap on, with `fields` on top. */
export function mapFeature(fields: Partial<MapFeatureView> & Pick<MapFeatureView, 'id'>): MapFeatureView {
  return {
    kind: 'treasure_cache',
    description: '',
    cell: null,
    area_id: null,
    trap_state: null,
    emptied: false,
    ...fields,
  };
}

/** A dropped pile with nothing in it, with `fields` on top. */
export function pileView(fields: Partial<PileView> = {}): PileView {
  return {
    items: [],
    coins_gp_value: 0,
    coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    contents: [],
    ...fields,
  };
}

/** A cache where the party stands, in reach, not emptied, and with no known trap, with `fields` on top. */
export function hereFeature(fields: Partial<HereFeature> & Pick<HereFeature, 'id'>): HereFeature {
  return {
    kind: 'treasure_cache',
    description: '',
    cell: null,
    areaId: null,
    trapState: null,
    inReach: true,
    emptied: false,
    ...fields,
  };
}

/** Where the party stands in a fixture snapshot, with the objects a test changes in place. */
export interface PartyCell {
  game: GameState;
  view: PlayerView;
  level: ExploredLevelView;
  position: [number, number];
  /** The entered area that covers the party's cell, or `null` in a passage. */
  area: EnteredAreaView | null;
  /** The cell reference that keys the party's pile in `view.piles`. */
  pileRef: string;
}

/** Finds the party's cell in a snapshot. Throws when the party isn't on a level the view lists. */
export function partyCell(snapshot: Snapshot): PartyCell {
  const game = snapshot.game;
  if (game === null) throw new Error('The snapshot has no game.');
  const view = game.view;
  const location = view.location;
  const position = location.position;
  if (location.kind !== 'dungeon' || position == null) throw new Error('The party is in town.');
  const level = view.explored.find(
    (entry) => entry.dungeon_id === location.dungeon_id && entry.level_number === location.level_number,
  );
  if (level === undefined) throw new Error('The view lists no level for the party.');
  const area =
    level.areas.find((entry) => entry.cells.some(([x, y]) => x === position[0] && y === position[1])) ?? null;
  const pileRef = `cell:${level.dungeon_id}:${level.level_number}:${position[0]},${position[1]}`;
  return { game, view, level, position: [position[0], position[1]], area, pileRef };
}

/**
 * Adds a feature on the party's cell. By default it's in reach, so its ID goes into `features_here` as bxapi
 * lists a cache the party can reach. Pass `inReach: false` for one the treasure commands won't accept from here.
 *
 * @returns The feature, which the test can change further.
 */
export function addFeatureAtParty(
  snapshot: Snapshot,
  fields: Partial<MapFeatureView> & Pick<MapFeatureView, 'id'>,
  { inReach = true }: { inReach?: boolean } = {},
): MapFeatureView {
  const { view, level, position } = partyCell(snapshot);
  const feature = mapFeature({ cell: position, ...fields });
  level.features = [...level.features, feature];
  if (inReach) view.features_here = [...view.features_here, feature.id];
  return feature;
}

/**
 * Drops a pile on the party's cell, and names its contents in `item_names` and `item_names_plural` from `names`.
 *
 * @param names - Item names by ID, as `[singular, plural]`.
 * @returns The pile.
 */
export function addPileAtParty(
  snapshot: Snapshot,
  fields: Partial<PileView> = {},
  names: Readonly<Record<string, readonly [string, string]>> = {},
): PileView {
  const { view, pileRef } = partyCell(snapshot);
  const pile = pileView(fields);
  view.piles = { ...view.piles, [pileRef]: pile };
  for (const [id, [one, many]] of Object.entries(names)) {
    view.item_names = { ...view.item_names, [id]: one };
    view.item_names_plural = { ...view.item_names_plural, [id]: many };
  }
  return pile;
}

/** Sets the trap state the party knows for the area it stands in. Throws in a passage. */
export function setRoomTrap(snapshot: Snapshot, state: EnteredAreaView['trap_state']): void {
  const { area } = partyCell(snapshot);
  if (area === null) throw new Error('The party is in a passage.');
  area.trap_state = state;
}
