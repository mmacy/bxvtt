/**
 * Hit testing: which thing on the map is under a world point. The renderer calls it on hover and
 * on click, and the tests call it directly.
 */
import { cellKey, directionBetween, sideOfCell, type Direction, type Point } from './geometry';
import type { MapEdge, MapFeature, MapParty, MapTransition } from './model';
import type { MapPin } from './overlays';
import type { Scene } from './scene';

export interface CellTarget {
  kind: 'cell';
  x: number;
  y: number;
  /** Whether the party knows the cell. */
  known: boolean;
  /** Whether the cell is floor on this map. On a player map, unknown cells aren't floor. */
  floor: boolean;
  areaId: string | null;
  /**
   * The direction from the party's cell when the cell is its orthogonal neighbour, and `null`
   * otherwise. Send it as a move: whether the move is legal is bxapi's decision.
   */
  direction: Direction | null;
}

export interface EdgeTarget {
  kind: 'edge';
  edge: MapEdge;
  /** The cell the pointer is in, and which of its sides the edge is. */
  cell: { x: number; y: number };
  side: Direction;
  /** The edge's side of the party's cell when the party stands next to it, and `null` otherwise. */
  direction: Direction | null;
}

export interface FeatureTarget {
  kind: 'feature';
  feature: MapFeature;
}

export interface TransitionTarget {
  kind: 'transition';
  transition: MapTransition;
}

export interface PartyTarget {
  kind: 'party';
  party: MapParty;
}

export interface PinTarget {
  kind: 'pin';
  pin: MapPin;
}

export type MapTarget = CellTarget | EdgeTarget | FeatureTarget | TransitionTarget | PartyTarget | PinTarget;

/** What hit testing looks for. `edge` and `cell` are the referee's pick modes. */
export type HitMode = 'default' | 'cell' | 'edge';

export interface HitOptions {
  /** CSS pixels per cell, so screen-sized targets stay the same size at every zoom. */
  zoom: number;
  mode?: HitMode;
  pins?: readonly MapPin[];
  /** The party token's drawn centre, which can be between cells while it animates. */
  partyAt?: Point | null;
}

/** Where a cell's feature icons sit, in world coordinates, and their radius in cells. */
export function featureSlots(
  scene: Scene,
  x: number,
  y: number,
): { feature: MapFeature; cx: number; cy: number; r: number }[] {
  const features = scene.featuresByCell.get(cellKey(x, y)) ?? [];
  if (features.length === 0) return [];
  const hasTransition = (scene.transitionsByCell.get(cellKey(x, y)) ?? []).some((t) => t.kind !== 'passage');
  if (features.length === 1 && !hasTransition) {
    const only = features[0];
    return only ? [{ feature: only, cx: x + 0.5, cy: y + 0.5, r: 0.3 }] : [];
  }
  // Several things share the cell: small icons along the bottom, clear of a stair glyph.
  const n = Math.min(features.length, 3);
  const r = n === 1 ? 0.2 : 0.16;
  const gap = 1 / (n + 1);
  return features.slice(0, 3).map((feature, i) => ({ feature, cx: x + gap * (i + 1), cy: y + 0.78, r }));
}

export function hitTest(scene: Scene, world: Point, options: HitOptions): MapTarget | null {
  const mode = options.mode ?? 'default';
  const zoom = Math.max(1, options.zoom);
  const cx = Math.floor(world.x);
  const cy = Math.floor(world.y);
  const party = scene.map.party;

  if (mode === 'default') {
    const pinRadius = 13 / zoom;
    let bestPin: MapPin | null = null;
    let bestPinDistance = Infinity;
    for (const pin of options.pins ?? []) {
      // A pin's marker stands above its point, so test the marker's centre.
      const d = Math.hypot(world.x - pin.x, world.y - (pin.y - 14 / zoom));
      if (d <= pinRadius && d < bestPinDistance) {
        bestPin = pin;
        bestPinDistance = d;
      }
    }
    if (bestPin) return { kind: 'pin', pin: bestPin };

    if (party) {
      const at = options.partyAt ?? { x: party.x + 0.5, y: party.y + 0.5 };
      if (Math.hypot(world.x - at.x, world.y - at.y) <= Math.max(0.36, 12 / zoom))
        return { kind: 'party', party };
    }
  }

  if (mode !== 'cell') {
    const edge = nearestEdge(scene, world, cx, cy, zoom, mode === 'edge');
    if (edge) return edge;
    if (mode === 'edge') return null;
  }

  if (mode === 'default') {
    for (const slot of featureSlots(scene, cx, cy)) {
      if (Math.hypot(world.x - slot.cx, world.y - slot.cy) <= Math.max(slot.r, 8 / zoom)) {
        return { kind: 'feature', feature: slot.feature };
      }
    }
    const transition = (scene.transitionsByCell.get(cellKey(cx, cy)) ?? []).find((t) => t.kind !== 'passage');
    if (transition) return { kind: 'transition', transition };
  }

  const areaIndex = scene.areaAt(cx, cy);
  return {
    kind: 'cell',
    x: cx,
    y: cy,
    known: scene.isKnown(cx, cy),
    floor: scene.isFloor(cx, cy),
    areaId: areaIndex >= 0 ? (scene.map.areas[areaIndex]?.id ?? null) : null,
    direction: party ? directionBetween([party.x, party.y], [cx, cy]) : null,
  };
}

/**
 * The edge of cell `(cx, cy)` nearest the point, when the point is close enough to it. In the
 * default mode only doors and passages count, because a wall isn't something to click. With
 * `anyEdge`, every edge of a floor cell counts, for the referee's pick-an-edge tool.
 */
function nearestEdge(
  scene: Scene,
  world: Point,
  cx: number,
  cy: number,
  zoom: number,
  anyEdge: boolean,
): EdgeTarget | null {
  const fx = world.x - cx;
  const fy = world.y - cy;
  const sides: [Direction, number][] = [
    ['north', fy],
    ['south', 1 - fy],
    ['west', fx],
    ['east', 1 - fx],
  ];
  sides.sort((a, b) => a[1] - b[1]);
  const threshold = anyEdge ? 0.5 : Math.min(0.3, Math.max(0.16, 7 / zoom));
  for (const [side, distance] of sides) {
    if (distance > threshold) break;
    const edge = scene.edgeAt(cx, cy, side);
    if (!edge) continue;
    const clickable = edge.kind === 'door' || edge.kind === 'passage';
    if (!anyEdge && !clickable) continue;
    const party = scene.map.party;
    const direction = party ? sideOfCell(edge, party.x, party.y) : null;
    return { kind: 'edge', edge, cell: { x: cx, y: cy }, side, direction };
  }
  return null;
}

/** Two targets refer to the same thing, for deciding whether the hover changed. */
export function sameTarget(a: MapTarget | null, b: MapTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'cell':
      return b.kind === 'cell' && a.x === b.x && a.y === b.y;
    case 'edge':
      return b.kind === 'edge' && a.edge.key === b.edge.key;
    case 'feature':
      return b.kind === 'feature' && a.feature.id === b.feature.id;
    case 'transition':
      return b.kind === 'transition' && a.transition.id === b.transition.id;
    case 'party':
      return b.kind === 'party';
    case 'pin':
      return b.kind === 'pin' && a.pin.id === b.pin.id;
  }
}
