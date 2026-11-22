/** Small helpers for the painter: deterministic noise, color math, and canvas creation. */

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * A deterministic hash of integer coordinates to `[0, 1)`. Everything random on the map comes from
 * it, so a tile draws the same strokes whichever tile draws them, and a redraw never shimmers.
 */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A tiny seeded generator for procedural content in the harness and textures. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses `#rgb`, `#rrggbb`, and `rgb()` or `rgba()` colors. Anything else reads as black. */
export function parseColor(color: string): Rgba {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : hex.slice(0, 6);
    const n = Number.parseInt(full, 16);
    if (Number.isNaN(n)) return { r: 0, g: 0, b: 0, a: 1 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const match = /rgba?\(([^)]+)\)/.exec(c);
  if (match?.[1]) {
    const [r = 0, g = 0, b = 0, a = 1] = match[1].split(',').map((part) => Number.parseFloat(part));
    return { r, g, b, a };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function rgba(color: Rgba | string, alpha?: number): string {
  const c = typeof color === 'string' ? parseColor(color) : color;
  const a = alpha ?? c.a;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${Math.round(a * 1000) / 1000})`;
}

/** Lightens (positive) or darkens (negative) a color by mixing it with white or black. */
export function shade(color: string, amount: number): string {
  const c = parseColor(color);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  return rgba({
    r: c.r + (target - c.r) * t,
    g: c.g + (target - c.g) * t,
    b: c.b + (target - c.b) * t,
    a: c.a,
  });
}

export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return rgba({
    r: x.r + (y.r - x.r) * t,
    g: x.g + (y.g - x.g) * t,
    b: x.b + (y.b - x.b) * t,
    a: x.a + (y.a - x.a) * t,
  });
}

/** Creates a canvas for off-screen drawing, or `null` where the environment has none (tests). */
export function createCanvas(width: number, height: number): { canvas: AnyCanvas; ctx: Ctx2D } | null {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (ctx) return { canvas, ctx };
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = (() => {
    try {
      return canvas.getContext('2d');
    } catch {
      return null;
    }
  })();
  return ctx ? { canvas, ctx } : null;
}

/** Draws text at a world point with a font size in device pixels, whatever the current transform. */
export function textAtWorld(
  ctx: Ctx2D,
  text: string,
  wx: number,
  wy: number,
  font: string,
  fill: string,
  halo?: { color: string; width: number },
): void {
  const m = ctx.getTransform();
  const sx = m.a * wx + m.c * wy + m.e;
  const sy = m.b * wx + m.d * wy + m.f;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = halo.width;
    ctx.strokeStyle = halo.color;
    ctx.strokeText(text, sx, sy);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, sx, sy);
  ctx.restore();
}

/** The relative luminance of a color, from 0 (black) to 1 (white), as WCAG defines it. */
export function luminance(color: string): number {
  const c = parseColor(color);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** The WCAG contrast ratio between two colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
