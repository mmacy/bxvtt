/**
 * Overlay data the map draws on top of the level: pings, freehand strokes, pins, remote pointers,
 * and the ruler. The caller owns all of it and passes it in as props. Coordinates are in world
 * space (cells), so an overlay stays on its spot as the camera moves.
 */
import { CELL_FEET, type Point } from './geometry';

/** The tools the map understands. */
export type MapTool =
  'select' | 'pan' | 'draw' | 'erase' | 'ruler' | 'ping' | 'pin' | 'pick-cell' | 'pick-edge';

export interface MapPing {
  id: string;
  x: number;
  y: number;
  /** A CSS color, usually the sender's color. */
  color: string;
  /** The sender's name, drawn beside the pulse. */
  label?: string;
}

export interface MapStroke {
  id: string;
  /** The stroke's points in world coordinates (cells), as `[x, y]` pairs. */
  points: [number, number][];
  color: string;
  /** The line width in cells, so a stroke scales with the map. */
  width: number;
}

export interface MapPin {
  id: string;
  x: number;
  y: number;
  /** The text inside the marker, usually a number. */
  label: string;
  /** The note shown on hover. */
  note?: string;
  color?: string;
  /** Draws the pin in the referee style: a dashed ring and a lock, for notes players never see. */
  refereeOnly?: boolean;
}

export interface MapPointer {
  id: string;
  x: number;
  y: number;
  color: string;
  label?: string;
}

/** How the ruler counts squares between two cells. */
export type RulerMetric = 'grid' | 'diagonal' | 'straight';

export interface Measurement {
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Squares between the two cells, by the metric. */
  squares: number;
  /** `squares` in feet, at 10 feet a square. */
  feet: number;
  metric: RulerMetric;
}

/**
 * Measures between the cells that contain two world points.
 *
 * - `grid` counts orthogonal steps, the way the party walks (north, east, south, and west only).
 * - `diagonal` counts a diagonal step as one square.
 * - `straight` is the straight-line distance between cell centres, rounded to one decimal.
 */
export function measure(from: Point, to: Point, metric: RulerMetric = 'grid'): Measurement {
  const a = { x: Math.floor(from.x), y: Math.floor(from.y) };
  const b = { x: Math.floor(to.x), y: Math.floor(to.y) };
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  const squares =
    metric === 'grid'
      ? dx + dy
      : metric === 'diagonal'
        ? Math.max(dx, dy)
        : Math.round(Math.hypot(dx, dy) * 10) / 10;
  return { from: a, to: b, squares, feet: Math.round(squares * CELL_FEET * 10) / 10, metric };
}

/** A short label for a measurement, like `"4 squares · 40'"`. */
export function measurementLabel(m: Measurement): string {
  const unit = m.squares === 1 ? 'square' : 'squares';
  return `${m.squares} ${unit} · ${m.feet}'`;
}

/** The squared distance from `p` to the segment from `a` to `b`. */
export function distanceToSegmentSquared(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const length = vx * vx + vy * vy;
  let t = length === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / length;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + vx * t - p.x;
  const y = a.y + vy * t - p.y;
  return x * x + y * y;
}

/**
 * Simplifies a stroke with the Ramer-Douglas-Peucker algorithm, dropping points closer than
 * `tolerance` (in cells) to the line through their neighbours. The first and last points stay.
 */
export function simplifyStroke(points: readonly [number, number][], tolerance = 0.03): [number, number][] {
  if (points.length <= 2) return points.map(([x, y]) => [x, y]);
  // Drop consecutive duplicates first, which pointer events produce at rest.
  const unique: [number, number][] = [];
  for (const point of points) {
    const prev = unique[unique.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) unique.push([point[0], point[1]]);
  }
  if (unique.length <= 2) return unique;
  const keep = new Uint8Array(unique.length);
  keep[0] = 1;
  keep[unique.length - 1] = 1;
  const tol2 = tolerance * tolerance;
  const stack: [number, number][] = [[0, unique.length - 1]];
  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [start, end] = range;
    const a = unique[start];
    const b = unique[end];
    if (!a || !b) continue;
    let worst = -1;
    let worstDistance = tol2;
    for (let i = start + 1; i < end; i++) {
      const p = unique[i];
      if (!p) continue;
      const d = distanceToSegmentSquared({ x: p[0], y: p[1] }, { x: a[0], y: a[1] }, { x: b[0], y: b[1] });
      if (d > worstDistance) {
        worst = i;
        worstDistance = d;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([start, worst], [worst, end]);
    }
  }
  return unique.filter((_, i) => keep[i] === 1);
}

/** The ids of the strokes within `radius` cells of `point`, counting each stroke's own width. */
export function strokesHit(strokes: readonly MapStroke[], point: Point, radius: number): string[] {
  const hits: string[] = [];
  for (const stroke of strokes) {
    const reach = radius + stroke.width / 2;
    const reach2 = reach * reach;
    const pts = stroke.points;
    let hit = false;
    if (pts.length === 1) {
      const only = pts[0];
      if (only) hit = (only[0] - point.x) ** 2 + (only[1] - point.y) ** 2 <= reach2;
    }
    for (let i = 0; i + 1 < pts.length && !hit; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      hit = distanceToSegmentSquared(point, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }) <= reach2;
    }
    if (hit) hits.push(stroke.id);
  }
  return hits;
}
