/**
 * Lookup tables derived from a `LevelMap`, built once per map change. The painter and the hit
 * tester read cells, edges, and features through a `Scene` instead of searching the arrays.
 */
import { cellKey, edgeKey, type Direction } from './geometry';
import { labelSpots, type LabelSpot } from './labels';
import type { Bounds, LevelMap, MapEdge, MapFeature, MapTransition } from './model';

/** Cell flags. */
export const FLOOR = 1;
export const KNOWN = 2;
export const WALKED = 4;

/** Edge codes in the per-cell edge arrays. */
export const EDGE_NONE = 0;
export const EDGE_WALL = 1;
export const EDGE_OPEN = 2;
export const EDGE_DOOR = 3;
export const EDGE_PASSAGE = 4;

/** A straight run of wall, merged from neighbouring wall edges, in world coordinates. */
export interface WallRun {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const BUCKET = 8;

export class Scene {
  readonly map: LevelMap;
  /** The world bounds of the arrays: one cell of margin around every cell and edge. */
  readonly minX: number;
  readonly minY: number;
  readonly w: number;
  readonly h: number;
  readonly flags: Uint8Array;
  /** Index into `map.areas`, or -1. */
  readonly area: Int16Array;
  /** The code of each cell's north and west edges. */
  readonly north: Uint8Array;
  readonly west: Uint8Array;
  readonly edges = new Map<string, MapEdge>();
  readonly featuresByCell = new Map<string, MapFeature[]>();
  readonly transitionsByCell = new Map<string, MapTransition[]>();
  readonly wallRuns: WallRun[] = [];
  private readonly wallBuckets = new Map<string, number[]>();
  /** A hash of everything static, so the renderer can tell a party move from a map change. */
  readonly signature: string;
  private spots: Map<string, LabelSpot> | null = null;

  constructor(map: LevelMap) {
    this.map = map;
    let minX = map.bounds.minX;
    let minY = map.bounds.minY;
    let maxX = map.bounds.maxX;
    let maxY = map.bounds.maxY;
    for (const edge of map.edges) {
      minX = Math.min(minX, edge.x - 1);
      minY = Math.min(minY, edge.y - 1);
      maxX = Math.max(maxX, edge.x + 1);
      maxY = Math.max(maxY, edge.y + 1);
    }
    this.minX = Math.floor(minX) - 2;
    this.minY = Math.floor(minY) - 2;
    this.w = Math.ceil(maxX) - this.minX + 3;
    this.h = Math.ceil(maxY) - this.minY + 3;
    const size = this.w * this.h;
    this.flags = new Uint8Array(size);
    this.area = new Int16Array(size).fill(-1);
    this.north = new Uint8Array(size);
    this.west = new Uint8Array(size);

    const areaIndex = new Map(map.areas.map((area, i) => [area.id, i]));
    for (const cell of map.cells) {
      const i = this.index(cell.x, cell.y);
      if (i < 0) continue;
      this.flags[i] = FLOOR | (cell.known ? KNOWN : 0) | (cell.walked ? WALKED : 0);
      if (cell.areaId) this.area[i] = areaIndex.get(cell.areaId) ?? -1;
    }
    for (const edge of map.edges) {
      this.edges.set(edge.key, edge);
      const i = this.index(edge.x, edge.y);
      if (i < 0) continue;
      const code =
        edge.kind === 'wall'
          ? EDGE_WALL
          : edge.kind === 'open'
            ? EDGE_OPEN
            : edge.kind === 'door'
              ? EDGE_DOOR
              : EDGE_PASSAGE;
      if (edge.side === 'north') this.north[i] = code;
      else this.west[i] = code;
    }
    for (const feature of map.features) push(this.featuresByCell, cellKey(feature.x, feature.y), feature);
    for (const transition of map.transitions) {
      push(this.transitionsByCell, cellKey(transition.x, transition.y), transition);
    }
    this.buildWallRuns();
    this.signature = signatureOf(map);
  }

  /** Where each area's label goes, keyed by area id, worked out on first use. */
  get labelSpots(): Map<string, LabelSpot> {
    this.spots ??= labelSpots(this);
    return this.spots;
  }

  index(x: number, y: number): number {
    const ix = x - this.minX;
    const iy = y - this.minY;
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return -1;
    return iy * this.w + ix;
  }

  flagsAt(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? 0 : (this.flags[i] ?? 0);
  }

  isFloor(x: number, y: number): boolean {
    return (this.flagsAt(x, y) & FLOOR) !== 0;
  }

  isKnown(x: number, y: number): boolean {
    return (this.flagsAt(x, y) & KNOWN) !== 0;
  }

  areaAt(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? -1 : (this.area[i] ?? -1);
  }

  /** The edge code on one side of a cell. */
  edgeCode(x: number, y: number, direction: Direction): number {
    let i: number;
    switch (direction) {
      case 'north':
        i = this.index(x, y);
        return i < 0 ? EDGE_NONE : (this.north[i] ?? EDGE_NONE);
      case 'west':
        i = this.index(x, y);
        return i < 0 ? EDGE_NONE : (this.west[i] ?? EDGE_NONE);
      case 'south':
        i = this.index(x, y + 1);
        return i < 0 ? EDGE_NONE : (this.north[i] ?? EDGE_NONE);
      case 'east':
        i = this.index(x + 1, y);
        return i < 0 ? EDGE_NONE : (this.west[i] ?? EDGE_NONE);
    }
  }

  edgeAt(x: number, y: number, direction: Direction): MapEdge | undefined {
    return this.edges.get(edgeKey(x, y, direction));
  }

  /** Wall runs that touch the world rectangle. */
  wallRunsIn(rect: Bounds): WallRun[] {
    const out = new Set<number>();
    const bx0 = Math.floor(rect.minX / BUCKET);
    const by0 = Math.floor(rect.minY / BUCKET);
    const bx1 = Math.floor(rect.maxX / BUCKET);
    const by1 = Math.floor(rect.maxY / BUCKET);
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        for (const i of this.wallBuckets.get(`${bx},${by}`) ?? []) out.add(i);
      }
    }
    const runs: WallRun[] = [];
    for (const i of out) {
      const run = this.wallRuns[i];
      if (run) runs.push(run);
    }
    return runs;
  }

  /**
   * Whether an edge draws as wall line. Doors and passages break the line and draw their own
   * glyph. A secret door the party hasn't found draws as wall with a mark on it.
   */
  private drawsAsWall(edge: MapEdge): boolean {
    if (edge.kind === 'wall') return true;
    if (edge.kind === 'door') return edge.door?.secret === true && edge.door.discovered === false;
    return false;
  }

  private buildWallRuns(): void {
    const horizontal = new Map<number, number[]>();
    const vertical = new Map<number, number[]>();
    for (const edge of this.edges.values()) {
      if (!this.drawsAsWall(edge)) continue;
      // Draw a wall only where it bounds a floor cell on at least one side.
      const [a, b] =
        edge.side === 'north'
          ? [this.isFloor(edge.x, edge.y - 1), this.isFloor(edge.x, edge.y)]
          : [this.isFloor(edge.x - 1, edge.y), this.isFloor(edge.x, edge.y)];
      if (!a && !b) continue;
      if (edge.side === 'north') push(horizontal, edge.y, edge.x);
      else push(vertical, edge.x, edge.y);
    }
    const addRun = (run: WallRun) => {
      const index = this.wallRuns.length;
      this.wallRuns.push(run);
      const bx0 = Math.floor(Math.min(run.x1, run.x2) / BUCKET);
      const by0 = Math.floor(Math.min(run.y1, run.y2) / BUCKET);
      const bx1 = Math.floor(Math.max(run.x1, run.x2) / BUCKET);
      const by1 = Math.floor(Math.max(run.y1, run.y2) / BUCKET);
      for (let by = by0; by <= by1; by++)
        for (let bx = bx0; bx <= bx1; bx++) push(this.wallBuckets, `${bx},${by}`, index);
    };
    for (const [y, xs] of horizontal) {
      for (const [start, end] of runsOf(xs)) addRun({ x1: start, y1: y, x2: end + 1, y2: y });
    }
    for (const [x, ys] of vertical) {
      for (const [start, end] of runsOf(ys)) addRun({ x1: x, y1: start, x2: x, y2: end + 1 });
    }
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Groups sorted integers into inclusive runs of consecutive values. */
export function runsOf(values: number[]): [number, number][] {
  const sorted = [...values].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const v of sorted) {
    const last = runs[runs.length - 1];
    if (last && v === last[1] + 1) last[1] = v;
    else if (!last || v > last[1]) runs.push([v, v]);
  }
  return runs;
}

/** A cheap 32-bit FNV-1a hash of the map's static content, excluding the party. */
function signatureOf(map: LevelMap): string {
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  mix(`${map.layer}|${map.key}|${map.width}x${map.height}`);
  for (const c of map.cells) mix(`c${c.x},${c.y},${c.known ? 1 : 0}${c.walked ? 1 : 0}${c.areaId ?? ''}`);
  for (const e of map.edges) {
    const d = e.door;
    mix(
      `e${e.key}${e.kind}${d ? `${+d.open}${+d.wedged}${d.locked}${d.unlocked}${d.stuck}${d.secret}${d.discovered}${d.gated}` : ''}`,
    );
  }
  for (const f of map.features)
    mix(`f${f.id}${f.kind}${f.x},${f.y}${+f.emptied}${f.found}${f.trap?.state ?? ''}${+f.known}`);
  for (const t of map.transitions) mix(`t${t.id}${+t.known}`);
  for (const a of map.areas) mix(`a${a.id}${+a.known}${a.encounter?.resolved ?? ''}${a.trap?.state ?? ''}`);
  if (map.entrance) mix(`n${map.entrance[0]},${map.entrance[1]}`);
  return (h >>> 0).toString(16);
}

/** The cells whose static drawing differs between two maps, or `null` when too much changed. */
export function changedCells(before: Scene, after: Scene, limit = 400): { x: number; y: number }[] | null {
  if (before.map.layer !== after.map.layer || before.map.key !== after.map.key) return null;
  const changed = new Map<string, { x: number; y: number }>();
  const mark = (x: number, y: number) => changed.set(cellKey(x, y), { x, y });
  const cellsA = new Map(before.map.cells.map((c) => [cellKey(c.x, c.y), c]));
  const cellsB = new Map(after.map.cells.map((c) => [cellKey(c.x, c.y), c]));
  for (const [k, c] of cellsB) {
    const old = cellsA.get(k);
    if (!old || old.known !== c.known || old.walked !== c.walked || old.areaId !== c.areaId) mark(c.x, c.y);
  }
  for (const [k, c] of cellsA) if (!cellsB.has(k)) mark(c.x, c.y);
  const edgeSig = (e: MapEdge) => `${e.kind}${JSON.stringify(e.door)}`;
  for (const [k, e] of after.edges) {
    const old = before.edges.get(k);
    if (!old || edgeSig(old) !== edgeSig(e)) {
      mark(e.x, e.y);
      if (e.side === 'north') mark(e.x, e.y - 1);
      else mark(e.x - 1, e.y);
    }
  }
  for (const [k, e] of before.edges) if (!after.edges.has(k)) mark(e.x, e.y);
  const featureSig = (f: MapFeature) => JSON.stringify(f);
  const fa = new Map(before.map.features.map((f) => [f.id, f]));
  const fb = new Map(after.map.features.map((f) => [f.id, f]));
  for (const [id, f] of fb) {
    const old = fa.get(id);
    if (!old || featureSig(old) !== featureSig(f)) {
      mark(f.x, f.y);
      if (old) mark(old.x, old.y);
    }
  }
  for (const [id, f] of fa) if (!fb.has(id)) mark(f.x, f.y);
  const ta = new Map(before.map.transitions.map((t) => [t.id, t]));
  for (const t of after.map.transitions) {
    const old = ta.get(t.id);
    if (!old || old.known !== t.known) mark(t.x, t.y);
  }
  if (before.map.areas.length !== after.map.areas.length) return null;
  for (let i = 0; i < after.map.areas.length; i++) {
    const a = before.map.areas[i];
    const b = after.map.areas[i];
    if (!a || !b || a.id !== b.id || a.known !== b.known) return null;
  }
  if (changed.size > limit) return null;
  return [...changed.values()];
}
