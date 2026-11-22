/**
 * A cache of painted tiles. A tile is a square of `TILE` device pixels that covers a world square
 * at one scale. Panning reuses tiles as they are. A zoom draws the tiles it has stretched until the
 * zoom settles, and then paints fresh tiles at the new scale, a few each frame.
 */
import type { Bounds } from '../model';
import type { Scene } from '../scene';
import type { MapTheme } from '../themes';
import { paintStatic } from './paint';
import { createCanvas, type AnyCanvas } from './util';

export const TILE = 512;

export interface Tile {
  canvas: AnyCanvas;
  scale: number;
  i: number;
  j: number;
  world: Bounds;
}

/** The world square tile `(i, j)` covers at `scale` device pixels per cell. */
export function tileWorld(i: number, j: number, scale: number): Bounds {
  const size = TILE / scale;
  return { minX: i * size, minY: j * size, maxX: (i + 1) * size, maxY: (j + 1) * size };
}

/** The tile indices that cover a world rectangle. */
export function tilesCovering(
  rect: Bounds,
  scale: number,
): { i0: number; j0: number; i1: number; j1: number } {
  const size = TILE / scale;
  return {
    i0: Math.floor(rect.minX / size),
    j0: Math.floor(rect.minY / size),
    i1: Math.floor((rect.maxX - 1e-9) / size),
    j1: Math.floor((rect.maxY - 1e-9) / size),
  };
}

export function scaleKey(scale: number): string {
  return scale.toFixed(3);
}

export class TileCache {
  private readonly tiles = new Map<string, Tile>();
  private readonly spare: AnyCanvas[] = [];
  /** The most tiles to keep, about 1 MB each. */
  private readonly capacity: number;
  painted = 0;

  constructor(capacity = 80) {
    this.capacity = capacity;
  }

  get size(): number {
    return this.tiles.size;
  }

  get(scale: number, i: number, j: number): Tile | undefined {
    const key = `${scaleKey(scale)}:${i}:${j}`;
    const tile = this.tiles.get(key);
    if (tile) {
      // Keep the map in least-recently-used order.
      this.tiles.delete(key);
      this.tiles.set(key, tile);
    }
    return tile;
  }

  /** Any cached tile at another scale that overlaps a world rectangle, for a stand-in while zooming. */
  *overlapping(rect: Bounds, except: number): Generator<Tile> {
    const skip = scaleKey(except);
    for (const tile of this.tiles.values()) {
      if (scaleKey(tile.scale) === skip) continue;
      const w = tile.world;
      if (w.maxX <= rect.minX || w.minX >= rect.maxX || w.maxY <= rect.minY || w.minY >= rect.maxY) continue;
      yield tile;
    }
  }

  paint(scene: Scene, theme: MapTheme, scale: number, dpr: number, i: number, j: number): Tile | null {
    const canvas = this.spare.pop();
    let surface: {
      canvas: AnyCanvas;
      ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
    } | null = null;
    if (canvas) {
      const ctx = canvas.getContext('2d') as
        OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
      if (ctx) surface = { canvas, ctx };
    }
    surface ??= createCanvas(TILE, TILE);
    if (!surface) return null;
    const { ctx } = surface;
    const world = tileWorld(i, j, scale);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.setTransform(scale, 0, 0, scale, -world.minX * scale, -world.minY * scale);
    paintStatic({ ctx, scene, theme, scale, dpr, rect: world });
    const tile: Tile = { canvas: surface.canvas, scale, i, j, world };
    this.tiles.set(`${scaleKey(scale)}:${i}:${j}`, tile);
    this.painted += 1;
    this.evict();
    return tile;
  }

  /** Drops every tile that touches a world rectangle, at every scale. */
  invalidate(rect: Bounds): void {
    for (const [key, tile] of this.tiles) {
      const w = tile.world;
      if (w.maxX <= rect.minX || w.minX >= rect.maxX || w.maxY <= rect.minY || w.minY >= rect.maxY) continue;
      this.tiles.delete(key);
      this.recycle(tile.canvas);
    }
  }

  clear(): void {
    for (const tile of this.tiles.values()) this.recycle(tile.canvas);
    this.tiles.clear();
  }

  /** Drops tiles at scales other than `keep`, except the most recent stand-ins. */
  trimScales(keep: number, standIns = 24): void {
    const k = scaleKey(keep);
    const others = [...this.tiles.entries()].filter(([, t]) => scaleKey(t.scale) !== k);
    const excess = others.length - standIns;
    for (let n = 0; n < excess; n++) {
      const entry = others[n];
      if (!entry) continue;
      this.tiles.delete(entry[0]);
      this.recycle(entry[1].canvas);
    }
  }

  private evict(): void {
    while (this.tiles.size > this.capacity) {
      const oldest = this.tiles.keys().next();
      if (oldest.done) break;
      const tile = this.tiles.get(oldest.value);
      this.tiles.delete(oldest.value);
      if (tile) this.recycle(tile.canvas);
    }
  }

  private recycle(canvas: AnyCanvas): void {
    if (this.spare.length < 48) this.spare.push(canvas);
  }
}
