import type {
  Adventure,
  AreaSpec,
  DungeonState,
  FeatureSpec,
  LevelSpec,
  TransitionSpec,
} from '@bxvtt/shared/bxapi';
import type {
  GameEvent,
  PlayerView,
  Scene,
  SceneArea,
  SceneCache,
  SceneFeature,
  SceneHere,
  SceneLevel,
  SceneTransition,
  SceneTrap,
} from '@bxvtt/shared/protocol';

/** A cell position. */
type Position = [number, number];

/** What the scene builder reads: the referee view's adventure and dungeon overlay, and the session mode. */
export interface SceneSource {
  adventure: Adventure;
  dungeonState: DungeonState;
}

/** The event fields that hold item, magic item, or valuable IDs. */
const ITEM_FIELDS = ['item_id', 'item_ids', 'valuable_ids', 'magic_item_ids', 'weapon_id'];

/** An instance ID that the session allocated, such as `magic-item-0001` or `valuable-0002`. */
const INSTANCE_ID = /-\d{4,}$/;

/** The key of a level in the dungeon overlay, `"{dungeon}:{level}"`. */
function levelKey(dungeonId: string, levelNumber: number): string {
  return `${dungeonId}:${levelNumber}`;
}

/** The key of a cell, for set lookups. */
function cellKey(position: readonly number[]): string {
  return `${position[0]},${position[1]}`;
}

/** The cell reference bxapi uses for a cell, `"cell:{dungeon}:{level}:{x},{y}"`. */
function cellRef(dungeonId: string, levelNumber: number, position: readonly number[]): string {
  return `cell:${dungeonId}:${levelNumber}:${cellKey(position)}`;
}

/** The area that covers a cell: the first area of the level that lists it, as osrlib's `area_at` decides. */
function areaAt(level: LevelSpec, position: readonly number[]): AreaSpec | null {
  const key = cellKey(position);
  return level.areas?.find((area) => area.cells.some((cell) => cellKey(cell) === key)) ?? null;
}

/** Which way a transition leads from a level. */
function leads(transition: TransitionSpec, dungeonId: string, levelNumber: number): SceneTransition['leads'] {
  if (transition.to_dungeon_id !== dungeonId) return 'elsewhere';
  if (transition.to_level_number > levelNumber) return 'down';
  if (transition.to_level_number < levelNumber) return 'up';
  return 'same_level';
}

/**
 * The trap state the party knows for a trap reference, or `null` when the party doesn't know about the trap.
 *
 * @param state - The dungeon overlay.
 * @param ref - An area or feature reference, `"{dungeon}:{level}:{id}"`.
 */
function knownTrapState(state: DungeonState, ref: string): SceneTrap['state'] | null {
  if (state.removed_traps?.includes(ref)) return 'removed';
  if (state.sprung_traps?.includes(ref)) return 'sprung';
  if (state.found_traps?.includes(ref)) return 'found';
  return null;
}

/** Reads a display name from one inventory entry of the player view. */
function addInventoryName(names: Map<string, string>, entry: unknown): void {
  if (typeof entry !== 'object' || entry === null) return;
  const record = entry as Record<string, unknown>;
  const template = record.template as { id?: unknown; name?: unknown } | undefined;
  if (typeof record.instance_id === 'string') {
    // The player view masks an unidentified magic item: it carries `name` only once the item is identified, and
    // `display` (like "a potion") before that.
    const name = [record.name, record.display, record.kind].find((value) => typeof value === 'string');
    if (typeof name === 'string') names.set(record.instance_id, name);
  } else if (template !== undefined && typeof template.id === 'string' && typeof template.name === 'string') {
    names.set(template.id, template.name);
  }
}

/**
 * Collects display names for the items in the party's inventory, from the player view only, so a masked
 * magic item keeps its masked name.
 *
 * @param view - The player view.
 * @param names - The map to add to.
 */
export function inventoryNames(view: PlayerView, names: Map<string, string>): void {
  for (const member of view.party) {
    const inventory = member.inventory as Record<string, unknown>;
    for (const value of Object.values(inventory)) {
      if (Array.isArray(value)) for (const entry of value) addInventoryName(names, entry);
      else addInventoryName(names, value);
    }
  }
}

/**
 * Lists the item IDs in player events.
 *
 * @param events - Player-visible events.
 */
export function eventItemIds(events: GameEvent[]): string[] {
  const ids: string[] = [];
  for (const event of events) {
    const record = event as unknown as Record<string, unknown>;
    for (const field of ITEM_FIELDS) {
      const value = record[field];
      if (typeof value === 'string') ids.push(value);
      if (Array.isArray(value)) ids.push(...value.filter((id): id is string => typeof id === 'string'));
    }
  }
  return ids;
}

/**
 * Resolves names for item IDs that the inventory didn't name: an adventure's own items and the equipment
 * catalog by template ID. An allocated instance ID gets no name here, because only the player view may name a
 * magic item.
 *
 * @param ids - The IDs.
 * @param names - The map to add to.
 * @param adventure - The adventure, for its bundled items.
 * @param catalog - Equipment names by template ID.
 */
export function templateNames(
  ids: string[],
  names: Map<string, string>,
  adventure: Adventure,
  catalog: Map<string, string>,
): void {
  const bundled = new Map<string, string>();
  for (const item of (adventure.items ?? []) as { id?: unknown; name?: unknown }[]) {
    if (typeof item.id === 'string' && typeof item.name === 'string') bundled.set(item.id, item.name);
  }
  for (const id of ids) {
    if (names.has(id) || INSTANCE_ID.test(id)) continue;
    const name = bundled.get(id) ?? catalog.get(id);
    if (name !== undefined) names.set(id, name);
  }
}

/**
 * The names of the dungeons the party has entered: those on its map, and the one it stands in.
 *
 * @param view - The player view.
 * @param adventure - The adventure.
 */
export function enteredDungeonNames(view: PlayerView, adventure: Adventure): Record<string, string> {
  const ids = new Set(view.explored.map((known) => known.dungeon_id));
  if (view.location.kind === 'dungeon' && view.location.dungeon_id != null) ids.add(view.location.dungeon_id);
  const names: Record<string, string> = {};
  for (const dungeon of adventure.dungeons) {
    if (ids.has(dungeon.id) && dungeon.name) names[dungeon.id] = dungeon.name;
  }
  return names;
}

/**
 * Builds the scene for a game from the player view and the referee view's adventure and dungeon overlay. See
 * the protocol's `Scene` for the rules. The function errs toward hiding: it reveals only what osrlib marks as
 * known to the party, and leaves the rest for the referee to describe.
 *
 * @param view - The player view.
 * @param source - The adventure and the dungeon overlay from the referee view.
 * @param names - Display names to send.
 */
export function buildScene(view: PlayerView, source: SceneSource, names: Map<string, string>): Scene {
  const state = source.dungeonState;
  const encounterOpen = view.mode === 'encounter' || view.mode === 'battle';
  const location = view.location;
  const levels: SceneLevel[] = [];
  let here: SceneHere | null = null;

  for (const known of view.explored) {
    const dungeon = source.adventure.dungeons.find((candidate) => candidate.id === known.dungeon_id);
    const level = dungeon?.levels.find((candidate) => candidate.number === known.level_number);
    if (level === undefined) continue;
    const dungeonId = known.dungeon_id;
    const levelNumber = known.level_number;
    const knownCells = new Set(known.cells.map(cellKey));
    const walked = new Set((state.explored?.[levelKey(dungeonId, levelNumber)] ?? []).map(cellKey));
    const ref = (id: string) => `${dungeonId}:${levelNumber}:${id}`;
    const partyHere =
      location.kind === 'dungeon' &&
      location.dungeon_id === dungeonId &&
      location.level_number === levelNumber
        ? (location.position as Position | null | undefined)
        : null;
    const partyArea = partyHere == null ? null : areaAt(level, partyHere);
    const entered = new Set<string>();
    for (const cell of walked) {
      const [x, y] = cell.split(',').map(Number);
      const area = areaAt(level, [x ?? 0, y ?? 0]);
      if (area !== null) entered.add(area.id);
    }

    const areas: SceneArea[] = (level.areas ?? [])
      .filter((area) => entered.has(area.id))
      .map((area) => ({
        id: area.id,
        name: area.name ?? '',
        description: area.description ?? '',
        cells: area.cells.filter((cell) => knownCells.has(cellKey(cell))).map((cell) => [cell[0], cell[1]]),
      }));

    const traps: SceneTrap[] = [];
    const cacheTrap = (areaId: string | null, feature: FeatureSpec): SceneTrap | null => {
      if (feature.trap == null) return null;
      const known = knownTrapState(state, ref(feature.id));
      return known === null
        ? null
        : {
            kind: 'treasure',
            trigger: feature.trap.trigger,
            state: known,
            area_id: areaId,
            feature_id: feature.id,
          };
    };
    for (const area of level.areas ?? []) {
      if (area.trap == null) continue;
      const known = knownTrapState(state, ref(area.id));
      if (known !== null) {
        traps.push({
          kind: 'room',
          trigger: area.trap.trigger,
          state: known,
          area_id: area.id,
          feature_id: null,
        });
      }
    }

    // Authored features: those of entered areas, and those of the level on a cell the party walked.
    const caches: SceneCache[] = [];
    const features: SceneFeature[] = [];
    const placed: { areaId: string | null; feature: FeatureSpec }[] = [];
    for (const area of level.areas ?? []) {
      if (!entered.has(area.id)) continue;
      for (const feature of area.features ?? []) placed.push({ areaId: area.id, feature });
    }
    for (const feature of level.features ?? []) {
      if (feature.cell != null && walked.has(cellKey(feature.cell))) placed.push({ areaId: null, feature });
    }
    for (const { areaId, feature } of placed) {
      const position: Position | null = feature.cell == null ? null : [feature.cell[0], feature.cell[1]];
      // A feature on a cell the party hasn't seen would give the cell away.
      if (position !== null && !knownCells.has(cellKey(position))) continue;
      if (feature.kind === 'treasure_cache') {
        if (state.emptied_caches?.includes(ref(feature.id))) continue;
        const trap = cacheTrap(areaId, feature);
        if (trap !== null) traps.push(trap);
        if (encounterOpen && areaId !== null && areaId === partyArea?.id) continue;
        const reachable =
          partyHere != null &&
          (position === null
            ? areaId !== null && partyArea?.id === areaId
            : cellKey(position) === cellKey(partyHere));
        caches.push({
          id: feature.id,
          source: 'authored',
          area_id: areaId,
          position,
          reachable,
          trap,
        });
      } else if (feature.kind === 'custom' || state.found_tricks?.includes(ref(feature.id))) {
        features.push({
          id: feature.id,
          kind: feature.kind === 'custom' ? 'custom' : 'construction_trick',
          description: feature.description ?? '',
          area_id: areaId,
          position,
        });
      }
    }

    // Generated caches: treasure the session rolled, on a cell the party walked or in an area it entered.
    for (const [cacheId, cache] of Object.entries(state.generated_caches ?? {})) {
      const prefix = `cell:${dungeonId}:${levelNumber}:`;
      if (!cache.cell_ref.startsWith(prefix)) continue;
      const [x, y] = cache.cell_ref.slice(prefix.length).split(',').map(Number);
      const position: Position = [x ?? 0, y ?? 0];
      const area = areaAt(level, position);
      if (!walked.has(cellKey(position)) && (area === null || !entered.has(area.id))) continue;
      if (!knownCells.has(cellKey(position))) continue;
      if (encounterOpen && area !== null && area.id === partyArea?.id) continue;
      // A lair hoard belongs to monsters that are still there until the party slays or routs them. After the
      // party evades them or the encounter ends another way, they return, and the hoard stays out of sight.
      if (area?.encounter?.hoard === true && !(state.resolved_encounters ?? []).includes(ref(area.id)))
        continue;
      caches.push({
        id: cacheId,
        source: 'generated',
        area_id: area?.id ?? null,
        position,
        reachable: partyHere != null && cellKey(position) === cellKey(partyHere),
        trap: null,
      });
    }

    const transitions: SceneTransition[] = (level.transitions ?? [])
      .filter((transition) => knownCells.has(cellKey(transition.position)))
      .map((transition) => ({
        kind: transition.kind,
        position: [transition.position[0], transition.position[1]],
        side: transition.side ?? null,
        leads: leads(transition, dungeonId, levelNumber),
      }));

    const piles: Position[] = [];
    for (const key of Object.keys(view.piles)) {
      const prefix = `cell:${dungeonId}:${levelNumber}:`;
      if (!key.startsWith(prefix)) continue;
      const [x, y] = key.slice(prefix.length).split(',').map(Number);
      piles.push([x ?? 0, y ?? 0]);
    }

    // osrlib's travel_to_town works on the level's entrance cell. The cell is part of the map once the party has
    // seen it, so the scene shows it then.
    const entranceCell = level.entrance == null ? null : (level.entrance as readonly number[]);
    const entrance: Position | null =
      entranceCell !== null && knownCells.has(cellKey(entranceCell))
        ? [entranceCell[0] ?? 0, entranceCell[1] ?? 0]
        : null;

    levels.push({
      dungeon_id: dungeonId,
      level_number: levelNumber,
      areas,
      transitions,
      traps,
      caches,
      features,
      piles,
      entrance,
    });

    if (partyHere != null) {
      const hereKey = cellKey(partyHere);
      const area =
        partyArea === null ? null : (areas.find((candidate) => candidate.id === partyArea.id) ?? null);
      const inPlace = (areaId: string | null, position: Position | null) =>
        (position !== null && cellKey(position) === hereKey) || (areaId !== null && areaId === partyArea?.id);
      here = {
        dungeon_id: dungeonId,
        level_number: levelNumber,
        position: [partyHere[0], partyHere[1]],
        area,
        caches: caches.filter((cache) => inPlace(cache.area_id, cache.position)),
        features: features.filter((feature) => inPlace(feature.area_id, feature.position)),
        transitions: transitions.filter((transition) => cellKey(transition.position) === hereKey),
        traps: traps.filter((trap) => trap.area_id !== null && trap.area_id === partyArea?.id),
        pile: cellRef(dungeonId, levelNumber, partyHere) in view.piles,
        at_entrance: entranceCell !== null && cellKey(entranceCell) === hereKey,
      };
    }
  }

  return {
    levels,
    here,
    names: Object.fromEntries([...names].sort(([a], [b]) => a.localeCompare(b))),
    // The condition of osrlib's `_handle_travel_to_town`, in a mode where the command is allowed.
    can_travel_to_town: view.mode === 'exploring' && here?.at_entrance === true,
    targets: [],
    dungeon_names: enteredDungeonNames(view, source.adventure),
  };
}
