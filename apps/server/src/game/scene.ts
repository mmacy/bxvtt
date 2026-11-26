import type { Adventure, DungeonState, FeatureSpec } from '@bxvtt/shared/bxapi';
import type { GameEvent, PlayerView, Scene, SceneRoomTrap } from '@bxvtt/shared/protocol';

/** What the scene builder reads: the referee view's adventure and dungeon overlay. */
export interface SceneSource {
  adventure: Adventure;
  dungeonState: DungeonState;
}

/** The event fields that hold item, magic item, or valuable IDs. */
const ITEM_FIELDS = ['item_id', 'item_ids', 'valuable_ids', 'magic_item_ids', 'weapon_id'];

/** An instance ID that the session allocated, such as `magic-item-0001` or `valuable-0002`. */
const INSTANCE_ID = /-\d{4,}$/;

/**
 * The trap state the party knows for a trap reference, or `null` when the party doesn't know about the trap.
 *
 * @param state - The dungeon overlay.
 * @param ref - An area or feature reference, `"{dungeon}:{level}:{id}"`.
 */
function knownTrapState(state: DungeonState, ref: string): SceneRoomTrap['state'] | null {
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
 * The names of the dungeons the party has entered, by dungeon ID, from the player view.
 *
 * @param view - The player view.
 */
export function dungeonNames(view: PlayerView): Record<string, string> {
  const names: Record<string, string> = {};
  for (const dungeon of view.dungeons) if (dungeon.name) names[dungeon.id] = dungeon.name;
  return names;
}

/**
 * Lists the room traps the party knows about, in the areas the player view lists as entered.
 *
 * @param view - The player view.
 * @param source - The adventure and the dungeon overlay from the referee view.
 */
export function knownRoomTraps(view: PlayerView, source: SceneSource): SceneRoomTrap[] {
  const traps: SceneRoomTrap[] = [];
  for (const known of view.explored) {
    const level = source.adventure.dungeons
      .find((dungeon) => dungeon.id === known.dungeon_id)
      ?.levels.find((candidate) => candidate.number === known.level_number);
    if (level === undefined) continue;
    for (const entered of known.areas) {
      const area = level.areas?.find((candidate) => candidate.id === entered.id);
      if (area?.trap == null) continue;
      const state = knownTrapState(
        source.dungeonState,
        `${known.dungeon_id}:${known.level_number}:${area.id}`,
      );
      if (state !== null) {
        traps.push({
          dungeon_id: known.dungeon_id,
          level_number: known.level_number,
          area_id: area.id,
          state,
        });
      }
    }
  }
  return traps;
}

/** Whether two optional cells name the same cell, or are both missing. */
function sameCell(a: readonly number[] | null | undefined, b: readonly number[] | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Lists the `feature:` handles of the authored caches in the player view that the party has emptied.
 *
 * The player view keeps an emptied authored cache in `explored[].features` without marking it, and it lists
 * emptied caches by raw reference in `emptied_caches`. The handle can't be computed from a raw reference, so
 * this matches each view cache to the adventure's caches on its level that have the same cell (or none), the
 * same description, and the same area when the view states one. The handle is listed when at least one cache
 * matches and every match is emptied, so two identical caches count as emptied only once both are.
 *
 * @param view - The player view.
 * @param adventure - The adventure from the referee view.
 */
export function emptiedFeatureHandles(view: PlayerView, adventure: Adventure): string[] {
  const emptied = new Set(view.emptied_caches);
  const handles: string[] = [];
  for (const known of view.explored) {
    const level = adventure.dungeons
      .find((dungeon) => dungeon.id === known.dungeon_id)
      ?.levels.find((candidate) => candidate.number === known.level_number);
    if (level === undefined) continue;
    const authored: { areaId: string | null; feature: FeatureSpec }[] = [
      ...(level.features ?? []).map((feature) => ({ areaId: null, feature })),
      ...(level.areas ?? []).flatMap((area) =>
        (area.features ?? []).map((feature) => ({ areaId: area.id, feature })),
      ),
    ];
    for (const shown of known.features) {
      if (shown.kind !== 'treasure_cache') continue;
      const matches = authored.filter(
        ({ areaId, feature }) =>
          feature.kind === 'treasure_cache' &&
          (feature.description ?? '') === shown.description &&
          sameCell(feature.cell, shown.cell) &&
          (shown.area_id == null || shown.area_id === areaId),
      );
      const ref = (id: string) => `${known.dungeon_id}:${known.level_number}:${id}`;
      if (matches.length > 0 && matches.every(({ feature }) => emptied.has(ref(feature.id)))) {
        handles.push(shown.id);
      }
    }
  }
  return handles;
}

/**
 * Builds the scene for a game: item names, the room traps the party knows, and the emptied caches. See the
 * protocol's `Scene`. Everything else a player needs is in the player view.
 *
 * @param view - The player view.
 * @param source - The adventure and the dungeon overlay from the referee view.
 * @param names - Display names to send.
 */
export function buildScene(view: PlayerView, source: SceneSource, names: Map<string, string>): Scene {
  return {
    names: Object.fromEntries([...names].sort(([a], [b]) => a.localeCompare(b))),
    room_traps: knownRoomTraps(view, source),
    emptied_features: emptiedFeatureHandles(view, source.adventure),
  };
}
