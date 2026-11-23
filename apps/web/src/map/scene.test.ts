import { describe, expect, it } from 'vitest';
import { describeTarget } from './describe';
import { fixture, fixtureLevel } from './fixtures/fixtures';
import { hitTest } from './hit';
import { fromRefereeView, type LevelMap } from './model';
import { EDGE_DOOR, EDGE_OPEN, EDGE_PASSAGE, EDGE_WALL, Scene, changedCells, runsOf } from './scene';

const explored = fixture('showcase-explored');
const level = fixtureLevel(explored, 'vault', 1);
const map = fromRefereeView(level, explored.referee.dungeon_state, { dungeonId: 'vault' });

/** A 3 by 2 room with every edge listed, for the wall-run tests. */
function room(): LevelMap {
  const cells = [];
  const edges: LevelMap['edges'] = [];
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 3; x++) cells.push({ x, y, known: true, walked: null, areaId: null });
  for (let y = 0; y <= 2; y++) {
    for (let x = 0; x < 3; x++) {
      const inner = y > 0 && y < 2;
      edges.push({ key: `${x},${y}:north`, x, y, side: 'north', kind: inner ? 'open' : 'wall', door: null });
    }
  }
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x <= 3; x++) {
      const inner = x > 0 && x < 3;
      edges.push({ key: `${x},${y}:west`, x, y, side: 'west', kind: inner ? 'open' : 'wall', door: null });
    }
  }
  const bounds = { minX: 0, minY: 0, maxX: 3, maxY: 2 };
  return {
    layer: 'player',
    key: 'test:1',
    dungeonId: 'test',
    levelNumber: 1,
    width: 3,
    height: 2,
    cells,
    edges,
    transitions: [],
    features: [],
    areas: [],
    entrance: null,
    party: null,
    light: null,
    wandering: null,
    knownBounds: bounds,
    bounds,
  };
}

describe('Scene', () => {
  it('merges wall edges into one run per side, so corners join', () => {
    const scene = new Scene(room());
    const runs = scene.wallRuns.map((r) => [r.x1, r.y1, r.x2, r.y2]);
    expect(runs).toHaveLength(4);
    expect(runs).toContainEqual([0, 0, 3, 0]);
    expect(runs).toContainEqual([0, 2, 3, 2]);
    expect(runs).toContainEqual([0, 0, 0, 2]);
    expect(runs).toContainEqual([3, 0, 3, 2]);
  });

  it('breaks a wall run at a door', () => {
    const m = room();
    const door = m.edges.find((e) => e.key === '1,0:north');
    if (!door) throw new Error('no edge');
    door.kind = 'door';
    door.door = {
      open: false,
      wedged: false,
      locked: null,
      unlocked: null,
      stuck: null,
      secret: null,
      discovered: null,
      gated: null,
    };
    const runs = new Scene(m).wallRuns.filter((r) => r.y1 === 0 && r.y2 === 0).map((r) => [r.x1, r.x2]);
    expect(runs).toEqual(
      expect.arrayContaining([
        [0, 1],
        [2, 3],
      ]),
    );
  });

  it('codes each edge kind on the fixture', () => {
    const scene = new Scene(map);
    expect(scene.edgeCode(16, 9, 'north')).toBe(EDGE_DOOR);
    expect(scene.edgeCode(16, 8, 'south')).toBe(EDGE_DOOR);
    expect(scene.edgeCode(16, 20, 'west')).toBe(EDGE_PASSAGE);
    expect(scene.edgeCode(5, 3, 'east')).toBe(EDGE_OPEN);
    expect(scene.edgeCode(4, 2, 'north')).toBe(EDGE_WALL);
  });

  it('finds only the changed cells between two maps', () => {
    const before = new Scene(map);
    const state = explored.referee.dungeon_state;
    const opened = {
      ...state,
      doors: {
        ...state.doors,
        'vault:1:10,4:west': {
          open: true,
          wedged: false,
          discovered: false,
          unlocked: false,
          opened_by_party: true,
        },
      },
    };
    const after = new Scene(fromRefereeView(level, opened, { dungeonId: 'vault' }));
    expect(after.signature).not.toBe(before.signature);
    const changed = changedCells(before, after);
    expect(changed?.map((c) => `${c.x},${c.y}`).sort()).toEqual(['10,4', '9,4']);
    // Moving the party alone changes nothing static.
    const moved = { ...state, location: { ...state.location, position: [16, 14] as [number, number] } };
    expect(new Scene(fromRefereeView(level, moved, { dungeonId: 'vault' })).signature).toBe(before.signature);
  });

  it('groups consecutive values into runs', () => {
    expect(runsOf([5, 1, 2, 3, 7, 8, 2])).toEqual([
      [1, 3],
      [5, 5],
      [7, 8],
    ]);
  });
});

describe('describeTarget', () => {
  it('describes doors, areas, and features in plain words', () => {
    const scene = new Scene(map);
    const door = hitTest(scene, { x: 26.5, y: 8.04 }, { zoom: 40 });
    expect(door && describeTarget(door, map)).toEqual({ title: 'Door', lines: ['Closed, locked, stuck.'] });
    const secret = hitTest(scene, { x: 24.04, y: 17.5 }, { zoom: 40 });
    expect(secret && describeTarget(secret, map)?.title).toBe('Secret door (undiscovered)');
    const cell = hitTest(scene, { x: 15.5, y: 3.5 }, { zoom: 40 });
    expect(cell && describeTarget(cell, map)).toMatchObject({ title: '3. Guard post' });
    expect(cell && describeTarget(cell, map)?.lines[0]).toBe('Encounter: 4 goblin');
  });
});
