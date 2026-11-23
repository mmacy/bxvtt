import { describe, expect, it } from 'vitest';
import { describeTarget } from './describe';
import { fixture, fixtureLevel } from './fixtures/fixtures';
import {
  currentLevelKey,
  fromPlayerView,
  fromReferee,
  fromRefereeView,
  labelAnchor,
  playerLevelKeys,
  refereeLight,
  type LevelMap,
} from './model';

const edge = (map: LevelMap, key: string) => map.edges.find((e) => e.key === key);
const explored = fixture('showcase-explored');
const referee = () =>
  fromRefereeView(fixtureLevel(explored, 'vault', 1), explored.referee.dungeon_state, {
    dungeonId: 'vault',
    light: { radiusFeet: 30 },
  });

describe('fromPlayerView', () => {
  it('builds the party level by default, with the party and its light', () => {
    const map = fromPlayerView(explored.view);
    expect(map?.key).toBe('vault:1');
    expect(map?.layer).toBe('player');
    expect(map?.party).toEqual({ x: 16, y: 15, facing: 'south' });
    expect(map?.light).toEqual({ radiusFeet: 30 });
    expect(map?.cells).toHaveLength(explored.view.explored[0]?.cells.length ?? -1);
    expect(map?.cells.every((c) => c.known && c.walked === null && c.areaId === null)).toBe(true);
  });

  it('reports door state as the view does and leaves what players cannot know as null', () => {
    const map = fromPlayerView(explored.view);
    if (!map) throw new Error('no map');
    expect(edge(map, '16,9:north')?.door).toEqual({
      open: true,
      wedged: true,
      locked: null,
      unlocked: null,
      stuck: null,
      secret: null,
      discovered: null,
      gated: null,
    });
    expect(edge(map, '14,4:west')?.door?.open).toBe(true);
    expect(edge(map, '26,8:north')?.door?.open).toBe(false);
  });

  it('shows an unfound secret door as a wall and holds no transitions, features, or areas', () => {
    const map = fromPlayerView(explored.view);
    if (!map) throw new Error('no map');
    expect(edge(map, '24,17:west')?.kind).toBe('wall');
    expect(map.transitions).toEqual([]);
    expect(map.areas).toEqual([]);
    expect(map.features.map((f) => f.kind)).toEqual(['pile']);
    expect(map.features[0]).toMatchObject({ x: 6, y: 9, contents: ['dagger×1'] });
  });

  it('names the areas a client passes, on known cells only, with no key numbers', () => {
    const level = fixtureLevel(explored, 'vault', 1);
    const known = new Set(explored.view.explored[0]?.cells.map(([x, y]) => `${x},${y}`));
    const entered = level.areas.filter((area) => area.cells.some(([x, y]) => known.has(`${x},${y}`)));
    const hidden = level.areas.find((area) => area.cells.every(([x, y]) => !known.has(`${x},${y}`)));
    const map = fromPlayerView(explored.view, undefined, {
      extras: { areas: level.areas.map((area) => ({ id: area.id, name: area.name, cells: area.cells })) },
    });
    if (!map) throw new Error('no map');
    expect(map.areas.map((area) => area.id)).toEqual(entered.map((area) => area.id));
    if (hidden) expect(map.areas.some((area) => area.id === hidden.id)).toBe(false);
    for (const area of map.areas) {
      expect(area.label).toBe('');
      expect(area.cells.every(([x, y]) => known.has(`${x},${y}`))).toBe(true);
      const anchorCell = `${Math.floor(area.anchor.x)},${Math.floor(area.anchor.y)}`;
      expect(area.cells.some(([x, y]) => `${x},${y}` === anchorCell)).toBe(true);
    }
    const first = map.areas[0];
    if (!first) throw new Error('no area');
    const [x, y] = first.cells[0] ?? [0, 0];
    expect(map.cells.find((cell) => cell.x === x && cell.y === y)?.areaId).toBe(first.id);
    const description = describeTarget(
      { kind: 'cell', x, y, floor: true, known: true, areaId: first.id, direction: null },
      map,
    );
    expect(description?.title).toBe(first.name);
  });

  it('sizes the grid to the known cells only', () => {
    const map = fromPlayerView(explored.view);
    const level = fixtureLevel(explored, 'vault', 1);
    expect(map?.width).toBeLessThanOrEqual(level.width);
    expect(map?.knownBounds).toEqual(map?.bounds);
  });

  it('builds any known level by key and finds no level in an unknown key', () => {
    const level2 = fixture('showcase-level2');
    expect(playerLevelKeys(level2.view)).toEqual(['vault:2', 'vault:1']);
    expect(currentLevelKey(level2.view)).toBe('vault:2');
    const upper = fromPlayerView(level2.view, 'vault:1');
    expect(upper?.party).toBeNull();
    expect(upper?.light).toBeNull();
    expect(fromPlayerView(level2.view, 'vault:9')).toBeNull();
  });

  it('adds stairs and features the client learned from events', () => {
    const map = fromPlayerView(explored.view, undefined, {
      extras: { transitions: [{ kind: 'trapdoor', x: 16, y: 18 }] },
      lightRadiusFeet: 60,
    });
    expect(map?.transitions[0]).toMatchObject({ kind: 'trapdoor', known: true, to: null });
    expect(map?.light).toEqual({ radiusFeet: 60 });
  });

  it('builds the tiny barrow and the large hills map', () => {
    const barrow = fromPlayerView(fixture('barrow').view);
    expect(barrow?.cells).toHaveLength(5);
    expect(barrow?.edges.filter((e) => e.kind === 'open')).toHaveLength(4);
    const hills = fromPlayerView(fixture('hills').view);
    expect(hills?.cells).toHaveLength(248);
    expect(hills?.edges).toHaveLength(620);
  });
});

describe('fromRefereeView', () => {
  it('marks what the party walked and saw', () => {
    const map = referee();
    const state = explored.referee.dungeon_state;
    expect(map.cells.filter((c) => c.walked)).toHaveLength(state.explored['vault:1']?.length ?? -1);
    expect(map.cells.some((c) => !c.known)).toBe(true);
    expect(map.knownBounds).not.toBeNull();
    expect(map.width).toBe(32);
  });

  it('reads every door variant from the adventure and the dungeon state', () => {
    const map = referee();
    expect(edge(map, '24,17:west')?.door).toMatchObject({ secret: true, discovered: false, open: false });
    expect(edge(map, '4,3:west')?.door).toMatchObject({ secret: true, discovered: true });
    expect(edge(map, '26,8:north')?.door).toMatchObject({ locked: true, stuck: true, unlocked: false });
    expect(edge(map, '20,3:west')?.door).toMatchObject({ locked: false, unlocked: true });
    expect(edge(map, '14,4:west')?.door).toMatchObject({ stuck: true, open: true });
    expect(edge(map, '16,9:north')?.door).toMatchObject({ open: true, wedged: true });
    expect(edge(map, '26,15:north')?.door).toMatchObject({ open: true, wedged: false });
    expect(edge(map, '10,4:west')?.door).toMatchObject({
      open: false,
      secret: false,
      discovered: null,
      gated: false,
    });
  });

  it('marks a passage edge and lists every transition', () => {
    const map = referee();
    expect(edge(map, '16,20:west')?.kind).toBe('passage');
    expect(map.transitions.map((t) => t.kind).sort()).toEqual(['passage', 'stairs_down', 'trapdoor']);
    expect(map.transitions.find((t) => t.kind === 'stairs_down')?.to).toEqual({
      dungeonId: 'vault',
      levelNumber: 2,
      x: 3,
      y: 3,
      facing: 'east',
    });
  });

  it('reports traps, caches, piles, and rolled treasure', () => {
    const map = referee();
    const area = (id: string) => map.areas.find((a) => a.id === id);
    expect(area('guard_post')?.trap?.state).toBe('found');
    expect(area('pillared_hall')?.trap).toMatchObject({
      state: 'sprung',
      summary: "10' fall",
      trigger: 'enter',
    });
    expect(area('guard_post')?.encounter).toMatchObject({
      summary: '4 goblin',
      resolved: false,
      hoard: false,
    });
    expect(area('stair_room')?.encounter?.hoard).toBe(true);
    const feature = (id: string) => map.features.find((f) => f.id === id);
    expect(feature('offering_bowl')).toMatchObject({ kind: 'cache', emptied: true, known: true });
    expect(feature('altar_hoard')?.trap?.state).toMatch(/hidden|found/);
    expect(feature('loose_stone')).toMatchObject({ kind: 'trick', found: false });
    expect(feature('carved_face')).toMatchObject({ kind: 'custom', areaId: null, x: 6, y: 8 });
    expect(feature('pile@6,9')?.contents).toEqual(['dagger × 1']);
    expect(map.features.filter((f) => f.kind === 'generated_cache')).toHaveLength(1);
  });

  it('numbers areas in order and anchors labels inside them, clear of stairs', () => {
    const map = referee();
    expect(map.areas.map((a) => a.label)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    const stairs = map.areas.find((a) => a.id === 'stair_room');
    expect(stairs?.anchor).not.toEqual({ x: 26.5, y: 17.5 });
    for (const area of map.areas) {
      const inside = area.cells.some(
        ([x, y]) => Math.floor(area.anchor.x) === x && Math.floor(area.anchor.y) === y,
      );
      expect(inside).toBe(true);
    }
  });

  it('builds the hills level with its entrance and wandering check', () => {
    const hills = fixture('hills');
    const map = fromReferee(hills.referee);
    expect(map?.key).toBe('dungeon-1:1');
    expect(map?.entrance).toEqual([21, 14]);
    expect(map?.wandering).toEqual({ chanceInSix: 1, intervalTurns: 2, customTable: true });
    // Every cell the player sees is floor on the referee map, and the referee knows them as seen.
    const known = new Set(map?.cells.filter((c) => c.known).map((c) => `${c.x},${c.y}`));
    for (const [x, y] of hills.view.explored[0]?.cells ?? []) expect(known.has(`${x},${y}`)).toBe(true);
  });

  it('reads the party light from the ledger', () => {
    const source = {
      ...explored.referee,
      party: { members: [{ id: 'character-0001' }] },
      ledger: {
        effects: [
          { target_ref: 'character-0001', definition: { kind: 'light', params: { light_radius_feet: 60 } } },
        ],
      },
    };
    expect(refereeLight(source)).toEqual({ radiusFeet: 60 });
    expect(refereeLight(explored.referee)).toBeNull();
  });
});

describe('labelAnchor', () => {
  it('centres a rectangle and stays inside an L shape', () => {
    const rect: [number, number][] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) rect.push([x, y]);
    expect(labelAnchor(rect)).toEqual({ x: 2, y: 1.5 });
    const ell: [number, number][] = [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ];
    const a = labelAnchor(ell);
    expect(ell.some(([x, y]) => Math.floor(a.x) === x && Math.floor(a.y) === y)).toBe(true);
  });
});
