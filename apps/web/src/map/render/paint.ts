/**
 * Paints the static map (everything that changes only when the map data changes) into a world
 * rectangle. Tiles and the overview both come from here, so they always agree.
 *
 * Layers, bottom to top: rock, rock detail (grid, stone, or hatching), floor, frontier fades, grid,
 * wall shadow, walls, doors and passages, transitions, features, the entrance, and on a referee map
 * a soft veil over floor the party hasn't seen.
 */
import { DIRECTIONS, OPPOSITE, type Direction } from '../geometry';
import type { Bounds } from '../model';
import { featureSlots } from '../hit';
import { EDGE_DOOR, EDGE_OPEN, EDGE_PASSAGE, FLOOR, KNOWN, type Scene, type WallRun } from '../scene';
import type { MapTheme } from '../themes';
import {
  drawDoor,
  drawEntrance,
  drawFeature,
  drawPassage,
  drawSecretMark,
  drawTransition,
  type GlyphStyle,
} from './glyphs';
import { hash2, rgba, shade, type Ctx2D } from './util';

export interface PaintRequest {
  ctx: Ctx2D;
  scene: Scene;
  theme: MapTheme;
  /** Device pixels per cell. */
  scale: number;
  /** Device pixels per CSS pixel. */
  dpr: number;
  /** The world rectangle to paint. The caller sets the transform from world to device. */
  rect: Bounds;
}

export type Lod = 0 | 1 | 2;

/** The level of detail for a size in CSS pixels per cell. */
export function lodFor(cssPerCell: number): Lod {
  return cssPerCell < 9 ? 0 : cssPerCell < 22 ? 1 : 2;
}

export function wallWidthFor(theme: MapTheme, scale: number, dpr: number): number {
  return Math.max(theme.wall.width, (theme.wall.minPx * dpr) / scale);
}

export function paintStatic(req: PaintRequest): void {
  const { ctx, scene, theme, scale, dpr, rect } = req;
  const px = 1 / scale;
  const lod = lodFor(scale / dpr);
  const margin = 2;
  const x0 = Math.floor(rect.minX) - margin;
  const y0 = Math.floor(rect.minY) - margin;
  const x1 = Math.ceil(rect.maxX) + margin;
  const y1 = Math.ceil(rect.maxY) + margin;
  const wallWidth = wallWidthFor(theme, scale, dpr);
  const referee = scene.map.layer === 'referee';

  // 1. Rock.
  ctx.fillStyle = theme.rock.color;
  ctx.fillRect(rect.minX, rect.minY, rect.maxX - rect.minX, rect.maxY - rect.minY);
  if (lod > 0) paintRockDetail(req, x0, y0, x1, y1, lod);

  // 2. Floor, grouped by tone so the fill style changes a handful of times.
  const tones = floorTones(theme);
  const paths = tones.map(() => new Path2D());
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!scene.isFloor(x, y)) continue;
      const t = theme.floor.variation > 0 ? Math.floor(hash2(x, y, 11) * tones.length) : 0;
      paths[Math.min(t, tones.length - 1)]?.rect(x, y, 1, 1);
    }
  }
  tones.forEach((tone, i) => {
    const path = paths[i];
    if (!path) return;
    ctx.fillStyle = tone;
    ctx.fill(path);
  });
  if (theme.floor.flagstones && lod === 2) paintFlagstoneDetail(req, x0, y0, x1, y1);

  // 3. Frontier: floor fades into unknown space past an open edge.
  if (!referee) paintFrontier(req, x0, y0, x1, y1);

  // 4. Grid on the floor, between cells that open into each other.
  if (lod > 0) {
    const grid = new Path2D();
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!scene.isFloor(x, y)) continue;
        if (scene.isFloor(x, y - 1) && scene.edgeCode(x, y, 'north') === EDGE_OPEN) {
          grid.moveTo(x, y);
          grid.lineTo(x + 1, y);
        }
        if (scene.isFloor(x - 1, y) && scene.edgeCode(x, y, 'west') === EDGE_OPEN) {
          grid.moveTo(x, y);
          grid.lineTo(x, y + 1);
        }
      }
    }
    ctx.save();
    ctx.lineWidth = theme.grid.width * px * Math.max(1, dpr * 0.75);
    ctx.strokeStyle = theme.grid.color;
    if (theme.grid.dash) ctx.setLineDash(theme.grid.dash.map((d) => d * px * dpr));
    ctx.stroke(grid);
    ctx.restore();
  }

  // 5 and 6. Walls, with their shadow first.
  const runs = scene.wallRunsIn({ minX: x0, minY: y0, maxX: x1, maxY: y1 });
  const wallPath = buildWallPath(runs, theme.wall.wobble);
  if (theme.wall.shadow && lod > 0) {
    ctx.save();
    ctx.shadowColor = theme.wall.shadow.color;
    ctx.shadowBlur = theme.wall.shadow.blur * scale;
    ctx.lineWidth = wallWidth;
    ctx.lineCap = 'square';
    ctx.strokeStyle = theme.wall.shadow.color;
    ctx.stroke(wallPath);
    ctx.restore();
  }
  strokeWallPath(ctx, wallPath, theme, wallWidth);

  // 7. Doors, passages, and secret marks.
  const style: GlyphStyle = {
    theme,
    px,
    wallWidth,
    lod,
    scale,
    strokeWall: (c, build) => {
      c.beginPath();
      build(c);
      if (theme.wall.casing) {
        c.lineWidth = wallWidth + Math.max(2 * px, wallWidth * 0.45);
        c.strokeStyle = theme.wall.casing;
        c.lineCap = 'square';
        c.stroke();
      }
      c.lineWidth = wallWidth;
      c.strokeStyle = theme.wall.color;
      c.lineCap = 'square';
      c.stroke();
    },
  };
  const passageOutward = new Map<string, 1 | -1>();
  for (const t of scene.map.transitions) {
    if (t.kind !== 'passage' || !t.side) continue;
    const keyedSide = t.side === 'north' || t.side === 'west';
    // The arrow leads out of the passage's own cell. Positive means that cell is the keyed one.
    passageOutward.set(edgeKeyOfSide(t.x, t.y, t.side), keyedSide ? 1 : -1);
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      for (const side of ['north', 'west'] as const) {
        const code = scene.edgeCode(x, y, side);
        if (code !== EDGE_DOOR && code !== EDGE_PASSAGE) continue;
        const edge = scene.edgeAt(x, y, side);
        if (!edge) continue;
        if (code === EDGE_PASSAGE) drawPassage(ctx, edge, passageOutward.get(edge.key) ?? 1, style);
        else if (edge.door?.secret && edge.door.discovered === false) drawSecretMark(ctx, edge, style);
        else drawDoor(ctx, edge, style);
      }
    }
  }

  // 8 and 9. Transitions and features.
  for (const t of scene.map.transitions) {
    if (t.kind === 'passage' || t.x < x0 || t.x >= x1 || t.y < y0 || t.y >= y1) continue;
    drawTransition(ctx, t, stairsDirection(scene, t.x, t.y), style);
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      for (const slot of featureSlots(scene, x, y))
        drawFeature(ctx, slot.feature, slot.cx, slot.cy, slot.r, style);
    }
  }
  const entrance = scene.map.entrance;
  if (entrance && !scene.map.transitions.some((t) => t.x === entrance[0] && t.y === entrance[1])) {
    drawEntrance(ctx, entrance[0], entrance[1], style);
  }

  // 10. The referee's veil over floor the party hasn't seen, with a soft edge.
  if (referee) paintVeil(req, x0, y0, x1, y1);
}

function edgeKeyOfSide(x: number, y: number, side: Direction): string {
  if (side === 'south') return `${x},${y + 1}:north`;
  if (side === 'east') return `${x + 1},${y}:west`;
  return `${x},${y}:${side}`;
}

/** Which way stairs descend: away from the side the party walks in from. */
function stairsDirection(scene: Scene, x: number, y: number): Direction {
  const open = DIRECTIONS.filter((d) => {
    const code = scene.edgeCode(x, y, d);
    return code === EDGE_OPEN || code === EDGE_DOOR;
  });
  if (open.length === 1 && open[0]) return OPPOSITE[open[0]];
  // In a room, run the stairs along the room's longer free axis.
  const ns = open.includes('north') || open.includes('south');
  const ew = open.includes('east') || open.includes('west');
  if (ew && !ns) return 'east';
  return 'south';
}

function floorTones(theme: MapTheme): string[] {
  const v = theme.floor.variation;
  if (v <= 0) return [theme.floor.color];
  const tones: string[] = [];
  for (let i = 0; i < 7; i++) tones.push(shade(theme.floor.color, (i / 6 - 0.5) * 2 * v));
  return tones;
}

function paintRockDetail(req: PaintRequest, x0: number, y0: number, x1: number, y1: number, lod: Lod): void {
  const { ctx, scene, theme, scale, dpr } = req;
  const px = 1 / scale;
  if (theme.rock.grid) {
    const grid = new Path2D();
    for (let x = x0; x <= x1; x++) {
      grid.moveTo(x, y0);
      grid.lineTo(x, y1);
    }
    for (let y = y0; y <= y1; y++) {
      grid.moveTo(x0, y);
      grid.lineTo(x1, y);
    }
    ctx.save();
    ctx.lineWidth = px * Math.max(1, dpr * 0.75);
    ctx.strokeStyle = theme.rock.grid;
    ctx.stroke(grid);
    ctx.restore();
  }
  if (theme.rock.style === 'stone') {
    // Speckled stone near the walls, fading out into the dark.
    const speck = new Path2D();
    const light = new Path2D();
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (scene.isFloor(x, y)) continue;
        const near = nearFloor(scene, x, y, 2);
        if (near === 0) continue;
        const count = near === 1 ? 7 : 3;
        for (let k = 0; k < count; k++) {
          const sx = x + hash2(x, y, 100 + k);
          const sy = y + hash2(x, y, 200 + k);
          const r = (0.02 + hash2(x, y, 300 + k) * 0.05) * (near === 1 ? 1 : 0.7);
          (k % 3 === 0 ? light : speck).moveTo(sx + r, sy);
          (k % 3 === 0 ? light : speck).arc(sx, sy, r, 0, Math.PI * 2);
        }
      }
    }
    ctx.fillStyle = theme.rock.detail;
    ctx.fill(speck);
    ctx.fill(light);
  }
  if (theme.rock.style === 'hatch') paintHatching(req, x0, y0, x1, y1, lod);
}

/** 1 when an 8-neighbour is floor, 2 when floor is two cells away, and 0 otherwise. */
function nearFloor(scene: Scene, x: number, y: number, reach: 1 | 2): number {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if (scene.isFloor(x + dx, y + dy)) return 1;
  if (reach === 1) return 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) if (scene.isFloor(x + dx, y + dy)) return 2;
  }
  return 0;
}

/**
 * Hatching in the hand-drawn style: short clusters of parallel strokes in the rock along the walls,
 * each cluster at its own angle. The floor paints over any stroke that strays onto it.
 */
function paintHatching(req: PaintRequest, x0: number, y0: number, x1: number, y1: number, lod: Lod): void {
  const { ctx, scene, theme, scale } = req;
  const px = 1 / scale;
  const reach = theme.rock.hatchReach;
  const path = new Path2D();
  const candidates = lod === 2 ? 7 : 4;
  const lines = lod === 2 ? 5 : 3;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (scene.isFloor(x, y)) continue;
      if (nearFloor(scene, x, y, 1) === 0) continue;
      for (let c = 0; c < candidates; c++) {
        const cx = x + hash2(x, y, 10 + c);
        const cy = y + hash2(x, y, 20 + c);
        // Keep strokes in a band along the walls: skip a cluster too far from any floor cell.
        const d = distanceToFloor(scene, cx, cy);
        if (d > reach * (0.55 + hash2(x, y, 60 + c) * 0.45)) continue;
        const angle = hash2(x, y, 30 + c) * Math.PI;
        const len = 0.2 + hash2(x, y, 40 + c) * 0.16;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        const spacing = 0.062;
        for (let i = 0; i < lines; i++) {
          const off = (i - (lines - 1) / 2) * spacing;
          const jitter = (hash2(x * 7 + i, y * 5 + c, 50) - 0.5) * 0.06;
          const mx = cx - uy * off;
          const my = cy + ux * off;
          const half = len / 2 + jitter;
          path.moveTo(mx - ux * half, my - uy * half);
          path.lineTo(mx + ux * half, my + uy * half);
        }
      }
    }
  }
  ctx.save();
  ctx.lineWidth = Math.max(0.85 * px, 0.018);
  ctx.lineCap = 'round';
  ctx.strokeStyle = theme.rock.detail;
  ctx.stroke(path);
  ctx.restore();
}

/** The distance from a point to the nearest floor cell among its neighbours, in cells. */
function distanceToFloor(scene: Scene, px: number, py: number): number {
  const fx = Math.floor(px);
  const fy = Math.floor(py);
  let best = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = fx + dx;
      const y = fy + dy;
      if (!scene.isFloor(x, y)) continue;
      const ex = Math.max(x - px, 0, px - (x + 1));
      const ey = Math.max(y - py, 0, py - (y + 1));
      best = Math.min(best, Math.hypot(ex, ey));
    }
  }
  return best;
}

function paintFlagstoneDetail(req: PaintRequest, x0: number, y0: number, x1: number, y1: number): void {
  const { ctx, scene, scale } = req;
  const px = 1 / scale;
  const bevel = new Path2D();
  const cracks = new Path2D();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!scene.isFloor(x, y)) continue;
      bevel.moveTo(x + 0.04, y + 0.96);
      bevel.lineTo(x + 0.04, y + 0.04);
      bevel.lineTo(x + 0.96, y + 0.04);
      if (hash2(x, y, 77) < 0.16) {
        let cx = x + 0.2 + hash2(x, y, 78) * 0.6;
        let cy = y + 0.15 + hash2(x, y, 79) * 0.2;
        cracks.moveTo(cx, cy);
        for (let k = 0; k < 3; k++) {
          cx += (hash2(x, y, 80 + k) - 0.5) * 0.3;
          cy += 0.15 + hash2(x, y, 90 + k) * 0.15;
          cracks.lineTo(Math.min(x + 0.95, Math.max(x + 0.05, cx)), Math.min(y + 0.95, cy));
        }
      }
    }
  }
  ctx.save();
  ctx.lineWidth = Math.max(px, 0.018);
  ctx.strokeStyle = 'rgba(255, 236, 210, 0.07)';
  ctx.stroke(bevel);
  ctx.lineWidth = Math.max(px, 0.014);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.34)';
  ctx.stroke(cracks);
  ctx.restore();
}

function paintFrontier(req: PaintRequest, x0: number, y0: number, x1: number, y1: number): void {
  const { ctx, scene, theme } = req;
  const reach = theme.fog.frontier;
  const solid = rgba(theme.floor.color, 0.92);
  const clear = rgba(theme.floor.color, 0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if ((scene.flagsAt(x, y) & (FLOOR | KNOWN)) !== (FLOOR | KNOWN)) continue;
      for (const d of DIRECTIONS) {
        const code = scene.edgeCode(x, y, d);
        const edge = code === EDGE_DOOR ? scene.edgeAt(x, y, d) : undefined;
        const passable = code === EDGE_OPEN || (code === EDGE_DOOR && edge?.door?.open === true);
        if (!passable) continue;
        const nx = d === 'east' ? x + 1 : d === 'west' ? x - 1 : x;
        const ny = d === 'south' ? y + 1 : d === 'north' ? y - 1 : y;
        if (scene.isFloor(nx, ny)) continue;
        // A gradient from the shared edge into the unknown cell.
        const ex = d === 'east' ? x + 1 : x;
        const ey = d === 'south' ? y + 1 : y;
        const [gx, gy] = d === 'east' ? [1, 0] : d === 'west' ? [-1, 0] : d === 'south' ? [0, 1] : [0, -1];
        const gradient = ctx.createLinearGradient(ex, ey, ex + gx * reach, ey + gy * reach);
        gradient.addColorStop(0, solid);
        gradient.addColorStop(1, clear);
        ctx.fillStyle = gradient;
        if (d === 'north' || d === 'south') ctx.fillRect(x, d === 'south' ? y + 1 : y - reach, 1, reach);
        else ctx.fillRect(d === 'east' ? x + 1 : x - reach, y, reach, 1);
      }
    }
  }
}

/** A soft veil over unseen floor: drawn as a shadow, so its edge blurs into the seen floor. */
function paintVeil(req: PaintRequest, x0: number, y0: number, x1: number, y1: number): void {
  const { ctx, scene, theme, scale } = req;
  const offset = 4096 / scale;
  const path = new Path2D();
  let any = false;
  for (let y = y0; y < y1; y++) {
    let runStart = -1;
    for (let x = x0; x <= x1; x++) {
      const unseen = x < x1 && (scene.flagsAt(x, y) & (FLOOR | KNOWN)) === FLOOR;
      if (unseen && runStart < 0) runStart = x;
      if (!unseen && runStart >= 0) {
        path.rect(runStart - offset, y, x - runStart, 1);
        any = true;
        runStart = -1;
      }
    }
  }
  if (!any) return;
  ctx.save();
  ctx.shadowColor = rgba(theme.fog.veil, theme.fog.veilAlpha);
  ctx.shadowBlur = 0.14 * scale;
  ctx.shadowOffsetX = offset * ctx.getTransform().a;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#000';
  ctx.fill(path);
  ctx.restore();
}

export function buildWallPath(runs: readonly WallRun[], wobble: number): Path2D {
  const path = new Path2D();
  for (const run of runs) {
    path.moveTo(run.x1, run.y1);
    if (wobble <= 0) {
      path.lineTo(run.x2, run.y2);
      continue;
    }
    // A hand-drawn line: it wanders a little between cell corners and meets each corner exactly.
    const horizontal = run.y1 === run.y2;
    const length = horizontal ? run.x2 - run.x1 : run.y2 - run.y1;
    const steps = Math.max(1, Math.round(length * 2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const along = (horizontal ? run.x1 : run.y1) + length * t;
      const isCorner = Math.abs(along - Math.round(along)) < 1e-6;
      const n = isCorner
        ? 0
        : (hash2(Math.round(along * 2), horizontal ? run.y1 : run.x1, horizontal ? 1 : 2) - 0.5) * 2 * wobble;
      if (horizontal) path.lineTo(along, run.y1 + n);
      else path.lineTo(run.x1 + n, along);
    }
  }
  return path;
}

export function strokeWallPath(ctx: Ctx2D, path: Path2D, theme: MapTheme, width: number): void {
  ctx.save();
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  if (theme.wall.casing) {
    ctx.lineWidth = width + Math.max(width * 0.45, 0.02);
    ctx.strokeStyle = theme.wall.casing;
    ctx.stroke(path);
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = theme.wall.color;
  ctx.stroke(path);
  ctx.restore();
}
