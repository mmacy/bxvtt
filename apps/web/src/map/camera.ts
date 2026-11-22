/**
 * The camera and the transforms between screen, world, and cell space. Every function here is
 * pure, so the renderer and the tests share one definition.
 *
 * - Screen space is CSS pixels from the top-left corner of the map element.
 * - World space is cells: `(0, 0)` is the north-west corner of cell `(0, 0)`.
 * - Cell space is integer cell coordinates.
 */
import type { Bounds } from './model';
import type { Point } from './geometry';

export interface Camera {
  /** The world point at the centre of the viewport. */
  x: number;
  y: number;
  /** CSS pixels per cell. */
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

export const DEFAULT_ZOOM_LIMITS: ZoomLimits = { min: 6, max: 160 };

export function clampZoom(zoom: number, limits: ZoomLimits = DEFAULT_ZOOM_LIMITS): number {
  return Math.min(limits.max, Math.max(limits.min, zoom));
}

export function worldToScreen(camera: Camera, viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (point.y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(camera: Camera, viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (point.y - viewport.height / 2) / camera.zoom + camera.y,
  };
}

/** The cell that contains a world point. */
export function worldToCell(point: Point): { x: number; y: number } {
  return { x: Math.floor(point.x), y: Math.floor(point.y) };
}

export function screenToCell(camera: Camera, viewport: Viewport, point: Point): { x: number; y: number } {
  return worldToCell(screenToWorld(camera, viewport, point));
}

export function cellCenter(x: number, y: number): Point {
  return { x: x + 0.5, y: y + 0.5 };
}

/** Moves the camera so the world follows a drag of `(dx, dy)` screen pixels. */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom };
}

/**
 * Zooms by `factor` and keeps the world point under `anchor` (a screen point) where it is, as a
 * wheel or a pinch should. The zoom is clamped to the limits.
 */
export function zoomAt(
  camera: Camera,
  viewport: Viewport,
  anchor: Point,
  factor: number,
  limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
): Camera {
  return zoomTo(camera, viewport, anchor, camera.zoom * factor, limits);
}

/** Sets the zoom and keeps the world point under `anchor` in place. */
export function zoomTo(
  camera: Camera,
  viewport: Viewport,
  anchor: Point,
  zoom: number,
  limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
): Camera {
  const next = clampZoom(zoom, limits);
  const world = screenToWorld(camera, viewport, anchor);
  return {
    zoom: next,
    x: world.x - (anchor.x - viewport.width / 2) / next,
    y: world.y - (anchor.y - viewport.height / 2) / next,
  };
}

/** The world rectangle the viewport shows. */
export function visibleWorld(camera: Camera, viewport: Viewport): Bounds {
  const halfW = viewport.width / 2 / camera.zoom;
  const halfH = viewport.height / 2 / camera.zoom;
  return { minX: camera.x - halfW, minY: camera.y - halfH, maxX: camera.x + halfW, maxY: camera.y + halfH };
}

/** A camera that shows `bounds` whole, with `padding` screen pixels on every side. */
export function fitBounds(
  bounds: Bounds,
  viewport: Viewport,
  padding = 48,
  limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
): Camera {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const availableW = Math.max(1, viewport.width - padding * 2);
  const availableH = Math.max(1, viewport.height - padding * 2);
  const zoom = clampZoom(Math.min(availableW / w, availableH / h), limits);
  return { x: bounds.minX + w / 2, y: bounds.minY + h / 2, zoom };
}

/**
 * Keeps the camera from drifting so far that the content leaves the screen: at least `margin`
 * screen pixels of `bounds` stay visible on each axis.
 */
export function clampToBounds(camera: Camera, viewport: Viewport, bounds: Bounds, margin = 96): Camera {
  const halfW = viewport.width / 2 / camera.zoom;
  const halfH = viewport.height / 2 / camera.zoom;
  const m = margin / camera.zoom;
  const minX = bounds.minX - halfW + m;
  const maxX = bounds.maxX + halfW - m;
  const minY = bounds.minY - halfH + m;
  const maxY = bounds.maxY + halfH - m;
  return {
    zoom: camera.zoom,
    x: minX > maxX ? (bounds.minX + bounds.maxX) / 2 : Math.min(maxX, Math.max(minX, camera.x)),
    y: minY > maxY ? (bounds.minY + bounds.maxY) / 2 : Math.min(maxY, Math.max(minY, camera.y)),
  };
}

/** Interpolates two cameras, zooming geometrically so the motion feels even. */
export function lerpCamera(from: Camera, to: Camera, t: number): Camera {
  const zoom = from.zoom * Math.pow(to.zoom / from.zoom, t);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, zoom };
}

export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Pan velocity in screen pixels per millisecond. */
export interface Velocity {
  x: number;
  y: number;
}

/**
 * Tracks recent pointer positions during a drag and reports the release velocity, averaged over
 * the last `windowMs` so a jittery final sample doesn't decide the fling.
 */
export class VelocityTracker {
  private samples: { x: number; y: number; t: number }[] = [];

  constructor(private readonly windowMs = 90) {}

  reset(): void {
    this.samples = [];
  }

  add(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t });
    while (this.samples.length > 2 && (this.samples[0]?.t ?? t) < t - this.windowMs) this.samples.shift();
  }

  velocity(now: number): Velocity {
    const recent = this.samples.filter((s) => s.t >= now - this.windowMs);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (!first || !last || last.t - first.t < 8) return { x: 0, y: 0 };
    // A pointer that stopped before it lifted shouldn't fling.
    if (now - last.t > 50) return { x: 0, y: 0 };
    const dt = last.t - first.t;
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
  }
}

/**
 * Advances an inertial pan by `dt` milliseconds with exponential friction. Returns the screen
 * displacement for this step and the slowed velocity. `halfLifeMs` is how long the speed takes to
 * halve.
 */
export function stepInertia(
  velocity: Velocity,
  dt: number,
  halfLifeMs = 140,
): { dx: number; dy: number; velocity: Velocity } {
  const decay = Math.pow(0.5, dt / halfLifeMs);
  // Integral of v * decay^t over the step, so the distance doesn't depend on the frame rate.
  const k = Math.LN2 / halfLifeMs;
  const travelled = (1 - decay) / k;
  return {
    dx: velocity.x * travelled,
    dy: velocity.y * travelled,
    velocity: { x: velocity.x * decay, y: velocity.y * decay },
  };
}

/** The total distance an inertial pan travels before it stops, in screen pixels. */
export function inertiaDistance(velocity: Velocity, halfLifeMs = 140): Point {
  const k = Math.LN2 / halfLifeMs;
  return { x: velocity.x / k, y: velocity.y / k };
}
