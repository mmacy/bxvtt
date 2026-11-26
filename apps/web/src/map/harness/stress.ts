/**
 * A procedural stress level for the harness: a 100 by 100 grid of rooms and corridors with every
 * door, transition, and feature kind, and a dungeon state with most of it seen.
 */
import type { components } from '@bxvtt/shared/bxapi';
import { cellKey, edgeKey, step, type Direction } from '../geometry';
import type { DungeonState, LevelSpec } from '../model';
import { mulberry32 } from '../render/util';
import { emptyDungeonState, placeParty } from './sim';

type Schemas = components['schemas'];

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NO_COINS = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

function door(kind: 'normal' | 'secret', options: Partial<Schemas['DoorSpec']> = {}): Schemas['Edge'] {
  return { kind: 'door', door: { kind, stuck: false, locked: false, starts_open: false, ...options } };
}

export function stressLevel(
  size = 100,
  seed = 1981,
): { level: LevelSpec; state: DungeonState; dungeonId: string } {
  const random = mulberry32(seed);
  const int = (a: number, b: number) => a + Math.floor(random() * (b - a + 1));
  const rooms: Room[] = [];
  for (let attempt = 0; attempt < 900 && rooms.length < 78; attempt++) {
    const w = int(3, 9);
    const h = int(3, 8);
    const x = int(1, size - w - 2);
    const y = int(1, size - h - 2);
    const clash = rooms.some(
      (r) => x <= r.x + r.w + 1 && x + w + 1 >= r.x && y <= r.y + r.h + 1 && y + h + 1 >= r.y,
    );
    if (!clash) rooms.push({ x, y, w, h });
  }
  const roomAt = new Map<string, number>();
  rooms.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomAt.set(cellKey(x, y), i);
  });

  const edges: Record<string, Schemas['Edge']> = {};
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x + 1 < r.x + r.w) edges[edgeKey(x, y, 'east')] = { kind: 'open' };
        if (y + 1 < r.y + r.h) edges[edgeKey(x, y, 'south')] = { kind: 'open' };
      }
    }
  }
  const randomDoor = (): Schemas['Edge'] => {
    const r = random();
    if (r < 0.5) return door('normal');
    if (r < 0.6) return door('normal', { locked: true });
    if (r < 0.7) return door('normal', { stuck: true });
    if (r < 0.78) return door('secret');
    if (r < 0.82) return door('normal', { locked: true, stuck: true });
    return door('normal', { starts_open: true });
  };
  const carve = (ax: number, ay: number, bx: number, by: number) => {
    let x = ax;
    let y = ay;
    const horizontalFirst = random() < 0.5;
    const stepTo = (d: Direction) => {
      const [nx, ny] = step(x, y, d);
      const key = edgeKey(x, y, d);
      const from = roomAt.get(cellKey(x, y));
      const to = roomAt.get(cellKey(nx, ny));
      if (!edges[key])
        edges[key] =
          from !== to && (from === undefined || to === undefined) ? randomDoor() : { kind: 'open' };
      x = nx;
      y = ny;
    };
    const runX = () => {
      while (x !== bx) stepTo(bx > x ? 'east' : 'west');
    };
    const runY = () => {
      while (y !== by) stepTo(by > y ? 'south' : 'north');
    };
    if (horizontalFirst) {
      runX();
      runY();
    } else {
      runY();
      runX();
    }
  };
  const center = (r: Room): [number, number] => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)];
  // Join each room to its nearest earlier room, and add a few loops.
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i];
    if (!a) continue;
    let best = 0;
    let bestD = Infinity;
    for (let j = 0; j < i; j++) {
      const b = rooms[j];
      if (!b) continue;
      const d = Math.abs(center(a)[0] - center(b)[0]) + Math.abs(center(a)[1] - center(b)[1]);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    const b = rooms[best];
    if (b) carve(...center(a), ...center(b));
    if (random() < 0.15) {
      const c = rooms[int(0, i - 1)];
      if (c) carve(...center(a), ...center(c));
    }
  }

  const monsters = ['goblin', 'orc', 'skeleton', 'giant_rat', 'kobold', 'zombie', 'hobgoblin', 'ghoul'];
  const areas: Schemas['AreaSpec'][] = rooms.map((r, i) => {
    const cells: [number, number][] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push([x, y]);
    const features: Schemas['FeatureSpec'][] = [];
    if (random() < 0.4) {
      features.push({
        id: `cache-${i}`,
        kind: 'treasure_cache',
        description: 'A chest.',
        referee_notes: '',
        cell: [r.x + int(0, r.w - 1), r.y + int(0, r.h - 1)],
        item_ids: [],
        magic_item_ids: [],
        coins: { ...NO_COINS, gp: int(10, 300) },
        valuables: [],
        trap:
          random() < 0.3
            ? {
                kind: 'treasure',
                trigger: 'open',
                effect: { damage_dice: '1d6', kills: false },
                affects: 'triggerer',
              }
            : null,
      });
    }
    if (random() < 0.12) {
      features.push({
        id: `trick-${i}`,
        kind: 'construction_trick',
        description: 'A sliding wall.',
        referee_notes: '',
        cell: [r.x, r.y + r.h - 1],
        item_ids: [],
        magic_item_ids: [],
        coins: NO_COINS,
        valuables: [],
      });
    }
    return {
      id: `room-${i + 1}`,
      name: ['Hall', 'Crypt', 'Shrine', 'Barracks', 'Cistern', 'Vault', 'Gallery', 'Kennel'][i % 8] ?? 'Room',
      description: '',
      cells,
      encounter:
        random() < 0.5
          ? {
              monsters: [
                { template_id: monsters[int(0, monsters.length - 1)] ?? 'goblin', count_fixed: int(1, 8) },
              ],
              aware: false,
              hoard: random() < 0.5,
            }
          : null,
      features,
      trap:
        random() < 0.15
          ? { kind: 'room', trigger: 'enter', effect: { fall_feet: 10, kills: false }, affects: 'triggerer' }
          : null,
      treasure: random() < 0.1 ? { letters: [], unguarded: true } : null,
    };
  });

  const transitions: Schemas['TransitionSpec'][] = [];
  const kinds: Schemas['TransitionSpec']['kind'][] = [
    'stairs_down',
    'stairs_up',
    'trapdoor',
    'chute',
    'stairs_down',
  ];
  kinds.forEach((kind, k) => {
    const r = rooms[(k * 13 + 5) % rooms.length];
    if (!r) return;
    transitions.push({
      kind,
      position: [r.x + 1, r.y + 1],
      to_dungeon_id: 'stress',
      to_level_number: 2,
      to_position: [0, 0],
      to_facing: 'north',
    });
  });

  const first = rooms[0] ?? { x: 1, y: 1, w: 1, h: 1 };
  const level: LevelSpec = {
    number: 1,
    width: size,
    height: size,
    edges,
    areas,
    features: [],
    transitions,
    wandering: { chance_in_six: 1, interval_turns: 2 },
    entrance: center(first),
    guidance: '',
  };

  // Mark about three rooms in four as seen, and walk the party into the first room.
  let state = emptyDungeonState();
  const seen: [number, number][] = [];
  rooms.forEach((r, i) => {
    if (i % 4 === 3) return;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) seen.push([x, y]);
  });
  for (const key of Object.keys(edges)) {
    const [pos] = key.split(':');
    const [x, y] = (pos ?? '0,0').split(',').map(Number);
    if (x === undefined || y === undefined || roomAt.has(cellKey(x, y))) continue;
    if (random() < 0.7) seen.push([x, y]);
  }
  state = { ...state, seen: { 'stress:1': seen } };
  const [ex, ey] = center(first);
  state = placeParty(level, state, 'stress', ex, ey, 'north');
  return { level, state, dungeonId: 'stress' };
}
