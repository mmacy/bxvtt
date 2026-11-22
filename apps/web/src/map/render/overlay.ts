/**
 * What the renderer draws every frame on top of the tiles. These functions draw in device pixels
 * with an identity transform, converting world points through the `FrameView`, so text and markers
 * stay sharp and keep a readable size at every zoom.
 */
import { FACING_ANGLE, type Direction, type Point } from '../geometry';
import type { MapTarget } from '../hit';
import { featureSlots } from '../hit';
import { lightRadiusCells, type MapArea } from '../model';
import type { PartyPose } from '../motion';
import {
  measurementLabel,
  type MapPin,
  type MapPointer,
  type MapStroke,
  type Measurement,
} from '../overlays';
import type { Scene } from '../scene';
import { fitLabel, placeLabels, type FittedLabel, type LabelRequest, type LabelSpot } from '../labels';
import { casingColor, labelFont, type MapTheme } from '../themes';
import { createCanvas, mulberry32, parseColor, rgba, type Ctx2D } from './util';

export interface FrameView {
  /** CSS pixels per cell. */
  zoom: number;
  dpr: number;
  /** Device pixels per cell. */
  scale: number;
  /** Device size of the canvas. */
  width: number;
  height: number;
  toDevice(x: number, y: number): { x: number; y: number };
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** A pill with text, used for names on pings and pointers. */
function namePill(
  ctx: Ctx2D,
  text: string,
  x: number,
  y: number,
  color: string,
  dpr: number,
  theme: MapTheme,
): void {
  const font = `600 ${12 * dpr}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.font = font;
  const w = ctx.measureText(text).width + 12 * dpr;
  const h = 19 * dpr;
  roundRect(ctx, x, y - h / 2, w, h, h / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.3 * dpr;
  ctx.strokeStyle = casingColor(theme);
  ctx.stroke();
  ctx.fillStyle = readableOn(color);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 6 * dpr, y + 0.5 * dpr);
}

/** Black or white, whichever reads better on a background color. */
export function readableOn(color: string): string {
  const c = parseColor(color);
  const luminance = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
  return luminance > 0.6 ? '#111111' : '#ffffff';
}

/**
 * Draws area labels. A referee area has a number from the key, and its name when the zoom leaves room. A player
 * area has no number, so it shows its name alone, from a closer zoom. With `avoid` (the party's token), a player
 * label that would sit under the token moves above it.
 */
export function drawLabels(
  ctx: Ctx2D,
  view: FrameView,
  scene: Scene,
  theme: MapTheme,
  showMarkers: boolean,
  avoid: Point | null = null,
): void {
  const { zoom, dpr } = view;
  if (zoom < 7) return;
  const labels = layoutLabels(ctx, view, scene, theme, showMarkers, avoid);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const label of labels) {
    const p = view.toDevice(label.x, label.y);
    if (p.x < -200 * dpr || p.y < -80 * dpr || p.x > view.width + 200 * dpr || p.y > view.height + 80 * dpr)
      continue;
    const { area, name } = label;
    ctx.globalAlpha = area.known ? 1 : 0.72;
    ctx.strokeStyle = theme.label.halo;
    ctx.fillStyle = theme.label.color;
    let y = p.y - label.height / 2 + dpr;
    if (label.numbered) {
      ctx.font = labelFont(theme, label.numberPx, 800);
      ctx.lineWidth = Math.max(3 * dpr, label.numberPx * 0.22);
      y += label.numberPx / 2;
      ctx.strokeText(area.label, p.x, y);
      ctx.fillText(area.label, p.x, y);
      y += label.numberPx / 2;
    }
    if (name) {
      const lineHeight = name.px * 1.12;
      ctx.font = labelFont(theme, name.px, label.numbered ? 600 : 650);
      ctx.lineWidth = Math.max(3 * dpr, name.px * 0.3);
      for (const line of name.lines) {
        y += lineHeight / 2;
        ctx.strokeText(line, p.x, y);
        ctx.fillText(line, p.x, y);
        y += lineHeight / 2;
      }
    }
    if (label.markers) drawAreaMarkers(ctx, area, p.x, y + 9 * dpr, dpr, theme);
  }
  ctx.restore();
}

interface PlacedLabel {
  area: MapArea;
  /** The block's centre in world coordinates. */
  x: number;
  y: number;
  numbered: boolean;
  numberPx: number;
  name: FittedLabel | null;
  markers: boolean;
  /** The block's height in device pixels. */
  height: number;
}

/** The last layout for each scene, reused while the zoom and the party token stay put, such as during a pan. */
const layouts = new WeakMap<Scene, { key: string; labels: PlacedLabel[] }>();

/**
 * Lays every label out: its text fitted to its best spot, then a place for the block that keeps clear of the
 * party token, doors, passages, symbols, and the labels placed before it. The party's own area goes first.
 */
function layoutLabels(
  ctx: Ctx2D,
  view: FrameView,
  scene: Scene,
  theme: MapTheme,
  showMarkers: boolean,
  avoid: Point | null,
): PlacedLabel[] {
  const { zoom, dpr, scale } = view;
  const key = [
    zoom.toFixed(3),
    dpr,
    theme.name,
    showMarkers,
    avoid ? `${avoid.x.toFixed(2)},${avoid.y.toFixed(2)}` : '-',
  ].join('|');
  const cached = layouts.get(scene);
  if (cached?.key === key) return cached.labels;

  const numberPx = Math.round(Math.min(26, Math.max(11, zoom * 0.44)) * dpr);
  const namePx = Math.round(Math.min(15, Math.max(10, zoom * 0.24)) * dpr);
  const showNames = zoom >= 26;
  // The token, as drawParty draws it, with its facing pointer and a little room, in cells.
  const tokenR = avoid ? (Math.min(26 * dpr, Math.max(8.5 * dpr, scale * 0.31)) * 1.35 + 3 * dpr) / scale : 0;
  const fixed = avoid
    ? [{ x0: avoid.x - tokenR, y0: avoid.y - tokenR, x1: avoid.x + tokenR, y1: avoid.y + tokenR }]
    : [];
  const partyCell = avoid ? { x: Math.floor(avoid.x), y: Math.floor(avoid.y) } : null;
  const inParty = (area: MapArea) =>
    partyCell !== null && area.cells.some(([x, y]) => x === partyCell.x && y === partyCell.y);
  const areas = [...scene.map.areas].sort((a, b) => Number(inParty(b)) - Number(inParty(a)));

  const requests: LabelRequest[] = [];
  const pending = new Map<string, Omit<PlacedLabel, 'x' | 'y'>>();
  for (const area of areas) {
    const numbered = area.label !== '';
    if (!numbered && (zoom < PLAYER_NAME_ZOOM || !area.name)) continue;
    const spots = scene.labelSpots.get(area.id) ?? [];
    const best = spots[0] ?? { x: area.anchor.x, y: area.anchor.y, width: 1, inside: 1, twoLines: false };
    const weight = numbered ? 600 : 650;
    const name =
      area.name && (!numbered || showNames)
        ? fitAreaName(ctx, view, theme, area, best, namePx, weight)
        : null;
    let width = numbered ? numberPx : 0;
    if (name) {
      ctx.font = labelFont(theme, name.px, weight);
      for (const line of name.lines) width = Math.max(width, ctx.measureText(line).width);
    }
    const markers =
      numbered && showMarkers && zoom >= 15 && (area.encounter || area.treasure || area.trap) !== null;
    const height =
      (numbered ? numberPx : 0) +
      (name ? name.lines.length * name.px * 1.12 : 0) +
      (markers ? 20 * dpr : 0) +
      2 * dpr;
    const w = (width + 6 * dpr) / scale;
    const h = height / scale;
    const candidates = [
      ...(spots.length > 0 ? spots : [best]).map((spot) => ({ x: spot.x, y: spot.y })),
      { x: best.x, y: best.y - 1 },
      { x: best.x, y: best.y + 1 },
    ];
    if (avoid) {
      candidates.push({ x: best.x, y: avoid.y - tokenR - h / 2 - 0.05 });
      candidates.push({ x: best.x, y: avoid.y + tokenR + h / 2 + 0.05 });
    }
    candidates.push({ x: best.x, y: area.bounds.minY - h / 2 - 0.08 });
    candidates.push({ x: best.x, y: area.bounds.maxY + h / 2 + 0.08 });
    requests.push({ id: area.id, width: w, height: h, candidates });
    pending.set(area.id, { area, numbered, numberPx, name, markers, height });
  }
  const placed = placeLabels(requests, (r) => scene.labelObstacles.near(r), fixed);
  const labels: PlacedLabel[] = [];
  for (const [id, at] of placed) {
    const meta = pending.get(id);
    if (meta) labels.push({ ...meta, x: at.x, y: at.y });
  }
  layouts.set(scene, { key, labels });
  return labels;
}

/** The zoom, in CSS pixels per cell, from which a player map names its areas. */
const PLAYER_NAME_ZOOM = 16;

/**
 * An area's name fitted to its label spot: whole on one line if it fits, then on two lines, then smaller, and cut
 * with an ellipsis only when nothing else fits.
 */
function fitAreaName(
  ctx: Ctx2D,
  view: FrameView,
  theme: MapTheme,
  area: MapArea,
  spot: LabelSpot,
  px: number,
  weight: number,
): FittedLabel {
  const measure = (text: string, size: number) => {
    ctx.font = labelFont(theme, size, weight);
    return ctx.measureText(text).width;
  };
  // Inside the area's walls at the full size, on one line or two, reads best. Past the walls comes next, and
  // a smaller size and an ellipsis come last.
  // Two lines need the rows above and below, unless they fit inside the label's own row.
  const twoLines = spot.twoLines || px * 1.12 * 2 <= view.scale * 0.92;
  const inside = Math.max(view.scale * spot.inside - 6 * view.dpr, 24 * view.dpr);
  const within = fitLabel(area.name, inside, measure, { px, minPx: Math.round(px * 0.8) }, twoLines);
  if (!within.lines.some((line) => line.endsWith('…'))) return within;
  const maxWidth = Math.max(view.scale * spot.width - 6 * view.dpr, 24 * view.dpr);
  return fitLabel(area.name, maxWidth, measure, { px, minPx: Math.round(9 * view.dpr) }, twoLines);
}

function drawAreaMarkers(
  ctx: Ctx2D,
  area: MapArea,
  cx: number,
  cy: number,
  dpr: number,
  theme: MapTheme,
): void {
  const marks: { kind: 'encounter' | 'treasure' | 'trap'; done: boolean; state?: string }[] = [];
  if (area.encounter) marks.push({ kind: 'encounter', done: area.encounter.resolved });
  if (area.treasure) marks.push({ kind: 'treasure', done: area.treasure.rolled });
  else if (area.encounter?.hoard) marks.push({ kind: 'treasure', done: area.encounter.resolved });
  if (area.trap) marks.push({ kind: 'trap', done: area.trap.state === 'sprung', state: area.trap.state });
  if (marks.length === 0) return;
  const r = 8 * dpr;
  const gap = 3 * dpr;
  let x = cx - ((marks.length - 1) * (r * 2 + gap)) / 2;
  ctx.save();
  ctx.globalAlpha = 1;
  for (const mark of marks) {
    const color = mark.done ? theme.marker.done : theme.marker[mark.kind];
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = theme.ui.panel;
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (mark.kind === 'encounter') {
      // Crossed blades.
      ctx.lineWidth = 1.6 * dpr;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, cy - r * 0.5);
      ctx.lineTo(x + r * 0.5, cy + r * 0.5);
      ctx.moveTo(x + r * 0.5, cy - r * 0.5);
      ctx.lineTo(x - r * 0.5, cy + r * 0.5);
      ctx.moveTo(x - r * 0.55, cy + r * 0.2);
      ctx.lineTo(x - r * 0.2, cy + r * 0.55);
      ctx.moveTo(x + r * 0.55, cy + r * 0.2);
      ctx.lineTo(x + r * 0.2, cy + r * 0.55);
      ctx.stroke();
    } else if (mark.kind === 'treasure') {
      // A stack of coins.
      for (const dy of [0.32, 0.02, -0.28]) {
        ctx.beginPath();
        ctx.ellipse(x, cy + r * dy, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(x, cy - r * 0.55);
      ctx.lineTo(x + r * 0.55, cy + r * 0.42);
      ctx.lineTo(x - r * 0.55, cy + r * 0.42);
      ctx.closePath();
      if (mark.state === 'hidden') {
        ctx.lineWidth = 1.4 * dpr;
        ctx.stroke();
      } else ctx.fill();
    }
    if (mark.done) {
      ctx.beginPath();
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeStyle = theme.marker.done;
      ctx.moveTo(x - r * 0.95, cy + r * 0.95);
      ctx.lineTo(x + r * 0.95, cy - r * 0.95);
      ctx.stroke();
    }
    x += r * 2 + gap;
  }
  ctx.restore();
}

/** A smooth pseudo-random flicker in about -1 to 1. */
export function flicker(t: number): number {
  return (
    Math.sin(t * 0.0071) * 0.45 +
    Math.sin(t * 0.0173 + 1.3) * 0.3 +
    Math.sin(t * 0.0411 + 2.1) * 0.15 +
    Math.sin(t * 0.093) * 0.1
  );
}

export function drawLight(
  ctx: Ctx2D,
  view: FrameView,
  theme: MapTheme,
  pose: PartyPose | null,
  light: { radiusFeet: number } | null,
  referee: boolean,
  now: number,
  animate: boolean,
): void {
  const darkness = referee ? theme.light.refereeDarkness : theme.light.darkness;
  if (theme.light.style === 'darkness' && darkness > 0) {
    ctx.save();
    if (!pose || !light) {
      ctx.fillStyle = rgba('#000000', darkness * (pose ? 0.82 : 0.6));
      ctx.fillRect(0, 0, view.width, view.height);
      if (pose) {
        const c = view.toDevice(pose.x, pose.y);
        const r = view.scale * 1.4;
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
        g.addColorStop(0, rgba(theme.light.color, 0.08));
        g.addColorStop(1, rgba(theme.light.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
      }
      ctx.restore();
      return;
    }
    const f = animate && theme.light.flicker ? flicker(now) : 0;
    const c = view.toDevice(pose.x, pose.y);
    const reach = (lightRadiusCells(light) + 0.5) * view.scale * (1 + f * 0.025);
    const inner = reach * 0.42;
    const outer = reach * 1.28;
    const g = ctx.createRadialGradient(c.x, c.y, inner, c.x, c.y, outer);
    g.addColorStop(0, rgba('#000000', 0));
    g.addColorStop(0.55, rgba('#000000', darkness * 0.45));
    g.addColorStop(1, rgba('#000000', darkness));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.width, view.height);
    // Warm light on the stone near the party.
    ctx.globalCompositeOperation = 'soft-light';
    const warm = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, reach * 1.1);
    warm.addColorStop(0, rgba(theme.light.color, theme.light.glowAlpha * (1 + f * 0.12) * 2));
    warm.addColorStop(1, rgba(theme.light.color, 0));
    ctx.fillStyle = warm;
    ctx.fillRect(c.x - reach * 1.1, c.y - reach * 1.1, reach * 2.2, reach * 2.2);
    ctx.globalCompositeOperation = 'lighter';
    const core = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, reach * 0.8);
    core.addColorStop(0, rgba(theme.light.color, 0.09 * (1 + f * 0.25)));
    core.addColorStop(1, rgba(theme.light.color, 0));
    ctx.fillStyle = core;
    ctx.fillRect(c.x - reach, c.y - reach, reach * 2, reach * 2);
    ctx.restore();
    return;
  }
  if (!pose || !light) return;
  // Ring style: a soft warm glow and a dashed ring at the light's reach.
  const c = view.toDevice(pose.x, pose.y);
  const reach = (lightRadiusCells(light) + 0.5) * view.scale;
  ctx.save();
  const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, reach);
  glow.addColorStop(0, rgba(theme.light.color, theme.light.glowAlpha));
  glow.addColorStop(0.7, rgba(theme.light.color, theme.light.glowAlpha * 0.45));
  glow.addColorStop(1, rgba(theme.light.color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(c.x - reach, c.y - reach, reach * 2, reach * 2);
  if (view.zoom >= 10) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, reach, 0, Math.PI * 2);
    ctx.setLineDash([6 * view.dpr, 5 * view.dpr]);
    ctx.lineWidth = 1.5 * view.dpr;
    ctx.strokeStyle = theme.light.ring;
    ctx.globalAlpha = 0.8;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawParty(ctx: Ctx2D, view: FrameView, pose: PartyPose, theme: MapTheme): void {
  const c = view.toDevice(pose.x, pose.y);
  const { dpr } = view;
  const r = Math.min(26 * dpr, Math.max(8.5 * dpr, view.scale * 0.31));
  ctx.save();
  ctx.globalAlpha = pose.alpha;
  ctx.translate(c.x, c.y);
  // Shadow and halo.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.6;
  ctx.shadowOffsetY = r * 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = theme.party.fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = Math.max(1.5 * dpr, r * 0.16);
  ctx.strokeStyle = theme.party.stroke;
  ctx.stroke();
  // The facing: a pointer beyond the rim and a chevron inside.
  ctx.rotate(pose.angle);
  ctx.beginPath();
  ctx.moveTo(r * 1.62, 0);
  ctx.lineTo(r * 1.04, -r * 0.46);
  ctx.lineTo(r * 1.04, r * 0.46);
  ctx.closePath();
  ctx.fillStyle = theme.party.fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2 * dpr, r * 0.1);
  ctx.strokeStyle = theme.party.stroke;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = theme.party.facing;
  ctx.fill();
  ctx.restore();
}

export function drawHover(
  ctx: Ctx2D,
  view: FrameView,
  target: MapTarget,
  scene: Scene,
  theme: MapTheme,
  pose: PartyPose | null,
  showMoveHint: boolean,
): void {
  const { dpr, scale } = view;
  ctx.save();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = theme.hover.stroke;
  ctx.fillStyle = theme.hover.fill;
  const cellRect = (x: number, y: number) => {
    const a = view.toDevice(x, y);
    ctx.beginPath();
    ctx.rect(a.x + dpr, a.y + dpr, scale - 2 * dpr, scale - 2 * dpr);
    ctx.fill();
    ctx.stroke();
  };
  switch (target.kind) {
    case 'cell': {
      cellRect(target.x, target.y);
      if (showMoveHint && target.direction && pose) {
        // A chevron toward the neighbour the party would step into.
        const c = view.toDevice(target.x + 0.5, target.y + 0.5);
        ctx.translate(c.x, c.y);
        ctx.rotate(FACING_ANGLE[target.direction]);
        const s = Math.min(scale * 0.22, 16 * dpr);
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, -s);
        ctx.lineTo(s * 0.5, 0);
        ctx.lineTo(-s * 0.5, s);
        ctx.lineWidth = Math.max(2 * dpr, s * 0.3);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      break;
    }
    case 'edge': {
      const e = target.edge;
      const a = view.toDevice(e.x, e.y);
      const b = e.side === 'north' ? view.toDevice(e.x + 1, e.y) : view.toDevice(e.x, e.y + 1);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(8 * dpr, scale * 0.22);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.5 * dpr;
      ctx.stroke();
      break;
    }
    case 'feature': {
      const slot = featureSlots(scene, target.feature.x, target.feature.y).find(
        (s) => s.feature.id === target.feature.id,
      );
      if (slot) {
        const c = view.toDevice(slot.cx, slot.cy);
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(10 * dpr, slot.r * scale * 1.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'transition':
      cellRect(target.transition.x, target.transition.y);
      break;
    case 'party': {
      if (pose) {
        const c = view.toDevice(pose.x, pose.y);
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.min(34 * dpr, Math.max(13 * dpr, scale * 0.44)), 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case 'pin':
      break;
  }
  ctx.restore();
}

/**
 * The keyboard cursor: a bold square with a contrasting inner line, so it reads on every theme and stays distinct
 * from the hover highlight. In the pick-an-edge tool, a thick bar marks the chosen side.
 */
export function drawKeyboardCursor(
  ctx: Ctx2D,
  view: FrameView,
  cursor: { x: number; y: number; side: Direction },
  edge: boolean,
  theme: MapTheme,
): void {
  const { dpr, scale } = view;
  const a = view.toDevice(cursor.x, cursor.y);
  const inset = 1.5 * dpr;
  const contrast = theme.tone === 'dark' ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.95)';
  ctx.save();
  ctx.fillStyle = theme.hover.fill;
  ctx.fillRect(a.x, a.y, scale, scale);
  ctx.lineJoin = 'miter';
  ctx.lineWidth = 4 * dpr;
  ctx.strokeStyle = contrast;
  ctx.strokeRect(a.x + inset, a.y + inset, scale - inset * 2, scale - inset * 2);
  ctx.lineWidth = 2.5 * dpr;
  ctx.strokeStyle = theme.hover.stroke;
  if (edge) ctx.setLineDash([5 * dpr, 4 * dpr]);
  ctx.strokeRect(a.x + inset, a.y + inset, scale - inset * 2, scale - inset * 2);
  ctx.setLineDash([]);
  if (edge) {
    const ends: Record<Direction, [number, number, number, number]> = {
      north: [0, 0, 1, 0],
      south: [0, 1, 1, 1],
      west: [0, 0, 0, 1],
      east: [1, 0, 1, 1],
    };
    const [x1, y1, x2, y2] = ends[cursor.side];
    const p1 = view.toDevice(cursor.x + x1, cursor.y + y1);
    const p2 = view.toDevice(cursor.x + x2, cursor.y + y2);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineWidth = Math.max(9 * dpr, scale * 0.2);
    ctx.strokeStyle = contrast;
    ctx.stroke();
    ctx.lineWidth = Math.max(5 * dpr, scale * 0.12);
    ctx.strokeStyle = theme.hover.stroke;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws strokes, each over a thin outline in the theme's casing color, so every user color reads on every floor
 * and rock. The outlines go down first, so one stroke's outline never cuts across another stroke.
 */
export function drawStrokes(
  ctx: Ctx2D,
  view: FrameView,
  strokes: readonly MapStroke[],
  hidden: ReadonlySet<string>,
  casing: string | null = null,
): void {
  const paths: { path: Path2D; width: number; color: string }[] = [];
  for (const stroke of strokes) {
    if (hidden.has(stroke.id) || stroke.points.length === 0) continue;
    const first = stroke.points[0];
    if (!first) continue;
    const path = new Path2D();
    const p0 = view.toDevice(first[0], first[1]);
    path.moveTo(p0.x, p0.y);
    if (stroke.points.length === 1) path.lineTo(p0.x + 0.01, p0.y);
    for (let i = 1; i < stroke.points.length; i++) {
      const pt = stroke.points[i];
      if (!pt) continue;
      const p = view.toDevice(pt[0], pt[1]);
      path.lineTo(p.x, p.y);
    }
    paths.push({ path, width: Math.max(1.5 * view.dpr, stroke.width * view.scale), color: stroke.color });
  }
  if (paths.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (casing) {
    ctx.strokeStyle = casing;
    ctx.globalAlpha = 0.9;
    for (const { path, width } of paths) {
      ctx.lineWidth = width + CASING_PX * 2 * view.dpr;
      ctx.stroke(path);
    }
    ctx.globalAlpha = 1;
  }
  for (const { path, width, color } of paths) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke(path);
  }
  ctx.restore();
}

/** How far the casing reaches past a user-colored mark on each side, in CSS pixels. */
const CASING_PX = 1.4;

export function drawPins(
  ctx: Ctx2D,
  view: FrameView,
  pins: readonly MapPin[],
  theme: MapTheme,
  hoverId: string | null,
): void {
  const { dpr } = view;
  ctx.save();
  for (const pin of pins) {
    const p = view.toDevice(pin.x, pin.y);
    if (p.x < -40 * dpr || p.y < -60 * dpr || p.x > view.width + 40 * dpr || p.y > view.height + 40 * dpr)
      continue;
    const color = pin.color ?? (pin.refereeOnly ? theme.ui.text : theme.marker.encounter);
    const r = (hoverId === pin.id ? 12.5 : 11) * dpr;
    const cy = p.y - 14 * dpr;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - r * 0.62, cy + r * 0.62);
    ctx.arc(p.x, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 5 * dpr;
    ctx.shadowOffsetY = 1.5 * dpr;
    ctx.fillStyle = pin.refereeOnly ? theme.ui.panel : color;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    // The theme's casing outside a light rim, so a pin in any user color stands out from the floor and the rock.
    ctx.lineWidth = (1.6 + CASING_PX * 2) * dpr;
    ctx.strokeStyle = casingColor(theme);
    ctx.stroke();
    ctx.lineWidth = 1.6 * dpr;
    ctx.strokeStyle = pin.refereeOnly ? color : rgba('#ffffff', 0.9);
    if (pin.refereeOnly) ctx.setLineDash([3 * dpr, 2.2 * dpr]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `700 ${Math.round((pin.label.length > 2 ? 9 : 11) * dpr)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pin.refereeOnly ? color : readableOn(color);
    ctx.fillText(pin.label, p.x, cy + 0.5 * dpr);
  }
  ctx.restore();
}

export function drawRuler(ctx: Ctx2D, view: FrameView, m: Measurement, theme: MapTheme): void {
  const { dpr, scale } = view;
  const a = view.toDevice(m.from.x + 0.5, m.from.y + 0.5);
  const b = view.toDevice(m.to.x + 0.5, m.to.y + 0.5);
  const color = theme.hover.stroke;
  ctx.save();
  // The cells at each end.
  for (const cell of [m.from, m.to]) {
    const c = view.toDevice(cell.x, cell.y);
    ctx.beginPath();
    ctx.rect(c.x, c.y, scale, scale);
    ctx.fillStyle = theme.hover.fill;
    ctx.fill();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (m.metric === 'grid') {
    // The walking path: along x, then along y.
    const corner = view.toDevice(m.to.x + 0.5, m.from.y + 0.5);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(corner.x, corner.y);
    ctx.lineTo(b.x, b.y);
  } else {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.lineWidth = (2.2 + CASING_PX * 2) * dpr;
  ctx.strokeStyle = casingColor(theme);
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.setLineDash([8 * dpr, 5 * dpr]);
  ctx.lineWidth = 2.2 * dpr;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of [a, b]) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = CASING_PX * dpr;
    ctx.strokeStyle = casingColor(theme);
    ctx.stroke();
  }
  const text = measurementLabel(m);
  ctx.font = `700 ${13 * dpr}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const w = ctx.measureText(text).width + 16 * dpr;
  const h = 24 * dpr;
  const lx = b.x + 14 * dpr;
  const ly = b.y - 18 * dpr;
  roundRect(ctx, lx, ly - h / 2, w, h, 6 * dpr);
  ctx.fillStyle = theme.ui.panel;
  ctx.fill();
  ctx.lineWidth = 1.5 * dpr;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = theme.ui.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, lx + 8 * dpr, ly + 0.5 * dpr);
  ctx.restore();
}

export const PING_MS = 2600;

/** Draws one ping `age` milliseconds after it appeared. */
export function drawPing(
  ctx: Ctx2D,
  view: FrameView,
  ping: { x: number; y: number; color: string; label?: string },
  age: number,
  theme: MapTheme,
): void {
  if (age < 0 || age > PING_MS) return;
  const { dpr } = view;
  const c = view.toDevice(ping.x, ping.y);
  const t = age / PING_MS;
  const fade = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
  ctx.save();
  for (let k = 0; k < 3; k++) {
    const phase = ((age - k * 320) % 1100) / 1100;
    if (age - k * 320 < 0 || phase < 0) continue;
    const r = (6 + phase * 38) * dpr;
    const alpha = (1 - phase) * 0.9 * fade;
    const width = (3.2 - phase * 2.2) * dpr;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    // Each ring sits on a thin ring of the theme's casing, so every user color reads on blueprint's blue too.
    ctx.lineWidth = width + CASING_PX * 2 * dpr;
    ctx.strokeStyle = rgba(casingColor(theme), alpha * 0.8);
    ctx.stroke();
    ctx.lineWidth = width;
    ctx.strokeStyle = rgba(ping.color, alpha);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(c.x, c.y, 5.5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = rgba(ping.color, fade);
  ctx.fill();
  ctx.lineWidth = (2 + CASING_PX * 2) * dpr;
  ctx.strokeStyle = rgba(casingColor(theme), 0.9 * fade);
  ctx.stroke();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = rgba('#ffffff', 0.9 * fade);
  ctx.stroke();
  if (ping.label) {
    ctx.globalAlpha = fade;
    namePill(ctx, ping.label, c.x + 12 * dpr, c.y - 14 * dpr, ping.color, dpr, theme);
  }
  ctx.restore();
}

export function drawPointer(ctx: Ctx2D, view: FrameView, pointer: MapPointer, theme: MapTheme): void {
  const { dpr } = view;
  const c = view.toDevice(pointer.x, pointer.y);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17 * dpr);
  ctx.lineTo(4.6 * dpr, 12.6 * dpr);
  ctx.lineTo(8 * dpr, 19.5 * dpr);
  ctx.lineTo(10.6 * dpr, 18.2 * dpr);
  ctx.lineTo(7.3 * dpr, 11.4 * dpr);
  ctx.lineTo(13 * dpr, 11.4 * dpr);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3 * dpr;
  ctx.fillStyle = pointer.color;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineJoin = 'round';
  ctx.lineWidth = (1.3 + CASING_PX * 2) * dpr;
  ctx.strokeStyle = casingColor(theme);
  ctx.stroke();
  ctx.lineWidth = 1.3 * dpr;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  if (pointer.label) namePill(ctx, pointer.label, 12 * dpr, 24 * dpr, pointer.color, dpr, theme);
  ctx.restore();
}

/** A tileable grain texture, made once per color. */
export function makeGrain(color: string): CanvasImageSource | null {
  const surface = createCanvas(192, 192);
  if (!surface) return null;
  const { ctx } = surface;
  const image = ctx.createImageData(192, 192);
  const c = parseColor(color);
  const random = mulberry32(1981);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = random();
    // Mostly faint, with a few darker fibres.
    const a = n < 0.92 ? n * 0.5 : 0.65 + (n - 0.92) * 4;
    image.data[i] = c.r;
    image.data[i + 1] = c.g;
    image.data[i + 2] = c.b;
    image.data[i + 3] = Math.round(Math.min(1, a) * 255);
  }
  ctx.putImageData(image, 0, 0);
  return surface.canvas;
}

export function drawFinish(
  ctx: Ctx2D,
  view: FrameView,
  theme: MapTheme,
  grain: CanvasPattern | null,
  origin: { x: number; y: number },
): void {
  ctx.save();
  if (grain && theme.finish.grain > 0) {
    // Anchor the grain to the world, so the paper moves with the map instead of swimming over it.
    if (typeof DOMMatrix !== 'undefined') {
      grain.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(origin.x) % 192, Math.round(origin.y) % 192]));
    }
    ctx.globalAlpha = theme.finish.grain;
    ctx.globalCompositeOperation = theme.tone === 'dark' ? 'overlay' : 'multiply';
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, view.width, view.height);
  }
  if (theme.finish.vignette > 0) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const cx = view.width / 2;
    const cy = view.height / 2;
    const r = Math.hypot(cx, cy);
    const g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    g.addColorStop(0, rgba(theme.finish.vignetteColor, 0));
    g.addColorStop(1, rgba(theme.finish.vignetteColor, theme.finish.vignette));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.width, view.height);
  }
  ctx.restore();
}
