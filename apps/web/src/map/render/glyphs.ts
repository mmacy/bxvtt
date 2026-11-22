/**
 * Map symbols, drawn in world coordinates (one unit is one cell) on a context whose transform
 * already maps world to device pixels. Each function draws one symbol and restores the context.
 */
import type { Direction } from '../geometry';
import type { MapEdge, MapFeature, MapTransition, TrapState } from '../model';
import type { MapTheme } from '../themes';
import { textAtWorld, type Ctx2D } from './util';

export interface GlyphStyle {
  theme: MapTheme;
  /** One device pixel in world units. */
  px: number;
  /** The wall line width in world units. */
  wallWidth: number;
  /** Level of detail: 0 when cells are tiny, 2 when they are large. */
  lod: 0 | 1 | 2;
  /** Device pixels per cell. */
  scale: number;
  /** Strokes a path in the wall style (casing and line), with the context in local coordinates. */
  strokeWall: (ctx: Ctx2D, build: (ctx: Ctx2D) => void) => void;
}

/**
 * Sets up a local frame on an edge: `u` runs along the edge from 0 to 1, and `v` crosses it, with
 * positive `v` pointing into the keyed cell (south of a north edge, east of a west edge).
 */
function edgeFrame(ctx: Ctx2D, edge: Pick<MapEdge, 'x' | 'y' | 'side'>): void {
  if (edge.side === 'north') ctx.transform(1, 0, 0, 1, edge.x, edge.y);
  else ctx.transform(0, 1, 1, 0, edge.x, edge.y);
}

function line(ctx: Ctx2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
}

const OPEN_FROM = 0.24;
const OPEN_TO = 0.76;

export function drawDoor(ctx: Ctx2D, edge: MapEdge, s: GlyphStyle): void {
  const door = edge.door;
  if (!door) return;
  const { theme, px } = s;
  ctx.save();
  edgeFrame(ctx, edge);
  // Jambs: the wall on each side of the opening.
  s.strokeWall(ctx, (c) => {
    line(c, 0, 0, OPEN_FROM, 0);
    line(c, OPEN_TO, 0, 1, 0);
  });
  const thick = Math.max(s.wallWidth * 2.1, 0.17);
  const outline = Math.max(s.wallWidth * 0.5, 1.15 * px);
  const length = OPEN_TO - OPEN_FROM;
  ctx.lineJoin = 'miter';
  ctx.lineWidth = outline;
  ctx.strokeStyle = theme.door.stroke;

  if (s.lod === 0) {
    if (!door.open) {
      ctx.fillStyle = door.locked ? theme.door.locked : theme.door.stroke;
      ctx.fillRect(OPEN_FROM, -thick / 2, length, thick);
    }
    ctx.restore();
    return;
  }

  if (door.open) {
    // The leaf swings into the keyed cell from a hinge at the opening's start.
    const leaf = Math.max(thick * 0.62, 0.1);
    if (s.lod === 2 && theme.name !== 'torchlit') {
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([3 * px, 3 * px]);
      ctx.lineWidth = Math.max(px, outline * 0.6);
      ctx.strokeStyle = theme.door.stroke;
      ctx.globalAlpha = 0.55;
      ctx.arc(OPEN_FROM, 0, length, 0, Math.PI / 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.rect(OPEN_FROM - leaf / 2, 0, leaf, length * 0.96);
    ctx.fillStyle = theme.door.fill;
    ctx.fill();
    ctx.stroke();
    if (door.wedged) {
      // An iron spike under the free edge of the leaf.
      ctx.beginPath();
      const tipV = length * 0.96;
      ctx.moveTo(OPEN_FROM + leaf / 2 + 0.02, tipV - 0.02);
      ctx.lineTo(OPEN_FROM + leaf / 2 + 0.17, tipV + 0.02);
      ctx.lineTo(OPEN_FROM + leaf / 2 + 0.02, tipV + 0.09);
      ctx.closePath();
      ctx.fillStyle = theme.door.stuck;
      ctx.fill();
      ctx.lineWidth = Math.max(px, outline * 0.5);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.rect(OPEN_FROM, -thick / 2, length, thick);
    ctx.fillStyle = door.locked ? theme.door.locked : theme.door.fill;
    ctx.fill();
    ctx.stroke();
    if (theme.name === 'torchlit' && !door.locked) {
      // Planks and iron bands.
      ctx.beginPath();
      ctx.lineWidth = Math.max(px, outline * 0.55);
      ctx.strokeStyle = theme.door.detail;
      line(ctx, OPEN_FROM + length * 0.3, -thick / 2, OPEN_FROM + length * 0.3, thick / 2);
      line(ctx, OPEN_FROM + length * 0.7, -thick / 2, OPEN_FROM + length * 0.7, thick / 2);
      ctx.stroke();
    }
    if (door.locked || door.unlocked) {
      // A keyhole: solid on a locked door, outlined on an unlocked one.
      const cx = 0.5;
      const r = thick * 0.2;
      ctx.beginPath();
      ctx.arc(cx, -r * 0.55, r, 0, Math.PI * 2);
      ctx.moveTo(cx - r * 0.55, -r * 0.2);
      ctx.lineTo(cx + r * 0.55, -r * 0.2);
      ctx.lineTo(cx + r * 0.95, r * 1.7);
      ctx.lineTo(cx - r * 0.95, r * 1.7);
      ctx.closePath();
      if (door.locked) {
        ctx.fillStyle = theme.door.fill;
        ctx.fill();
      } else {
        ctx.lineWidth = Math.max(px, outline * 0.6);
        ctx.strokeStyle = theme.door.locked;
        ctx.stroke();
      }
    }
    if (door.stuck) {
      // Two strokes across the leaf: it has to be forced.
      ctx.beginPath();
      ctx.lineWidth = Math.max(px * 1.2, outline * 0.8);
      ctx.strokeStyle = door.locked ? theme.door.fill : theme.door.stuck;
      ctx.lineCap = 'round';
      const a = OPEN_FROM + length * 0.12;
      const b = OPEN_TO - length * 0.12;
      line(ctx, a, thick * 0.32, a + length * 0.16, -thick * 0.32);
      line(ctx, b - length * 0.16, thick * 0.32, b, -thick * 0.32);
      ctx.stroke();
    }
  }
  if (door.secret && s.lod === 2) {
    // A found secret door: the referee's reminder that players didn't see it at first.
    textAtWorld(
      ctx,
      'S',
      0.5,
      door.open ? -thick * 0.9 : -thick * 1.25,
      `700 ${Math.round(s.scale * 0.24)}px ${theme.label.family}`,
      theme.door.secret,
      { color: theme.floor.color, width: Math.max(2, s.scale * 0.05) },
    );
  }
  ctx.restore();
}

/** A secret door the party hasn't found: the wall stands, with an S across it. */
export function drawSecretMark(ctx: Ctx2D, edge: MapEdge, s: GlyphStyle): void {
  if (s.lod === 0) return;
  const cx = edge.side === 'north' ? edge.x + 0.5 : edge.x;
  const cy = edge.side === 'north' ? edge.y : edge.y + 0.5;
  const size = Math.round(s.scale * 0.42);
  textAtWorld(ctx, 'S', cx, cy, `800 ${size}px ${s.theme.label.family}`, s.theme.door.secret, {
    color: s.theme.floor.color,
    width: Math.max(2.5, s.scale * 0.09),
  });
}

/**
 * A passage through a wall: the wall drawn broken, with an arrow through it. `outward` is +1 when
 * the passage leads from the keyed cell toward the other side, and -1 the other way.
 */
export function drawPassage(ctx: Ctx2D, edge: MapEdge, outward: 1 | -1, s: GlyphStyle): void {
  const { theme, px } = s;
  ctx.save();
  edgeFrame(ctx, edge);
  s.strokeWall(ctx, (c) => {
    line(c, 0, 0, 0.16, 0);
    line(c, 0.84, 0, 1, 0);
  });
  if (s.lod > 0) {
    ctx.beginPath();
    ctx.setLineDash([Math.max(2 * px, 0.06), Math.max(2 * px, 0.05)]);
    ctx.lineWidth = Math.max(px, s.wallWidth * 0.7);
    ctx.strokeStyle = theme.wall.color;
    line(ctx, 0.16, 0, 0.84, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    // An arrow from the passage's cell through the wall.
    const v0 = 0.3 * outward;
    const v1 = -0.18 * outward;
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.2 * px, s.wallWidth * 0.55);
    ctx.strokeStyle = theme.glyph.accent;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    line(ctx, 0.5, v0, 0.5, v1);
    ctx.moveTo(0.4, v1 + 0.1 * outward);
    ctx.lineTo(0.5, v1);
    ctx.lineTo(0.6, v1 + 0.1 * outward);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Stairs: treads across the cell. Stairs down narrow toward the far end and point with a solid
 * arrow. Stairs up keep their width and end in an open chevron. `toward` is the direction of travel
 * down the treads.
 */
export function drawStairs(
  ctx: Ctx2D,
  x: number,
  y: number,
  kind: 'stairs_up' | 'stairs_down',
  toward: Direction,
  s: GlyphStyle,
): void {
  const { theme, px } = s;
  ctx.save();
  // Local frame: the stairs run along +v from v = 0.1 to v = 0.9, centred on u = 0.5.
  const rot: Record<Direction, [number, number, number, number, number, number]> = {
    south: [1, 0, 0, 1, x, y],
    north: [-1, 0, 0, -1, x + 1, y + 1],
    east: [0, 1, -1, 0, x + 1, y],
    west: [0, -1, 1, 0, x, y + 1],
  };
  ctx.transform(...rot[toward]);
  const down = kind === 'stairs_down';
  const steps = s.lod === 2 ? 6 : 4;
  const top = 0.12;
  const bottom = 0.88;
  const halfAt = (t: number) => (down ? 0.38 - 0.2 * t : 0.36);
  ctx.beginPath();
  ctx.moveTo(0.5 - halfAt(0), top);
  ctx.lineTo(0.5 + halfAt(0), top);
  ctx.lineTo(0.5 + halfAt(1), bottom);
  ctx.lineTo(0.5 - halfAt(1), bottom);
  ctx.closePath();
  ctx.fillStyle = theme.glyph.fill;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(1.1 * px, 0.035);
  ctx.strokeStyle = theme.glyph.color;
  ctx.lineJoin = 'miter';
  ctx.stroke();
  ctx.beginPath();
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const v = top + (bottom - top) * t;
    const h = halfAt(t);
    line(ctx, 0.5 - h, v, 0.5 + h, v);
  }
  ctx.lineWidth = Math.max(px, 0.028);
  ctx.stroke();
  if (s.lod > 0) {
    ctx.beginPath();
    if (down) {
      ctx.moveTo(0.5, bottom - 0.02);
      ctx.lineTo(0.5 - 0.11, bottom - 0.2);
      ctx.lineTo(0.5 + 0.11, bottom - 0.2);
      ctx.closePath();
      ctx.fillStyle = theme.glyph.accent;
      ctx.fill();
    } else {
      ctx.moveTo(0.5 - 0.13, top + 0.2);
      ctx.lineTo(0.5, top + 0.06);
      ctx.lineTo(0.5 + 0.13, top + 0.2);
      ctx.lineWidth = Math.max(1.4 * px, 0.045);
      ctx.strokeStyle = theme.glyph.accent;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawTrapdoor(ctx: Ctx2D, x: number, y: number, s: GlyphStyle): void {
  const { theme, px } = s;
  const inset = 0.2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + inset, y + inset, 1 - inset * 2, 1 - inset * 2);
  ctx.fillStyle = theme.glyph.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2 * px, 0.04);
  ctx.strokeStyle = theme.glyph.color;
  ctx.stroke();
  ctx.beginPath();
  ctx.lineWidth = Math.max(px, 0.025);
  line(ctx, x + inset, y + inset, x + 1 - inset, y + 1 - inset);
  line(ctx, x + 1 - inset, y + inset, x + inset, y + 1 - inset);
  ctx.stroke();
  if (s.lod > 0) {
    // A ring pull.
    ctx.beginPath();
    ctx.arc(x + 0.5, y + 1 - inset - 0.1, 0.06, 0, Math.PI * 2);
    ctx.fillStyle = theme.glyph.accent;
    ctx.fill();
  }
  ctx.restore();
}

export function drawChute(ctx: Ctx2D, x: number, y: number, s: GlyphStyle): void {
  const { theme, px } = s;
  const cx = x + 0.5;
  const cy = y + 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 0.32, 0, Math.PI * 2);
  ctx.fillStyle = theme.glyph.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2 * px, 0.04);
  ctx.strokeStyle = theme.glyph.color;
  ctx.stroke();
  ctx.beginPath();
  // A spiral falling inward.
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const a = t * Math.PI * 3.2;
    const r = 0.26 * (1 - t * 0.85);
    const px2 = cx + Math.cos(a) * r;
    const py2 = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px2, py2);
    else ctx.lineTo(px2, py2);
  }
  ctx.lineWidth = Math.max(px, 0.026);
  ctx.strokeStyle = theme.glyph.accent;
  ctx.stroke();
  ctx.restore();
}

/** The cell the party arrives at from town: a double chevron pointing in. */
export function drawEntrance(ctx: Ctx2D, x: number, y: number, s: GlyphStyle): void {
  if (s.lod === 0) return;
  const { theme, px } = s;
  ctx.save();
  ctx.beginPath();
  ctx.lineWidth = Math.max(1.6 * px, 0.06);
  ctx.strokeStyle = theme.glyph.accent;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const dy of [0.0, 0.18]) {
    ctx.moveTo(x + 0.32, y + 0.62 + dy);
    ctx.lineTo(x + 0.5, y + 0.46 + dy);
    ctx.lineTo(x + 0.68, y + 0.62 + dy);
  }
  ctx.stroke();
  ctx.restore();
}

function trapBadge(ctx: Ctx2D, cx: number, cy: number, size: number, state: TrapState, s: GlyphStyle): void {
  const { theme, px } = s;
  const color = state === 'removed' ? theme.marker.done : theme.marker.trap;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.6);
  ctx.lineTo(cx + size * 0.55, cy + size * 0.42);
  ctx.lineTo(cx - size * 0.55, cy + size * 0.42);
  ctx.closePath();
  ctx.lineWidth = Math.max(px, size * 0.12);
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  if (state === 'hidden') {
    ctx.fillStyle = theme.glyph.fill;
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
    if (state === 'sprung') {
      ctx.beginPath();
      ctx.strokeStyle = theme.glyph.fill;
      ctx.lineWidth = Math.max(px, size * 0.1);
      line(ctx, cx - size * 0.16, cy - size * 0.05, cx + size * 0.16, cy + size * 0.27);
      line(ctx, cx + size * 0.16, cy - size * 0.05, cx - size * 0.16, cy + size * 0.27);
      ctx.stroke();
    }
  }
}

/** A feature icon centred at `(cx, cy)` with radius `r`, all in cells. */
export function drawFeature(
  ctx: Ctx2D,
  feature: MapFeature,
  cx: number,
  cy: number,
  r: number,
  s: GlyphStyle,
): void {
  const { theme, px } = s;
  ctx.save();
  const lw = Math.max(1.1 * px, r * 0.13);
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (s.lod === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = feature.emptied ? theme.glyph.muted : theme.glyph.accent;
    ctx.fill();
    ctx.restore();
    return;
  }
  switch (feature.kind) {
    case 'cache':
    case 'generated_cache': {
      const w = r * 1.7;
      const h = r * 1.05;
      const left = cx - w / 2;
      const bodyTop = cy - h * 0.15;
      const muted = feature.emptied;
      ctx.strokeStyle = muted ? theme.glyph.muted : theme.glyph.accent;
      ctx.fillStyle = theme.glyph.fill;
      if (muted) ctx.setLineDash([Math.max(2 * px, r * 0.18), Math.max(1.5 * px, r * 0.12)]);
      // Body.
      ctx.beginPath();
      ctx.rect(left, bodyTop, w, h * 0.78);
      ctx.fill();
      ctx.stroke();
      // Lid: closed, or thrown back on an emptied cache.
      ctx.beginPath();
      if (muted) {
        ctx.moveTo(left, bodyTop);
        ctx.lineTo(left - r * 0.25, bodyTop - h * 0.55);
        ctx.lineTo(left + w - r * 0.25, bodyTop - h * 0.55);
        ctx.lineTo(left + w, bodyTop);
      } else {
        ctx.moveTo(left, bodyTop);
        ctx.quadraticCurveTo(left, bodyTop - h * 0.6, cx, bodyTop - h * 0.6);
        ctx.quadraticCurveTo(left + w, bodyTop - h * 0.6, left + w, bodyTop);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (!muted) {
        ctx.beginPath();
        ctx.arc(cx, bodyTop + h * 0.08, Math.max(px * 1.5, r * 0.13), 0, Math.PI * 2);
        ctx.fillStyle = theme.glyph.accent;
        ctx.fill();
      }
      if (feature.kind === 'generated_cache') {
        // A glint: the session rolled this treasure.
        const gx = cx + w * 0.55;
        const gy = cy - h * 0.75;
        const g = r * 0.38;
        ctx.beginPath();
        ctx.moveTo(gx, gy - g);
        ctx.quadraticCurveTo(gx, gy, gx + g, gy);
        ctx.quadraticCurveTo(gx, gy, gx, gy + g);
        ctx.quadraticCurveTo(gx, gy, gx - g, gy);
        ctx.quadraticCurveTo(gx, gy, gx, gy - g);
        ctx.fillStyle = theme.marker.treasure;
        ctx.fill();
      }
      if (feature.trap) trapBadge(ctx, cx + w * 0.5, cy + h * 0.55, r * 0.75, feature.trap.state, s);
      break;
    }
    case 'pile': {
      // A sack, tied at the neck.
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy - r * 0.55);
      ctx.bezierCurveTo(cx - r * 1.1, cy - r * 0.1, cx - r * 1.0, cy + r * 0.85, cx, cy + r * 0.85);
      ctx.bezierCurveTo(cx + r * 1.0, cy + r * 0.85, cx + r * 1.1, cy - r * 0.1, cx + r * 0.3, cy - r * 0.55);
      ctx.closePath();
      ctx.fillStyle = theme.glyph.fill;
      ctx.fill();
      ctx.strokeStyle = theme.glyph.color;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy - r * 0.55);
      ctx.lineTo(cx - r * 0.45, cy - r * 0.9);
      ctx.moveTo(cx + r * 0.3, cy - r * 0.55);
      ctx.lineTo(cx + r * 0.45, cy - r * 0.9);
      ctx.moveTo(cx - r * 0.38, cy - r * 0.5);
      ctx.lineTo(cx + r * 0.38, cy - r * 0.5);
      ctx.stroke();
      break;
    }
    case 'trick': {
      const found = feature.found !== false;
      ctx.strokeStyle = found ? theme.glyph.accent : theme.glyph.muted;
      if (!found) ctx.setLineDash([Math.max(2 * px, r * 0.2), Math.max(1.5 * px, r * 0.15)]);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        line(
          ctx,
          cx + Math.cos(a) * r * 0.55,
          cy + Math.sin(a) * r * 0.55,
          cx + Math.cos(a) * r * 0.95,
          cy + Math.sin(a) * r * 0.95,
        );
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = theme.glyph.fill;
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
      ctx.fillStyle = found ? theme.glyph.accent : theme.glyph.muted;
      ctx.fill();
      break;
    }
    case 'custom': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.85);
      ctx.lineTo(cx + r * 0.75, cy);
      ctx.lineTo(cx, cy + r * 0.85);
      ctx.lineTo(cx - r * 0.75, cy);
      ctx.closePath();
      ctx.fillStyle = theme.glyph.fill;
      ctx.fill();
      ctx.strokeStyle = theme.glyph.color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = theme.glyph.accent;
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Draws any non-passage transition on its cell. */
export function drawTransition(
  ctx: Ctx2D,
  transition: MapTransition,
  toward: Direction,
  s: GlyphStyle,
): void {
  switch (transition.kind) {
    case 'stairs_up':
    case 'stairs_down':
      drawStairs(ctx, transition.x, transition.y, transition.kind, toward, s);
      break;
    case 'trapdoor':
      drawTrapdoor(ctx, transition.x, transition.y, s);
      break;
    case 'chute':
      drawChute(ctx, transition.x, transition.y, s);
      break;
    case 'passage':
      break;
  }
}
