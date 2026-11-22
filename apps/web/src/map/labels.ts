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

/**
 * The best spot for an area's label: the centre of the widest horizontal run of the area's cells that holds no
 * stairs or feature, nearest the area's anchor when runs tie. The label may run past the run's ends over cells
 * that hold no symbol, up to two cells each side.
 */
export function labelSpot(scene: Scene, area: MapArea): LabelSpot {
  const rows = new Map<number, number[]>();
  for (const [x, y] of area.cells) {
    if (occupied(scene, x, y)) continue;
    const list = rows.get(y);
    if (list) list.push(x);
    else rows.set(y, [x]);
  }
  let best: { y: number; start: number; end: number } | null = null;
  let bestScore = -Infinity;
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    let start = xs[0] ?? 0;
    for (let i = 1; i <= xs.length; i++) {
      const x = xs[i];
      const prev = xs[i - 1] ?? start;
      if (x !== undefined && x === prev + 1) continue;
      const end = prev;
      const length = end - start + 1;
      const cx = (start + end + 1) / 2;
      const distance = Math.hypot(cx - area.anchor.x, y + 0.5 - area.anchor.y);
      // Longer runs win. Among runs of equal length, the one nearest the anchor wins.
      const score = length * 1000 - distance;
      if (score > bestScore) {
        bestScore = score;
        best = { y, start, end };
      }
      if (x !== undefined) start = x;
    }
  }
  if (!best) return { x: area.anchor.x, y: area.anchor.y, width: 1, inside: 1, twoLines: false };
  const free = (x: number) => !occupied(scene, x, best.y);
  let left = 0;
  while (left < OVERHANG && free(best.start - left - 1)) left++;
  let right = 0;
  while (right < OVERHANG && free(best.end + right + 1)) right++;
  const extra = Math.min(left, right);
  const x0 = best.start - extra;
  const x1 = best.end + extra;
  let twoLines = true;
  for (let x = x0; x <= x1 && twoLines; x++) {
    if (occupied(scene, x, best.y - 1) || occupied(scene, x, best.y + 1)) twoLines = false;
  }
  return {
    x: (best.start + best.end + 1) / 2,
    y: best.y + 0.5,
    width: x1 - x0 + 1,
    inside: best.end - best.start + 1,
    twoLines,
  };
}

/** Every area's label spot, keyed by area id. */
export function labelSpots(scene: Scene): Map<string, LabelSpot> {
  return new Map(scene.map.areas.map((area) => [area.id, labelSpot(scene, area)]));
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
