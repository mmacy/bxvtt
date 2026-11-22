/**
 * Where an area's label goes and how its name fits. The pure parts live here so the tests can check them without
 * a canvas: the renderer measures text with the canvas and passes the measure function in.
 */
import { cellKey } from './geometry';
import type { MapArea } from './model';
import type { Scene } from './scene';

export interface LabelSpot {
  /** The label's centre in world coordinates. */
  x: number;
  y: number;
  /** How many cells wide the label may be, centred on `x`, without covering a symbol. */
  width: number;
  /** How many cells wide the area's own run is, inside its walls. A name that fits here needs no overhang. */
  inside: number;
  /** Whether the rows above and below are clear across that width, so the name may take two lines. */
  twoLines: boolean;
}

/** How far a label may run past its area on each side, in cells, when nothing is drawn there. */
const OVERHANG = 2;

function occupied(scene: Scene, x: number, y: number): boolean {
  const k = cellKey(x, y);
  if (scene.featuresByCell.has(k)) return true;
  return (scene.transitionsByCell.get(k) ?? []).some((t) => t.kind !== 'passage');
}

interface Run {
  y: number;
  start: number;
  end: number;
}

/** The horizontal runs of consecutive cells in a list, row by row. */
function runsOfCells(cells: readonly (readonly [number, number])[]): Run[] {
  const rows = new Map<number, number[]>();
  for (const [x, y] of cells) {
    const list = rows.get(y);
    if (list) list.push(x);
    else rows.set(y, [x]);
  }
  const runs: Run[] = [];
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    let start = xs[0] ?? 0;
    for (let i = 1; i <= xs.length; i++) {
      const x = xs[i];
      const prev = xs[i - 1] ?? start;
      if (x !== undefined && x === prev + 1) continue;
      runs.push({ y, start, end: prev });
      if (x !== undefined) start = x;
    }
  }
  return runs;
}

function spotOfRun(scene: Scene, run: Run): LabelSpot {
  const free = (x: number) => !occupied(scene, x, run.y);
  let left = 0;
  while (left < OVERHANG && free(run.start - left - 1)) left++;
  let right = 0;
  while (right < OVERHANG && free(run.end + right + 1)) right++;
  const extra = Math.min(left, right);
  const x0 = run.start - extra;
  const x1 = run.end + extra;
  let twoLines = true;
  for (let x = x0; x <= x1 && twoLines; x++) {
    if (occupied(scene, x, run.y - 1) || occupied(scene, x, run.y + 1)) twoLines = false;
  }
  return {
    x: (run.start + run.end + 1) / 2,
    y: run.y + 0.5,
    width: x1 - x0 + 1,
    inside: run.end - run.start + 1,
    twoLines,
  };
}

/**
 * The spots for an area's label, best first: the centres of the widest horizontal runs of the area's cells that
 * hold no stairs or feature, nearest the area's anchor when runs tie. A label may run past a run's ends over cells
 * that hold no symbol, up to two cells each side. When every known cell of the area holds a symbol, as when the
 * party knows one cell and a feature stands on it, the runs include those cells, so the label still has room to
 * run past them.
 */
export function labelSpotsRanked(scene: Scene, area: MapArea, limit = 4): LabelSpot[] {
  const free = area.cells.filter(([x, y]) => !occupied(scene, x, y));
  const runs = runsOfCells(free.length > 0 ? free : area.cells);
  const score = (run: Run) => {
    const cx = (run.start + run.end + 1) / 2;
    // Longer runs win. Among runs of equal length, the one nearest the anchor wins.
    return (run.end - run.start + 1) * 1000 - Math.hypot(cx - area.anchor.x, run.y + 0.5 - area.anchor.y);
  };
  runs.sort((a, b) => score(b) - score(a));
  return runs.slice(0, limit).map((run) => spotOfRun(scene, run));
}

/** The best spot for an area's label. See `labelSpotsRanked`. */
export function labelSpot(scene: Scene, area: MapArea): LabelSpot {
  return (
    labelSpotsRanked(scene, area, 1)[0] ?? {
      x: area.anchor.x,
      y: area.anchor.y,
      width: 1,
      inside: 1,
      twoLines: false,
    }
  );
}

/** A rectangle in world coordinates (cells). */
export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function overlapArea(a: WorldRect, b: WorldRect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

const OBSTACLE_BUCKET = 4;

/**
 * What a label must not cover: door and passage symbols on edges (an open door's leaf too), the S of a secret
 * door the party hasn't found, and cells that hold stairs, a trapdoor, a chute, a feature, or the entrance mark.
 */
export class LabelObstacles {
  private readonly buckets = new Map<string, WorldRect[]>();

  constructor(scene: Scene) {
    const add = (r: WorldRect) => {
      for (let by = Math.floor(r.y0 / OBSTACLE_BUCKET); by <= Math.floor(r.y1 / OBSTACLE_BUCKET); by++) {
        for (let bx = Math.floor(r.x0 / OBSTACLE_BUCKET); bx <= Math.floor(r.x1 / OBSTACLE_BUCKET); bx++) {
          const key = `${bx},${by}`;
          const list = this.buckets.get(key);
          if (list) list.push(r);
          else this.buckets.set(key, [r]);
        }
      }
    };
    // An edge rectangle from offsets along the edge (u) and across it (v, positive into the keyed cell).
    const edgeRect = (
      x: number,
      y: number,
      side: 'north' | 'west',
      u0: number,
      u1: number,
      v0: number,
      v1: number,
    ) =>
      side === 'north'
        ? { x0: x + u0, x1: x + u1, y0: y + v0, y1: y + v1 }
        : { x0: x + v0, x1: x + v1, y0: y + u0, y1: y + u1 };
    for (const edge of scene.edges.values()) {
      if (edge.kind === 'door' && edge.door) {
        const hidden = edge.door.secret === true && edge.door.discovered === false;
        if (hidden) add(edgeRect(edge.x, edge.y, edge.side, 0.25, 0.75, -0.25, 0.25));
        else {
          add(edgeRect(edge.x, edge.y, edge.side, 0.18, 0.82, -0.16, 0.16));
          if (edge.door.open) add(edgeRect(edge.x, edge.y, edge.side, 0.14, 0.36, 0, 0.55));
        }
      } else if (edge.kind === 'passage') {
        add(edgeRect(edge.x, edge.y, edge.side, 0.1, 0.9, -0.32, 0.32));
      }
    }
    const cell = (x: number, y: number) => add({ x0: x + 0.1, y0: y + 0.1, x1: x + 0.9, y1: y + 0.9 });
    for (const key of scene.featuresByCell.keys()) {
      const [x, y] = key.split(',').map(Number);
      if (x !== undefined && y !== undefined) cell(x, y);
    }
    for (const [key, list] of scene.transitionsByCell) {
      if (!list.some((t) => t.kind !== 'passage')) continue;
      const [x, y] = key.split(',').map(Number);
      if (x !== undefined && y !== undefined) cell(x, y);
    }
    const entrance = scene.map.entrance;
    if (entrance)
      add({ x0: entrance[0] + 0.25, y0: entrance[1] + 0.4, x1: entrance[0] + 0.75, y1: entrance[1] + 0.9 });
  }

  /** The obstacles near a rectangle. */
  near(r: WorldRect): WorldRect[] {
    const out = new Set<WorldRect>();
    for (let by = Math.floor(r.y0 / OBSTACLE_BUCKET); by <= Math.floor(r.y1 / OBSTACLE_BUCKET); by++) {
      for (let bx = Math.floor(r.x0 / OBSTACLE_BUCKET); bx <= Math.floor(r.x1 / OBSTACLE_BUCKET); bx++) {
        for (const o of this.buckets.get(`${bx},${by}`) ?? []) out.add(o);
      }
    }
    return [...out];
  }
}

export interface LabelRequest {
  id: string;
  /** The label block's size in cells. */
  width: number;
  height: number;
  /** Where the block's centre may go, best first. */
  candidates: readonly { x: number; y: number }[];
}

/**
 * Places labels one after another. Each takes its first candidate whose block overlaps no obstacle, no fixed
 * rectangle (such as the party token), and no label placed before it. When every candidate overlaps something, it
 * takes the one with the least overlap.
 */
export function placeLabels(
  requests: readonly LabelRequest[],
  obstacles: (r: WorldRect) => readonly WorldRect[],
  fixed: readonly WorldRect[],
): Map<string, { x: number; y: number }> {
  const placed: WorldRect[] = [];
  const result = new Map<string, { x: number; y: number }>();
  for (const request of requests) {
    let best: { x: number; y: number } | null = null;
    let bestCost = Infinity;
    for (const c of request.candidates) {
      const rect = {
        x0: c.x - request.width / 2,
        y0: c.y - request.height / 2,
        x1: c.x + request.width / 2,
        y1: c.y + request.height / 2,
      };
      let cost = 0;
      for (const o of obstacles(rect)) cost += overlapArea(rect, o);
      for (const o of fixed) cost += overlapArea(rect, o) * 4;
      for (const o of placed) cost += overlapArea(rect, o) * 4;
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
        if (cost === 0) break;
      }
    }
    if (!best) continue;
    result.set(request.id, best);
    placed.push({
      x0: best.x - request.width / 2,
      y0: best.y - request.height / 2,
      x1: best.x + request.width / 2,
      y1: best.y + request.height / 2,
    });
  }
  return result;
}

/** Every area's label spots, best first, keyed by area id. */
export function labelSpots(scene: Scene): Map<string, LabelSpot[]> {
  return new Map(scene.map.areas.map((area) => [area.id, labelSpotsRanked(scene, area)]));
}

export interface FittedLabel {
  lines: string[];
  /** The font size the lines fit at. */
  px: number;
}

/** The split of a name into two lines, at a space, with the narrowest wider line. */
export function splitInTwo(text: string, measure: (s: string) => number): [string, string] | null {
  const words = text.split(' ');
  if (words.length < 2) return null;
  let best: [string, string] | null = null;
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const width = Math.max(measure(a), measure(b));
    if (width < bestWidth) {
      bestWidth = width;
      best = [a, b];
    }
  }
  return best;
}

function truncate(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut.trimEnd()}…`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/**
 * Fits a name into `maxWidth`: on one line at the full size, then on two lines, then at smaller sizes down to
 * `minPx`, and only then cut with an ellipsis. `measure(text, px)` returns the text's width at a font size.
 */
export function fitLabel(
  text: string,
  maxWidth: number,
  measure: (text: string, px: number) => number,
  sizes: { px: number; minPx: number },
  allowTwoLines: boolean,
): FittedLabel {
  const step = Math.max(1, Math.round((sizes.px - sizes.minPx) / 4));
  const candidates: number[] = [];
  for (let px = sizes.px; px > sizes.minPx; px -= step) candidates.push(px);
  candidates.push(sizes.minPx);
  for (const px of candidates) {
    const at = (s: string) => measure(s, px);
    if (at(text) <= maxWidth) return { lines: [text], px };
    if (allowTwoLines) {
      const split = splitInTwo(text, at);
      if (split && at(split[0]) <= maxWidth && at(split[1]) <= maxWidth) return { lines: split, px };
    }
  }
  const at = (s: string) => measure(s, sizes.minPx);
  if (allowTwoLines) {
    const split = splitInTwo(text, at);
    if (split)
      return { lines: [truncate(split[0], maxWidth, at), truncate(split[1], maxWidth, at)], px: sizes.minPx };
  }
  return { lines: [truncate(text, maxWidth, at)], px: sizes.minPx };
}
