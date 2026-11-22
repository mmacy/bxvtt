/**
 * `MapRenderer` owns one canvas: it draws the map, runs the camera, and turns pointer, wheel, and
 * keyboard input into camera moves and callbacks. It is a plain class. The React component creates
 * one and hands it props, so React never runs during a pan or an animation.
 *
 * It draws only when something changes, and keeps requesting frames only while something moves.
 */
import {
  DEFAULT_ZOOM_LIMITS,
  clampZoom,
  easeInOutCubic,
  fitBounds,
  lerpCamera,
  panBy,
  screenToWorld,
  stepInertia,
  visibleWorld,
  worldToScreen,
  zoomTo,
  type Camera,
  type Velocity,
  type Viewport,
  type ZoomLimits,
} from '../camera';
import type { Direction, Point } from '../geometry';
import {
  hitTest,
  sameTarget,
  type CellTarget,
  type EdgeTarget,
  type FeatureTarget,
  type HitMode,
  type MapTarget,
  type PartyTarget,
  type PinTarget,
  type TransitionTarget,
} from '../hit';
import {
  cursorCell,
  cursorEdge,
  cycleSide,
  describeCursor,
  isCursorTool,
  measurementText,
  moveCursor,
  startCursor,
  type KeyboardCursor,
} from '../cursor';
import { GestureRecognizer, wheelZoomFactor, type Gesture, type PointerSample } from '../input';
import type { Bounds, LevelMap } from '../model';
import { PartyMotion, type PartyPose } from '../motion';
import {
  measure,
  simplifyStroke,
  strokesHit,
  type MapPin,
  type MapPing,
  type MapPointer,
  type MapStroke,
  type MapTool,
  type Measurement,
  type RulerMetric,
} from '../overlays';
import { Scene, changedCells } from '../scene';
import { blueprint, casingColor, type MapTheme } from '../themes';
import {
  PING_MS,
  drawFinish,
  drawHover,
  drawKeyboardCursor,
  drawLabels,
  drawLight,
  drawParty,
  drawPing,
  drawPins,
  drawPointer,
  drawRuler,
  drawStrokes,
  makeGrain,
  type FrameView,
} from './overlay';
import { lodFor, paintStatic } from './paint';
import { TILE, TileCache, tileWorld, tilesCovering, type Tile } from './tiles';
import { createCanvas, type AnyCanvas } from './util';

/** Where and how a click happened. */
export interface MapPointerInfo {
  /** CSS pixels from the map's top-left corner. */
  screen: Point;
  /** World coordinates, in cells. */
  world: Point;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  pointerType: string;
}

export interface MapCallbacks {
  onCellClick?: (target: CellTarget, info: MapPointerInfo) => void;
  onEdgeClick?: (target: EdgeTarget, info: MapPointerInfo) => void;
  onFeatureClick?: (target: FeatureTarget, info: MapPointerInfo) => void;
  onTransitionClick?: (target: TransitionTarget, info: MapPointerInfo) => void;
  onPartyClick?: (target: PartyTarget, info: MapPointerInfo) => void;
  onPinClick?: (target: PinTarget, info: MapPointerInfo) => void;
  onContextMenu?: (target: MapTarget | null, screen: Point, info: MapPointerInfo) => void;
  onHover?: (target: MapTarget | null) => void;
  onPing?: (point: Point) => void;
  onStrokeComplete?: (stroke: Omit<MapStroke, 'id'>) => void;
  onStrokeErase?: (ids: string[]) => void;
  onPinCreate?: (point: Point) => void;
  onPickCell?: (target: CellTarget) => void;
  onPickEdge?: (target: EdgeTarget) => void;
  onMeasure?: (measurement: Measurement | null) => void;
  onCameraChange?: (camera: Camera) => void;
  onFollowPartyChange?: (follow: boolean) => void;
  onMoveKey?: (direction: Direction, repeat: boolean) => void;
  /** Escape with the keyboard cursor in the pick-a-cell or pick-an-edge tool: the user stopped picking. */
  onPickCancel?: () => void;
  /** The ruler's measurement changed, while it is drawn or moved, or it was cleared (`null`). */
  onMeasureChange?: (measurement: Measurement | null) => void;
  /** The keyboard cursor moved, appeared, or went away (`null`), with the sentence the map announces. */
  onCursorChange?: (target: CellTarget | EdgeTarget | null, text: string) => void;
}

export interface RendererOptions {
  theme: MapTheme;
  tool: MapTool;
  pings: readonly MapPing[];
  strokes: readonly MapStroke[];
  pins: readonly MapPin[];
  pointers: readonly MapPointer[];
  strokeColor: string;
  /** Stroke width in cells. */
  strokeWidth: number;
  rulerMetric: RulerMetric;
  followParty: boolean;
  arrowKeys: 'pan' | 'move';
  reducedMotion: boolean;
  /** Draws area labels and the referee's markers on a referee map. */
  refereeMarkers: boolean;
  /** Draws the names of a player map's areas, which the caller passes as extras. */
  areaLabels: boolean;
  /** Handles W, A, S, and D (pan), C (centre on the party), and F (follow) on the focused map. */
  letterKeys: boolean;
  /** Hides a stroke the eraser touched until the caller passes a new `strokes` list. */
  hideErasedStrokes: boolean;
  zoomLimits: ZoomLimits;
  initialView: 'fit' | 'party';
}

export interface RendererStats {
  /** Frames drawn in the last second. */
  fps: number;
  /** Average time spent drawing a frame over the last second, in milliseconds. */
  frameMs: number;
  /** The slowest frame in the last second, in milliseconds. */
  worstMs: number;
  tilesPainted: number;
  tilesCached: number;
}

/** Hover changes, for the tooltip the component draws in HTML. */
export type HoverListener = (target: MapTarget | null, screen: Point | null) => void;
export type CameraListener = (camera: Camera, viewport: Viewport) => void;

const DEFAULT_OPTIONS: RendererOptions = {
  theme: blueprint,
  tool: 'select',
  pings: [],
  strokes: [],
  pins: [],
  pointers: [],
  strokeColor: '#e76742',
  strokeWidth: 0.09,
  rulerMetric: 'grid',
  followParty: false,
  arrowKeys: 'pan',
  reducedMotion: false,
  refereeMarkers: true,
  areaLabels: true,
  letterKeys: false,
  hideErasedStrokes: true,
  zoomLimits: DEFAULT_ZOOM_LIMITS,
  initialView: 'fit',
};

const NO_STROKES: ReadonlySet<string> = new Set();

const PAN_KEYS: Record<string, Direction> = {
  ArrowUp: 'north',
  ArrowDown: 'south',
  ArrowLeft: 'west',
  ArrowRight: 'east',
  w: 'north',
  s: 'south',
  a: 'west',
  d: 'east',
};

/** The cell offset of a step in each direction. */
const STEP: Record<Direction, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};

type DragMode = 'pan' | 'draw' | 'erase' | 'measure' | null;

interface CameraTween {
  from: Camera;
  to: Camera;
  start: number;
  duration: number;
}

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private opts: RendererOptions = { ...DEFAULT_OPTIONS };
  private callbacks: MapCallbacks = {};
  private map: LevelMap | null = null;
  private scene: Scene | null = null;
  private readonly tiles = new TileCache();
  private overview: { canvas: AnyCanvas; scale: number; bounds: Bounds } | null = null;
  private grain: CanvasPattern | null = null;
  private grainTheme: MapTheme | null = null;

  private camera: Camera = { x: 0, y: 0, zoom: 32 };
  private viewport: Viewport = { width: 0, height: 0 };
  private dpr = 1;
  private placed = false;
  private renderScale: number | null = null;
  private lastZoomAt = 0;
  private tween: CameraTween | null = null;
  private zoomGoal: { zoom: number; anchor: Point } | null = null;
  private inertia: Velocity | null = null;
  private readonly keys = new Set<string>();
  private spaceDown = false;

  private readonly motion = new PartyMotion();
  private readonly gestures = new GestureRecognizer();
  private dragMode: DragMode = null;
  private liveStroke: [number, number][] | null = null;
  private readonly erased = new Set<string>();
  private measurement: Measurement | null = null;
  private measureFrom: Point | null = null;
  /** The cell a measurement started with `startMeasure` runs from, and the cell it reaches now. */
  private measureAnchor: Point | null = null;
  /** The keyboard cursor in the tools that pick a place, while the map has keyboard focus. */
  private kbCursor: KeyboardCursor | null = null;
  private focused = false;
  private announcer: ((text: string) => void) | null = null;
  private measureEnd: Point | null = null;
  private hover: MapTarget | null = null;
  private pointerScreen: Point | null = null;
  private readonly pingSeen = new Map<string, number>();
  private readonly pointerShown = new Map<string, Point>();
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private overviewTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressTap = false;

  private raf = 0;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFrame = 0;
  private readonly frameTimes: { at: number; ms: number }[] = [];
  private hoverListener: HoverListener | null = null;
  private readonly cameraListeners = new Set<CameraListener>();
  private destroyed = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = context2d(canvas);
    this.attach();
  }

  // ------------------------------------------------------------------------------------------
  // Props.

  setOptions(next: Partial<RendererOptions>): void {
    const prev = this.opts;
    this.opts = { ...prev, ...next };
    if (next.theme && next.theme !== prev.theme) {
      this.tiles.clear();
      this.overview = null;
      this.renderScale = null;
      this.scheduleOverview();
    }
    if (next.pings) {
      const now = performance.now();
      const ids = new Set(next.pings.map((p) => p.id));
      for (const ping of next.pings) if (!this.pingSeen.has(ping.id)) this.pingSeen.set(ping.id, now);
      for (const id of this.pingSeen.keys()) if (!ids.has(id)) this.pingSeen.delete(id);
    }
    if (next.strokes) this.erased.clear();
    if (next.followParty === true && !prev.followParty) this.tween = null;
    if (next.tool && next.tool !== prev.tool) {
      this.liveStroke = null;
      if (this.measureAnchor) this.cancelMeasure();
      if (next.tool !== 'ruler') this.setMeasurement(null);
      this.updateHover();
      this.toolChangedForCursor();
    }
    if (next.zoomLimits) this.camera = { ...this.camera, zoom: clampZoom(this.camera.zoom, next.zoomLimits) };
    this.updateCursor();
    this.request();
  }

  setCallbacks(callbacks: MapCallbacks): void {
    this.callbacks = callbacks;
  }

  setHoverListener(listener: HoverListener | null): void {
    this.hoverListener = listener;
  }

  setMap(map: LevelMap | null): void {
    if (map === this.map) return;
    const prevMap = this.map;
    const prevScene = this.scene;
    this.map = map;
    const now = performance.now();
    if (!map) {
      this.scene = null;
      this.tiles.clear();
      this.overview = null;
      this.motion.reset(null);
      this.request();
      return;
    }
    const scene = new Scene(map);
    const sameLevel = prevMap !== null && prevMap.key === map.key && prevMap.layer === map.layer;
    if (!prevScene || !sameLevel) {
      if (this.measureAnchor) this.cancelMeasure();
      this.tiles.clear();
      this.overview = null;
      this.scene = scene;
      this.motion.reset(map.party);
      this.placed = false;
      this.hover = null;
      this.placeCamera();
    } else {
      if (scene.signature !== prevScene.signature) {
        const changed = changedCells(prevScene, scene);
        if (changed) {
          for (const c of changed)
            this.tiles.invalidate({ minX: c.x - 2, minY: c.y - 2, maxX: c.x + 3, maxY: c.y + 3 });
        } else this.tiles.clear();
        this.overview = null;
      }
      this.scene = scene;
      this.motion.push(map.party, now);
    }
    this.updateHover();
    this.scheduleOverview();
    this.request();
  }

  /** Builds the overview stand-in while the browser is idle, so a first zoom never waits for it. */
  private scheduleOverview(): void {
    if (this.overviewTimer !== null) return;
    const run = () => {
      this.overviewTimer = null;
      if (this.scene && !this.destroyed && !this.overview) this.ensureOverview(this.scene);
    };
    this.overviewTimer = setTimeout(() => {
      if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 500 });
      else run();
    }, 120);
  }

  /** Called by the component with the element's CSS size and the device pixel ratio. */
  resize(width: number, height: number, dpr: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (w === this.viewport.width && h === this.viewport.height && dpr === this.dpr) return;
    this.viewport = { width: w, height: h };
    if (dpr !== this.dpr) this.renderScale = null;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (!this.placed) this.placeCamera();
    this.notifyCamera();
    this.request();
  }

  // ------------------------------------------------------------------------------------------
  // Camera API.

  getCamera(): Camera {
    return { ...this.camera };
  }

  getViewport(): Viewport {
    return { ...this.viewport };
  }

  /** The world rectangle on screen. */
  visibleBounds(): Bounds {
    return visibleWorld(this.camera, this.viewport);
  }

  setCamera(camera: Camera, animate = false): void {
    const target = { ...camera, zoom: clampZoom(camera.zoom, this.opts.zoomLimits) };
    this.stopMotion();
    if (animate && !this.opts.reducedMotion) {
      this.tween = { from: { ...this.camera }, to: target, start: performance.now(), duration: 420 };
    } else {
      this.camera = target;
      this.notifyCamera();
    }
    this.request();
  }

  zoomBy(factor: number, anchor?: Point): void {
    const at = anchor ?? this.followAnchor() ?? { x: this.viewport.width / 2, y: this.viewport.height / 2 };
    const goal = clampZoom((this.zoomGoal?.zoom ?? this.camera.zoom) * factor, this.opts.zoomLimits);
    this.tween = null;
    if (this.opts.reducedMotion) {
      this.camera = zoomTo(this.camera, this.viewport, at, goal, this.opts.zoomLimits);
      this.notifyCamera();
    } else this.zoomGoal = { zoom: goal, anchor: at };
    this.request();
  }

  panTo(world: Point, animate = true): void {
    this.setCamera({ ...this.camera, x: world.x, y: world.y }, animate);
  }

  fitToExplored(animate = true): void {
    const map = this.map;
    if (!map || this.viewport.width < 2) return;
    const bounds = map.knownBounds ?? map.bounds;
    const camera = fitBounds(bounds, this.viewport, 56, {
      min: this.opts.zoomLimits.min,
      max: Math.min(this.opts.zoomLimits.max, 64),
    });
    this.setFollow(false);
    this.setCamera(camera, animate);
  }

  centerOnParty(animate = true): void {
    const pose = this.partyPose(performance.now());
    if (!pose) return;
    this.setCamera({ ...this.camera, x: pose.x, y: pose.y }, animate);
  }

  onCamera(listener: CameraListener): () => void {
    this.cameraListeners.add(listener);
    listener(this.getCamera(), this.getViewport());
    return () => this.cameraListeners.delete(listener);
  }

  get stats(): RendererStats {
    const now = performance.now();
    const recent = this.frameTimes.filter((f) => f.at > now - 1000);
    const total = recent.reduce((sum, f) => sum + f.ms, 0);
    return {
      fps: recent.length,
      frameMs: recent.length ? total / recent.length : 0,
      worstMs: recent.reduce((worst, f) => Math.max(worst, f.ms), 0),
      tilesPainted: this.tiles.painted,
      tilesCached: this.tiles.size,
    };
  }

  /** The current measurement, if the ruler shows one. */
  getMeasurement(): Measurement | null {
    return this.measurement;
  }

  /**
   * Starts a measurement from a cell, in any tool. The ruler runs from that cell to the cell under the pointer,
   * and the arrow keys move its far end. A click or Enter ends it and reports the measurement through
   * `onMeasure`. Escape, a new tool, a new level, or `cancelMeasure` ends it and reports `null`.
   */
  startMeasure(from: Point): void {
    const cell = { x: Math.floor(from.x), y: Math.floor(from.y) };
    this.measureAnchor = cell;
    this.measureEnd = cell;
    this.setMeasurement(measure(cell, cell, this.opts.rulerMetric));
    this.updateCursor();
    this.request();
  }

  /** Ends a measurement that `startMeasure` began, without a result. */
  cancelMeasure(): void {
    if (!this.measureAnchor) return;
    this.measureAnchor = null;
    this.measureEnd = null;
    this.setMeasurement(null);
    this.callbacks.onMeasure?.(null);
    this.updateCursor();
    this.request();
  }

  /** Whether a measurement that `startMeasure` began is running. */
  isMeasuring(): boolean {
    return this.measureAnchor !== null;
  }

  private moveMeasureEnd(cell: Point): void {
    const anchor = this.measureAnchor;
    if (!anchor) return;
    const end = { x: Math.floor(cell.x), y: Math.floor(cell.y) };
    if (this.measureEnd && this.measureEnd.x === end.x && this.measureEnd.y === end.y) return;
    this.measureEnd = end;
    this.setMeasurement(measure(anchor, end, this.opts.rulerMetric));
    this.request();
  }

  private finishMeasure(): void {
    const result = this.measurement;
    this.measureAnchor = null;
    this.measureEnd = null;
    // The ruler tool keeps a finished measurement on screen, as a drag with it does.
    this.setMeasurement(this.opts.tool === 'ruler' ? result : null);
    this.callbacks.onMeasure?.(result);
    this.updateCursor();
    this.request();
  }

  /**
   * Shows strokes the eraser hid again, such as after the server refused an erase. Pass the ids to restore, or
   * nothing to restore every hidden stroke.
   */
  restoreErasedStrokes(ids?: readonly string[]): void {
    if (ids === undefined) this.erased.clear();
    else for (const id of ids) this.erased.delete(id);
    this.request();
  }

  private hiddenStrokes(): ReadonlySet<string> {
    return this.opts.hideErasedStrokes ? this.erased : NO_STROKES;
  }

  /**
   * A PNG (or another type) of the map. `viewport` captures what is on screen, fully painted.
   * `level` paints the whole level at `scale` device pixels per cell, with strokes, pins, and the
   * party, and caps the image at 4096 pixels on a side.
   */
  toDataURL(
    options: { area?: 'viewport' | 'level'; type?: string; quality?: number; scale?: number } = {},
  ): string {
    const type = options.type ?? 'image/png';
    if ((options.area ?? 'viewport') === 'viewport') {
      this.draw(performance.now(), true);
      return this.canvas.toDataURL(type, options.quality);
    }
    const scene = this.scene;
    if (!scene || typeof document === 'undefined') return '';
    const bounds = pad(scene.map.knownBounds ?? scene.map.bounds, 1.5);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const scale = Math.min(options.scale ?? 40, 4096 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);
    paintStatic({ ctx, scene, theme: this.opts.theme, scale, dpr: 1, rect: bounds });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const view: FrameView = {
      zoom: scale,
      dpr: 1,
      scale,
      width: canvas.width,
      height: canvas.height,
      toDevice: (x, y) => ({ x: (x - bounds.minX) * scale, y: (y - bounds.minY) * scale }),
    };
    if (scene.map.layer === 'referee' && this.opts.refereeMarkers)
      drawLabels(ctx, view, scene, this.opts.theme, true);
    else if (scene.map.layer === 'player' && this.opts.areaLabels)
      drawLabels(ctx, view, scene, this.opts.theme, false, this.partyPose(performance.now()));
    drawStrokes(ctx, view, this.opts.strokes, this.hiddenStrokes(), casingColor(this.opts.theme));
    drawPins(ctx, view, this.opts.pins, this.opts.theme, null);
    const pose = this.motion.sample(performance.now());
    if (pose) drawParty(ctx, view, pose, this.opts.theme);
    return canvas.toDataURL(type, options.quality);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    if (this.overviewTimer) clearTimeout(this.overviewTimer);
    for (const off of this.cleanup) off();
    this.cleanup.length = 0;
    this.tiles.clear();
    this.cameraListeners.clear();
  }

  // ------------------------------------------------------------------------------------------
  // Frame loop.

  /** Asks for a frame. A low-rate request (flicker alone) waits about 30 ms first. */
  request(lowRate = false): void {
    if (this.destroyed || this.raf) return;
    if (lowRate) {
      if (this.slowTimer) return;
      this.slowTimer = setTimeout(() => {
        this.slowTimer = null;
        this.request();
      }, 30);
      return;
    }
    if (typeof requestAnimationFrame === 'undefined') return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    const started = performance.now();
    const dt = this.lastFrame ? Math.min(64, Math.max(1, now - this.lastFrame)) : 16;
    this.lastFrame = now;
    const moving = this.stepCamera(now, dt);
    const busy = this.draw(now, false);
    const ms = performance.now() - started;
    this.frameTimes.push({ at: started, ms });
    while (this.frameTimes.length > 0 && (this.frameTimes[0]?.at ?? 0) < started - 1000)
      this.frameTimes.shift();
    if (moving || busy === 'fast') this.request();
    else if (busy === 'slow') this.request(true);
    else this.lastFrame = 0;
  };

  /** Advances camera animations. Returns whether the camera is still moving. */
  private stepCamera(now: number, dt: number): boolean {
    const before = this.camera;
    let moving = false;
    // Keyboard pan.
    let kx = 0;
    let ky = 0;
    for (const key of this.keys) {
      const d = PAN_KEYS[key];
      if (d === 'north') ky += 1;
      if (d === 'south') ky -= 1;
      if (d === 'west') kx += 1;
      if (d === 'east') kx -= 1;
    }
    if (kx !== 0 || ky !== 0) {
      const speed = 0.75 * dt;
      this.camera = panBy(this.camera, kx * speed, ky * speed);
      moving = true;
    }
    if (this.tween) {
      const t = Math.min(1, (now - this.tween.start) / this.tween.duration);
      this.camera = lerpCamera(this.tween.from, this.tween.to, easeInOutCubic(t));
      if (t >= 1) this.tween = null;
      else moving = true;
    }
    if (this.zoomGoal) {
      const k = 1 - Math.exp(-dt / 65);
      const ratio = this.zoomGoal.zoom / this.camera.zoom;
      const next =
        Math.abs(Math.log(ratio)) < 0.002 ? this.zoomGoal.zoom : this.camera.zoom * Math.pow(ratio, k);
      this.camera = zoomTo(this.camera, this.viewport, this.zoomGoal.anchor, next, this.opts.zoomLimits);
      if (next === this.zoomGoal.zoom) this.zoomGoal = null;
      else moving = true;
    }
    if (this.inertia) {
      const step = stepInertia(this.inertia, dt);
      this.camera = panBy(this.camera, step.dx, step.dy);
      this.inertia = Math.hypot(step.velocity.x, step.velocity.y) < 0.015 ? null : step.velocity;
      if (this.inertia) moving = true;
    }
    if (this.opts.followParty && !this.gestures.dragging && !this.tween) {
      const pose = this.partyPose(now);
      if (pose) {
        const k = 1 - Math.exp(-dt / 120);
        const dx = pose.x - this.camera.x;
        const dy = pose.y - this.camera.y;
        if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) {
          this.camera = { ...this.camera, x: this.camera.x + dx * k, y: this.camera.y + dy * k };
          moving = true;
        }
      }
    }
    if (this.camera.zoom !== before.zoom) this.lastZoomAt = now;
    if (this.camera !== before) {
      this.notifyCamera();
      if (this.pointerScreen && !this.gestures.active) this.updateHover();
    }
    return moving;
  }

  private partyPose(now: number): PartyPose | null {
    return this.motion.sample(now);
  }

  /** The device-pixel origin of the world, snapped so tiles at the exact scale land on whole pixels. */
  private frameView(): FrameView {
    const dpr = this.dpr;
    const scale = this.camera.zoom * dpr;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ox = Math.round(width / 2 - this.camera.x * scale);
    const oy = Math.round(height / 2 - this.camera.y * scale);
    return {
      zoom: this.camera.zoom,
      dpr,
      scale,
      width,
      height,
      toDevice: (x, y) => ({ x: x * scale + ox, y: y * scale + oy }),
    };
  }

  /** Draws one frame. Returns `'fast'` or `'slow'` when it needs another frame soon. */
  private draw(now: number, complete: boolean): 'fast' | 'slow' | false {
    const ctx = this.ctx;
    if (!ctx || this.viewport.width < 2) return false;
    const theme = this.opts.theme;
    const view = this.frameView();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = theme.rock.color;
    ctx.fillRect(0, 0, view.width, view.height);
    this.drawRockGrid(ctx, view);
    let busy: 'fast' | 'slow' | false = false;
    const scene = this.scene;
    if (scene) {
      if (this.drawTiles(ctx, view, scene, now, complete)) busy = 'fast';
      busy = this.drawOverlays(ctx, view, scene, now) || busy;
    }
    if (theme !== this.grainTheme) {
      this.grainTheme = theme;
      const image = makeGrain(theme.finish.grainColor);
      this.grain = image ? ctx.createPattern(image, 'repeat') : null;
    }
    drawFinish(ctx, view, theme, this.grain, view.toDevice(0, 0));
    return busy;
  }

  private drawRockGrid(ctx: CanvasRenderingContext2D, view: FrameView): void {
    const grid = this.opts.theme.rock.grid;
    if (!grid || lodFor(view.zoom) === 0) return;
    const world = visibleWorld(this.camera, this.viewport);
    ctx.beginPath();
    for (let x = Math.floor(world.minX); x <= Math.ceil(world.maxX); x++) {
      const p = view.toDevice(x, 0);
      ctx.moveTo(p.x, 0);
      ctx.lineTo(p.x, view.height);
    }
    for (let y = Math.floor(world.minY); y <= Math.ceil(world.maxY); y++) {
      const p = view.toDevice(0, y);
      ctx.moveTo(0, p.y);
      ctx.lineTo(view.width, p.y);
    }
    ctx.lineWidth = Math.max(1, this.dpr * 0.75);
    ctx.strokeStyle = grid;
    ctx.stroke();
  }

  /** Draws the static map from tiles. Returns whether tiles are still missing. */
  private drawTiles(
    ctx: CanvasRenderingContext2D,
    view: FrameView,
    scene: Scene,
    now: number,
    complete: boolean,
  ): boolean {
    const scale = view.scale;
    // Paint at the exact scale once the zoom settles, or at once when the stand-ins would blur.
    if (
      this.renderScale === null ||
      scale / this.renderScale > 1.6 ||
      scale / this.renderScale < 0.55 ||
      complete ||
      (now - this.lastZoomAt > 140 && this.renderScale !== scale)
    ) {
      if (this.renderScale !== scale) this.tiles.trimScales(scale);
      this.renderScale = scale;
    }
    const rs = this.renderScale;
    const content = pad(scene.map.bounds, 3);
    const visible = visibleWorld(this.camera, this.viewport);
    const rect = intersect(content, visible);
    if (!rect) return false;
    const { i0, j0, i1, j1 } = tilesCovering(rect, rs);
    const missing: { i: number; j: number; d: number }[] = [];
    const centerI = (this.camera.x * rs) / TILE;
    const centerJ = (this.camera.y * rs) / TILE;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const tile = this.tiles.get(rs, i, j);
        if (tile) this.blit(ctx, view, tile);
        else {
          this.drawStandIn(ctx, view, scene, tileWorld(i, j, rs), rs);
          missing.push({ i, j, d: Math.hypot(i + 0.5 - centerI, j + 0.5 - centerJ) });
        }
      }
    }
    if (missing.length === 0) {
      this.prefetch(scene, rs, i0, j0, i1, j1);
      return false;
    }
    missing.sort((a, b) => a.d - b.d);
    const budget = complete ? Infinity : 7;
    const start = performance.now();
    let remaining = missing.length;
    for (const m of missing) {
      if (performance.now() - start > budget) break;
      const tile = this.tiles.paint(scene, this.opts.theme, rs, this.dpr, m.i, m.j);
      if (tile) this.blit(ctx, view, tile);
      remaining -= 1;
    }
    return remaining > 0;
  }

  /** Paints one tile just outside the viewport when there is time, so a slow pan never waits. */
  private prefetch(scene: Scene, rs: number, i0: number, j0: number, i1: number, j1: number): void {
    const content = pad(scene.map.bounds, 3);
    const ring = tilesCovering(content, rs);
    for (let j = j0 - 1; j <= j1 + 1; j++) {
      for (let i = i0 - 1; i <= i1 + 1; i++) {
        if (i >= i0 && i <= i1 && j >= j0 && j <= j1) continue;
        if (i < ring.i0 || i > ring.i1 || j < ring.j0 || j > ring.j1) continue;
        if (this.tiles.get(rs, i, j)) continue;
        this.tiles.paint(scene, this.opts.theme, rs, this.dpr, i, j);
        return;
      }
    }
  }

  private blit(ctx: CanvasRenderingContext2D, view: FrameView, tile: Tile): void {
    const a = view.toDevice(tile.world.minX, tile.world.minY);
    const size = (TILE * view.scale) / tile.scale;
    if (Math.abs(size - TILE) < 0.01) ctx.drawImage(tile.canvas, Math.round(a.x), Math.round(a.y));
    else ctx.drawImage(tile.canvas, a.x, a.y, size, size);
  }

  /** While a tile paints: stretched tiles from another scale, or the overview. */
  private drawStandIn(
    ctx: CanvasRenderingContext2D,
    view: FrameView,
    scene: Scene,
    world: Bounds,
    rs: number,
  ): void {
    const a = view.toDevice(world.minX, world.minY);
    const b = view.toDevice(world.maxX, world.maxY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.clip();
    const overview = this.ensureOverview(scene);
    if (overview) {
      const o = view.toDevice(overview.bounds.minX, overview.bounds.minY);
      const k = view.scale / overview.scale;
      ctx.drawImage(overview.canvas, o.x, o.y, overview.canvas.width * k, overview.canvas.height * k);
    }
    for (const tile of this.tiles.overlapping(world, rs)) this.blit(ctx, view, tile);
    ctx.restore();
  }

  private ensureOverview(scene: Scene): { canvas: AnyCanvas; scale: number; bounds: Bounds } | null {
    if (this.overview) return this.overview;
    const bounds = pad(scene.map.bounds, 3);
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const scale = Math.max(2, Math.min(8, 1024 / Math.max(w, h)));
    const surface = createCanvas(w * scale, h * scale);
    if (!surface) return null;
    surface.ctx.setTransform(scale, 0, 0, scale, -bounds.minX * scale, -bounds.minY * scale);
    // Paint at the lowest detail: the overview only shows while a tile paints.
    paintStatic({ ctx: surface.ctx, scene, theme: this.opts.theme, scale, dpr: scale / 8, rect: bounds });
    this.overview = { canvas: surface.canvas, scale, bounds };
    return this.overview;
  }

  private drawOverlays(
    ctx: CanvasRenderingContext2D,
    view: FrameView,
    scene: Scene,
    now: number,
  ): 'fast' | 'slow' | false {
    const theme = this.opts.theme;
    const referee = scene.map.layer === 'referee';
    const pose = this.partyPose(now);
    let busy: 'fast' | 'slow' | false = this.motion.isAnimating(now) ? 'fast' : false;
    const flickers =
      theme.light.flicker && !this.opts.reducedMotion && pose !== null && scene.map.light !== null;
    if (flickers && !busy) busy = 'slow';

    drawLight(ctx, view, theme, pose, scene.map.light, referee, now, !this.opts.reducedMotion);
    if (this.hover && !this.gestures.dragging) {
      drawHover(ctx, view, this.hover, scene, theme, pose, this.opts.tool === 'select');
    }
    if (this.kbCursor) drawKeyboardCursor(ctx, view, this.kbCursor, this.opts.tool === 'pick-edge', theme);
    if (referee && this.opts.refereeMarkers) drawLabels(ctx, view, scene, theme, true, pose);
    else if (!referee && this.opts.areaLabels) drawLabels(ctx, view, scene, theme, false, pose);
    drawStrokes(ctx, view, this.opts.strokes, this.hiddenStrokes(), casingColor(this.opts.theme));
    if (this.liveStroke && this.liveStroke.length > 0) {
      drawStrokes(
        ctx,
        view,
        [{ id: 'live', points: this.liveStroke, color: this.opts.strokeColor, width: this.opts.strokeWidth }],
        new Set(),
        casingColor(theme),
      );
    }
    if (this.measurement) drawRuler(ctx, view, this.measurement, theme);
    drawPins(ctx, view, this.opts.pins, theme, this.hover?.kind === 'pin' ? this.hover.pin.id : null);
    for (const ping of this.opts.pings) {
      const seen = this.pingSeen.get(ping.id) ?? now;
      const age = now - seen;
      if (age <= PING_MS) {
        drawPing(ctx, view, ping, this.opts.reducedMotion ? Math.min(age, 400) : age, theme);
        busy = 'fast';
      }
    }
    if (pose) drawParty(ctx, view, pose, theme);
    for (const pointer of this.opts.pointers) {
      const shown = this.pointerShown.get(pointer.id) ?? { x: pointer.x, y: pointer.y };
      const k = this.opts.reducedMotion ? 1 : 0.35;
      const next = { x: shown.x + (pointer.x - shown.x) * k, y: shown.y + (pointer.y - shown.y) * k };
      this.pointerShown.set(pointer.id, next);
      if (Math.hypot(pointer.x - next.x, pointer.y - next.y) > 0.005) busy = 'fast';
      drawPointer(ctx, view, { ...pointer, ...next }, theme);
    }
    if (this.pointerShown.size > this.opts.pointers.length) {
      const ids = new Set(this.opts.pointers.map((p) => p.id));
      for (const id of this.pointerShown.keys()) if (!ids.has(id)) this.pointerShown.delete(id);
    }
    return busy;
  }

  // ------------------------------------------------------------------------------------------
  // Camera placement and follow.

  private placeCamera(): void {
    const map = this.map;
    if (!map || this.viewport.width < 2 || this.viewport.height < 2) return;
    this.placed = true;
    // A referee wants the whole level. A player sees what the party knows.
    const bounds = map.layer === 'referee' ? map.bounds : (map.knownBounds ?? map.bounds);
    const fit = fitBounds(bounds, this.viewport, 56, {
      min: this.opts.zoomLimits.min,
      max: Math.min(this.opts.zoomLimits.max, 48),
    });
    if (this.opts.initialView === 'party' && map.party) {
      this.camera = { x: map.party.x + 0.5, y: map.party.y + 0.5, zoom: clampZoom(40, this.opts.zoomLimits) };
    } else if (this.opts.followParty && map.party) {
      this.camera = { ...fit, x: map.party.x + 0.5, y: map.party.y + 0.5 };
    } else {
      this.camera = fit;
    }
    this.tween = null;
    this.zoomGoal = null;
    this.inertia = null;
    this.renderScale = null;
    this.notifyCamera();
  }

  private followAnchor(): Point | null {
    if (!this.opts.followParty) return null;
    const pose = this.partyPose(performance.now());
    return pose ? worldToScreen(this.camera, this.viewport, pose) : null;
  }

  private setFollow(follow: boolean): void {
    if (this.opts.followParty === follow) return;
    this.opts = { ...this.opts, followParty: follow };
    this.callbacks.onFollowPartyChange?.(follow);
  }

  private stopMotion(): void {
    this.tween = null;
    this.zoomGoal = null;
    this.inertia = null;
  }

  private notifyCamera(): void {
    const camera = this.getCamera();
    const viewport = this.getViewport();
    for (const listener of this.cameraListeners) listener(camera, viewport);
    this.callbacks.onCameraChange?.(camera);
  }

  // ------------------------------------------------------------------------------------------
  // Input.

  private attach(): void {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: (e: HTMLElementEventMap[K]) => void,
      options?: AddEventListenerOptions,
    ) => {
      c.addEventListener(type, handler as EventListener, options);
      this.cleanup.push(() => c.removeEventListener(type, handler as EventListener, options));
    };
    on('pointerdown', (e) => this.pointerDown(e));
    on('pointermove', (e) => this.pointerMove(e));
    on('pointerup', (e) => this.pointerUp(e));
    on('pointercancel', (e) => this.pointerCancel(e));
    on('lostpointercapture', (e) => this.pointerCancel(e));
    on('pointerleave', () => {
      if (!this.gestures.active) {
        this.pointerScreen = null;
        this.setHover(null);
      }
    });
    on('wheel', (e) => this.wheel(e), { passive: false });
    on('contextmenu', (e) => this.contextMenu(e));
    on('keydown', (e) => this.keyDown(e));
    on('keyup', (e) => this.keyUp(e));
    on('focus', () => {
      this.focused = true;
      // A keyboard user who tabs to the map in a picking tool gets the cursor at once.
      if (isCursorTool(this.opts.tool) && focusVisible(c)) this.showCursor();
    });
    on('blur', () => {
      this.focused = false;
      this.keys.clear();
      this.spaceDown = false;
      this.hideCursor();
      this.updateCursor();
    });
    // The cursor's keys run in the capture phase on the window, before an ancestor's own key handlers, such as a
    // play screen that moves the party with the arrow keys.
    const win = c.ownerDocument.defaultView;
    if (win) {
      const capture = (e: KeyboardEvent) => {
        if (e.target !== c || !this.cursorKeys(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      win.addEventListener('keydown', capture, true);
      this.cleanup.push(() => win.removeEventListener('keydown', capture, true));
    }
    c.style.touchAction = 'none';
    this.updateCursor();
  }

  private local(e: { clientX: number; clientY: number }): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private sample(e: PointerEvent): PointerSample {
    const p = this.local(e);
    return {
      id: e.pointerId,
      x: p.x,
      y: p.y,
      t: e.timeStamp || performance.now(),
      button: e.button,
      pointerType: e.pointerType || 'mouse',
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    };
  }

  private info(p: PointerSample | (Point & Partial<PointerSample>)): MapPointerInfo {
    return {
      screen: { x: p.x, y: p.y },
      world: screenToWorld(this.camera, this.viewport, p),
      altKey: p.altKey ?? false,
      shiftKey: p.shiftKey ?? false,
      ctrlKey: p.ctrlKey ?? false,
      metaKey: p.metaKey ?? false,
      pointerType: p.pointerType ?? 'mouse',
    };
  }

  private pointerDown(e: PointerEvent): void {
    if (e.button === 2) return;
    if (e.button === 0 && e.ctrlKey && navigatorIsMac()) return;
    this.canvas.focus({ preventScroll: true });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for a synthetic event. Input still works without it.
    }
    this.inertia = null;
    this.zoomGoal = null;
    this.tween = null;
    this.suppressTap = false;
    // The user picked up the pointer, so the keyboard cursor steps aside until the next arrow key.
    this.hideCursor();
    const s = this.sample(e);
    this.pointerScreen = { x: s.x, y: s.y };
    // A long press pings, except when holding still is part of the tool, like drawing.
    const drawingTool = this.opts.tool === 'draw' || this.opts.tool === 'erase' || this.opts.tool === 'ruler';
    const longPress = !(drawingTool && s.pointerType === 'mouse') && e.button === 0 && !this.spaceDown;
    this.handle(this.gestures.down(s, longPress));
    this.scheduleLongPress();
    this.updateCursor();
  }

  private pointerMove(e: PointerEvent): void {
    const s = this.sample(e);
    this.pointerScreen = { x: s.x, y: s.y };
    if (this.gestures.active) {
      const events = e.getCoalescedEvents?.() ?? [];
      if (events.length > 1 && this.dragMode === 'draw') {
        for (const ce of events) this.handle(this.gestures.move(this.sample(ce)));
      } else this.handle(this.gestures.move(s));
    } else if (s.pointerType !== 'touch') {
      this.updateHover();
    }
    if (this.measureAnchor && !this.gestures.dragging) {
      this.moveMeasureEnd(screenToWorld(this.camera, this.viewport, s));
    }
  }

  private pointerUp(e: PointerEvent): void {
    const s = this.sample(e);
    this.handle(this.gestures.up(s));
    if (!this.gestures.active) this.clearLongPress();
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    this.updateCursor();
    if (s.pointerType !== 'touch') this.updateHover();
  }

  private pointerCancel(e: PointerEvent): void {
    this.handle(this.gestures.cancel(e.pointerId));
    if (!this.gestures.active) this.clearLongPress();
    this.updateCursor();
  }

  private scheduleLongPress(): void {
    this.clearLongPress();
    const due = this.gestures.longPressDue;
    if (due === null) return;
    this.longPressTimer = setTimeout(
      () => {
        this.longPressTimer = null;
        this.handle(this.gestures.tick(due + 1));
      },
      Math.max(0, due - performance.now()) + 4,
    );
  }

  private clearLongPress(): void {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  private handle(gestures: Gesture[]): void {
    for (const g of gestures) {
      switch (g.type) {
        case 'tap':
          this.clearLongPress();
          if (!this.suppressTap) this.tap(g.pointer, { x: g.x, y: g.y });
          break;
        case 'long-press':
          this.suppressTap = true;
          this.callbacks.onPing?.(screenToWorld(this.camera, this.viewport, g));
          break;
        case 'drag-start':
          this.clearLongPress();
          this.dragStart(g.pointer, { x: g.x, y: g.y });
          break;
        case 'drag':
          this.drag(g);
          break;
        case 'drag-end':
          this.dragEnd(g.velocity);
          break;
        case 'cancel':
          this.liveStroke = null;
          if (this.dragMode === 'measure') this.setMeasurement(null);
          this.dragMode = null;
          this.request();
          break;
        case 'pinch-start':
          this.clearLongPress();
          this.dragMode = null;
          this.liveStroke = null;
          this.setFollow(false);
          this.stopMotion();
          break;
        case 'pinch': {
          let cam = zoomTo(this.camera, this.viewport, g, this.camera.zoom * g.scale, this.opts.zoomLimits);
          cam = panBy(cam, g.dx, g.dy);
          this.camera = cam;
          this.lastZoomAt = performance.now();
          this.notifyCamera();
          this.request();
          break;
        }
        case 'pinch-end':
          break;
      }
    }
  }

  private tap(pointer: PointerSample, at: Point): void {
    const info = this.info({ ...pointer, x: at.x, y: at.y });
    const scene = this.scene;
    const tool = this.opts.tool;
    if (pointer.button === 1) return;
    if (this.measureAnchor) {
      this.moveMeasureEnd(info.world);
      this.finishMeasure();
      return;
    }
    if (pointer.altKey || tool === 'ping') {
      this.callbacks.onPing?.(info.world);
      return;
    }
    if (!scene) return;
    const hit = (mode: HitMode) =>
      hitTest(scene, info.world, {
        zoom: this.camera.zoom,
        mode,
        pins: this.opts.pins,
        partyAt: this.partyPose(performance.now()),
      });
    switch (tool) {
      case 'select': {
        const target = hit('default');
        if (target) this.dispatchClick(target, info);
        break;
      }
      case 'draw':
        this.callbacks.onStrokeComplete?.({
          points: [[info.world.x, info.world.y]],
          color: this.opts.strokeColor,
          width: this.opts.strokeWidth,
        });
        break;
      case 'erase':
        this.eraseAt(info.world);
        if (!this.opts.hideErasedStrokes) this.erased.clear();
        break;
      case 'ruler':
        if (this.measurement) {
          this.setMeasurement(null);
          this.callbacks.onMeasure?.(null);
          this.request();
        }
        break;
      case 'pin': {
        const target = hit('default');
        if (target?.kind === 'pin') this.callbacks.onPinClick?.(target, info);
        else this.callbacks.onPinCreate?.(info.world);
        break;
      }
      case 'pick-cell': {
        const target = hit('cell');
        if (target?.kind === 'cell') this.callbacks.onPickCell?.(target);
        break;
      }
      case 'pick-edge': {
        const target = hit('edge');
        if (target?.kind === 'edge') this.callbacks.onPickEdge?.(target);
        break;
      }
      case 'pan':
        break;
    }
  }

  /** Sends a click to the callback for its kind, or to `onCellClick` when that callback is absent. */
  private dispatchClick(target: MapTarget, info: MapPointerInfo): void {
    const cb = this.callbacks;
    switch (target.kind) {
      case 'cell':
        cb.onCellClick?.(target, info);
        return;
      case 'edge':
        if (cb.onEdgeClick) return cb.onEdgeClick(target, info);
        break;
      case 'feature':
        if (cb.onFeatureClick) return cb.onFeatureClick(target, info);
        break;
      case 'transition':
        if (cb.onTransitionClick) return cb.onTransitionClick(target, info);
        break;
      case 'party':
        if (cb.onPartyClick) return cb.onPartyClick(target, info);
        break;
      case 'pin':
        if (cb.onPinClick) return cb.onPinClick(target, info);
        break;
    }
    const scene = this.scene;
    if (!scene || !cb.onCellClick) return;
    const cell = hitTest(scene, info.world, { zoom: this.camera.zoom, mode: 'cell' });
    if (cell?.kind === 'cell') cb.onCellClick(cell, info);
  }

  private dragStart(pointer: PointerSample, at: Point): void {
    const tool = this.opts.tool;
    const world = screenToWorld(this.camera, this.viewport, at);
    const panTools: MapTool[] = ['select', 'pan', 'ping', 'pin', 'pick-cell', 'pick-edge'];
    if (pointer.button === 1 || this.spaceDown || panTools.includes(tool)) {
      this.dragMode = 'pan';
      this.setFollow(false);
      this.stopMotion();
    } else if (tool === 'draw') {
      this.dragMode = 'draw';
      this.liveStroke = [[world.x, world.y]];
    } else if (tool === 'erase') {
      this.dragMode = 'erase';
      this.eraseAt(world);
    } else if (tool === 'ruler') {
      this.dragMode = 'measure';
      this.measureFrom = world;
      this.setMeasurement(measure(world, world, this.opts.rulerMetric));
    }
    this.updateCursor();
    this.request();
  }

  private drag(g: Extract<Gesture, { type: 'drag' }>): void {
    const world = screenToWorld(this.camera, this.viewport, g);
    switch (this.dragMode) {
      case 'pan':
        this.camera = panBy(this.camera, g.dx, g.dy);
        this.notifyCamera();
        break;
      case 'draw': {
        const stroke = this.liveStroke;
        const last = stroke?.[stroke.length - 1];
        if (stroke && last && Math.hypot(world.x - last[0], world.y - last[1]) * this.camera.zoom >= 1.5) {
          stroke.push([world.x, world.y]);
        }
        break;
      }
      case 'erase':
        this.eraseAt(world);
        break;
      case 'measure':
        if (this.measureFrom) {
          const next = measure(this.measureFrom, world, this.opts.rulerMetric);
          this.setMeasurement(next);
        }
        break;
      default:
        break;
    }
    this.request();
  }

  private dragEnd(velocity: Velocity): void {
    switch (this.dragMode) {
      case 'pan':
        if (!this.opts.reducedMotion && Math.hypot(velocity.x, velocity.y) > 0.08) {
          this.inertia = { x: velocity.x, y: velocity.y };
        }
        break;
      case 'draw': {
        const points = this.liveStroke;
        this.liveStroke = null;
        if (points && points.length > 0) {
          this.callbacks.onStrokeComplete?.({
            points: simplifyStroke(points, 0.6 / this.camera.zoom),
            color: this.opts.strokeColor,
            width: this.opts.strokeWidth,
          });
        }
        break;
      }
      case 'measure':
        this.callbacks.onMeasure?.(this.measurement);
        break;
      case 'erase':
        // The caller controls the strokes, so the next gesture may report the same stroke again.
        if (!this.opts.hideErasedStrokes) this.erased.clear();
        break;
      default:
        break;
    }
    this.dragMode = null;
    this.updateCursor();
    this.request();
  }

  private eraseAt(world: Point): void {
    const radius = 9 / this.camera.zoom;
    const ids = strokesHit(this.opts.strokes, world, radius).filter((id) => !this.erased.has(id));
    if (ids.length === 0) return;
    for (const id of ids) this.erased.add(id);
    this.callbacks.onStrokeErase?.(ids);
    this.request();
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.local(e);
    const factor = wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey);
    this.inertia = null;
    this.zoomBy(factor, this.followAnchor() ?? p);
  }

  private contextMenu(e: MouseEvent): void {
    const handler = this.callbacks.onContextMenu;
    if (!handler) return;
    e.preventDefault();
    const p = this.local(e);
    const info = this.info({
      x: p.x,
      y: p.y,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    });
    const scene = this.scene;
    const target = scene
      ? hitTest(scene, info.world, {
          zoom: this.camera.zoom,
          pins: this.opts.pins,
          partyAt: this.partyPose(performance.now()),
        })
      : null;
    handler(target, p, info);
  }

  /**
   * The keys the focused map handles: the arrow keys (pan, or `onMoveKey` with `arrowKeys="move"`), Shift and the
   * arrows (pan), plus and minus (zoom), zero (fit), Space (pan while held), Escape (when there is a measurement
   * or a stroke to clear), and Enter (to end a measurement from `startMeasure`). With `letterKeys`, it also
   * handles W, A, S, and D (pan), C (centre on the party), and F (follow). Every other key, and every key with
   * Ctrl, Cmd, or Alt, passes through untouched to the app's shortcuts.
   */
  private keyDown(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === ' ') {
      e.preventDefault();
      this.spaceDown = true;
      this.updateCursor();
      return;
    }
    if (this.cursorKeys(e)) {
      e.preventDefault();
      return;
    }
    const arrow = e.key.startsWith('Arrow') ? PAN_KEYS[e.key] : undefined;
    if (arrow && this.opts.arrowKeys === 'move' && !e.shiftKey && this.callbacks.onMoveKey) {
      e.preventDefault();
      this.callbacks.onMoveKey(arrow, e.repeat);
      return;
    }
    const letter = key.length === 1 && key >= 'a' && key <= 'z';
    if (letter && !this.opts.letterKeys) return;
    if (PAN_KEYS[key]) {
      e.preventDefault();
      if (!this.keys.has(key)) {
        this.keys.add(key);
        this.setFollow(false);
        this.stopMotion();
      }
      this.request();
      return;
    }
    switch (key) {
      case '+':
      case '=':
        e.preventDefault();
        this.zoomBy(1.3);
        break;
      case '-':
      case '_':
        e.preventDefault();
        this.zoomBy(1 / 1.3);
        break;
      case '0':
        e.preventDefault();
        this.fitToExplored();
        break;
      case 'c':
        e.preventDefault();
        this.centerOnParty();
        break;
      case 'f':
        e.preventDefault();
        this.setFollow(!this.opts.followParty);
        this.request();
        break;
      case 'Escape':
        if (this.measureAnchor) {
          e.preventDefault();
          this.cancelMeasure();
        } else if (this.measurement || this.liveStroke) {
          e.preventDefault();
          this.setMeasurement(null);
          this.liveStroke = null;
          this.callbacks.onMeasure?.(null);
          this.request();
        }
        break;
      default:
        break;
    }
  }

  /** Whether the keyboard cursor, or a measurement from `startMeasure`, owns the arrow keys now. */
  hasKeyboardCursor(): boolean {
    return this.measureAnchor !== null || (this.focused && isCursorTool(this.opts.tool));
  }

  /** Whether the keyboard cursor drives a running measurement, so its announcement already states the distance. */
  cursorAnnouncesMeasurement(): boolean {
    return this.kbCursor !== null && this.measureAnchor !== null;
  }

  /** Lets the component announce the cursor and the measurement in its live region. */
  setAnnouncer(announcer: ((text: string) => void) | null): void {
    this.announcer = announcer;
  }

  /**
   * Handles a key for the keyboard cursor or a running measurement. Returns whether it used the key: the arrow
   * keys (without Shift) move the cursor or the measurement's far end, E and Shift and E turn the pick-an-edge
   * cursor to the next side, Enter acts, and Escape stops.
   */
  private cursorKeys(e: KeyboardEvent): boolean {
    if (e.metaKey || e.ctrlKey || e.altKey || !this.hasKeyboardCursor()) return false;
    const arrow = e.key.startsWith('Arrow') && !e.shiftKey ? PAN_KEYS[e.key] : undefined;
    const tool = this.opts.tool;
    if (this.measureAnchor && this.measureEnd) {
      if (arrow) {
        const [dx, dy] = STEP[arrow];
        this.moveMeasureEnd({ x: this.measureEnd.x + dx, y: this.measureEnd.y + dy });
        if (this.kbCursor) this.kbCursor = { ...this.kbCursor, x: this.measureEnd.x, y: this.measureEnd.y };
        this.keepInView(this.measureEnd);
        this.announceCursor();
        return true;
      }
      if (e.key === 'Enter') {
        const kept = this.measurement;
        this.finishMeasure();
        if (kept && this.opts.tool === 'ruler') this.announce(`Kept: ${measurementText(kept)}.`);
        else this.announceCursor();
        return true;
      }
      if (e.key === 'Escape') {
        this.cancelMeasure();
        this.announceCursor();
        return true;
      }
      return false;
    }
    if (!isCursorTool(tool)) return false;
    if (arrow) {
      if (!this.kbCursor) this.showCursor();
      else {
        this.kbCursor = moveCursor(this.kbCursor, arrow);
        this.keepInView(this.kbCursor);
        this.announceCursor();
        this.request();
      }
      return true;
    }
    if ((e.key === 'e' || e.key === 'E') && tool === 'pick-edge' && this.kbCursor) {
      this.kbCursor = { ...this.kbCursor, side: cycleSide(this.kbCursor.side, e.shiftKey) };
      this.announceCursor();
      this.request();
      return true;
    }
    if (e.key === 'Enter') {
      if (!this.kbCursor) {
        this.showCursor();
        return true;
      }
      this.actAtCursor(this.kbCursor);
      return true;
    }
    if (e.key === 'Escape' && this.kbCursor) {
      if (tool === 'ruler' && this.measurement) {
        this.setMeasurement(null);
        this.callbacks.onMeasure?.(null);
        this.announceCursor();
        this.request();
        return true;
      }
      this.hideCursor();
      if (tool === 'pick-cell' || tool === 'pick-edge') this.callbacks.onPickCancel?.();
      return true;
    }
    return false;
  }

  /** What Enter does with the cursor in each picking tool. */
  private actAtCursor(cursor: KeyboardCursor): void {
    const scene = this.scene;
    if (!scene) return;
    const centre = { x: cursor.x + 0.5, y: cursor.y + 0.5 };
    switch (this.opts.tool) {
      case 'pick-cell':
        this.callbacks.onPickCell?.(cursorCell(scene, cursor));
        break;
      case 'pick-edge': {
        const target = cursorEdge(scene, cursor);
        if (target) this.callbacks.onPickEdge?.(target);
        else this.announce('The map shows nothing on that side yet. Press E for the next side.');
        break;
      }
      case 'pin':
        this.callbacks.onPinCreate?.(centre);
        break;
      case 'ping':
        this.callbacks.onPing?.(centre);
        break;
      case 'ruler':
        this.startMeasure(centre);
        this.announceCursor();
        break;
      default:
        break;
    }
  }

  private showCursor(): void {
    const party = this.map?.party ?? null;
    this.kbCursor = startCursor(party, { x: this.camera.x, y: this.camera.y }, this.scene);
    this.keepInView(this.kbCursor);
    this.announceCursor();
    this.canvas.dataset['mapCursor'] = 'on';
    this.request();
  }

  private hideCursor(): void {
    if (!this.kbCursor) return;
    this.kbCursor = null;
    delete this.canvas.dataset['mapCursor'];
    this.callbacks.onCursorChange?.(null, '');
    this.announce('');
    this.request();
  }

  private toolChangedForCursor(): void {
    if (!isCursorTool(this.opts.tool)) {
      this.hideCursor();
      this.announce('');
      return;
    }
    if (this.kbCursor) this.announceCursor();
    else if (this.focused && focusVisible(this.canvas)) this.showCursor();
  }

  /** Pans so a cell stays at least two cells inside the screen. */
  private keepInView(cell: Point): void {
    const view = visibleWorld(this.camera, this.viewport);
    const margin = Math.min(2, (view.maxX - view.minX) / 4, (view.maxY - view.minY) / 4);
    const cx = cell.x + 0.5;
    const cy = cell.y + 0.5;
    if (
      cx > view.minX + margin &&
      cx < view.maxX - margin &&
      cy > view.minY + margin &&
      cy < view.maxY - margin
    )
      return;
    this.setFollow(false);
    this.panTo({ x: cx, y: cy }, !this.opts.reducedMotion);
  }

  private announceCursor(): void {
    const scene = this.scene;
    const cursor = this.kbCursor;
    const tool = this.opts.tool;
    if (!scene || !cursor || !isCursorTool(tool)) return;
    const text = describeCursor(scene, cursor, tool, this.measureAnchor ? this.measurement : null);
    const target = tool === 'pick-edge' ? cursorEdge(scene, cursor) : cursorCell(scene, cursor);
    this.callbacks.onCursorChange?.(target, text);
    this.announce(text);
  }

  private announce(text: string): void {
    this.announcer?.(text);
  }

  private setMeasurement(next: Measurement | null): void {
    const prev = this.measurement;
    this.measurement = next;
    const same =
      prev === next ||
      (prev !== null &&
        next !== null &&
        prev.from.x === next.from.x &&
        prev.from.y === next.from.y &&
        prev.to.x === next.to.x &&
        prev.to.y === next.to.y &&
        prev.metric === next.metric);
    if (!same) this.callbacks.onMeasureChange?.(next);
  }

  private keyUp(e: KeyboardEvent): void {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === ' ') {
      this.spaceDown = false;
      this.updateCursor();
    }
    if (this.keys.delete(key)) this.request();
    // Shift released while an arrow is held: drop arrow pans so they don't stick.
    if (e.key === 'Shift') for (const k of [...this.keys]) if (k.startsWith('Arrow')) this.keys.delete(k);
  }

  // ------------------------------------------------------------------------------------------
  // Hover and cursor.

  private hoverMode(): HitMode {
    if (this.opts.tool === 'pick-cell') return 'cell';
    if (this.opts.tool === 'pick-edge') return 'edge';
    return 'default';
  }

  private updateHover(): void {
    const scene = this.scene;
    const p = this.pointerScreen;
    if (!scene || !p || this.gestures.active) {
      if (!p) this.setHover(null);
      return;
    }
    const tool = this.opts.tool;
    const hovers = tool === 'select' || tool === 'pin' || tool === 'pick-cell' || tool === 'pick-edge';
    if (!hovers) {
      this.setHover(null);
      return;
    }
    const world = screenToWorld(this.camera, this.viewport, p);
    let target = hitTest(scene, world, {
      zoom: this.camera.zoom,
      mode: this.hoverMode(),
      pins: this.opts.pins,
      partyAt: this.partyPose(performance.now()),
    });
    // Rock means nothing in select mode, except a neighbour of the party, which is a move.
    if (target?.kind === 'cell' && tool === 'select' && !target.floor && !target.direction) target = null;
    if (tool === 'pin' && target?.kind !== 'pin') target = null;
    this.setHover(target);
  }

  private setHover(target: MapTarget | null): void {
    const changed = !sameTarget(this.hover, target);
    this.hover = target;
    if (this.hoverListener) this.hoverListener(target, target ? this.pointerScreen : null);
    if (!changed) return;
    this.callbacks.onHover?.(target);
    this.updateCursor();
    this.request();
  }

  private updateCursor(): void {
    const tool = this.opts.tool;
    let cursor = 'default';
    if (this.dragMode === 'pan') cursor = 'grabbing';
    else if (this.spaceDown || tool === 'pan') cursor = 'grab';
    else if (this.measureAnchor) cursor = 'crosshair';
    else if (tool === 'draw' || tool === 'ruler' || tool === 'pick-cell' || tool === 'pick-edge')
      cursor = 'crosshair';
    else if (tool === 'erase') cursor = 'cell';
    else if (tool === 'ping' || tool === 'pin') cursor = 'copy';
    else if (this.hover && this.hover.kind !== 'cell') cursor = 'pointer';
    else if (this.hover?.kind === 'cell' && this.hover.direction) cursor = 'pointer';
    this.canvas.style.cursor = cursor;
  }
}

function pad(b: Bounds, n: number): Bounds {
  return { minX: b.minX - n, minY: b.minY - n, maxX: b.maxX + n, maxY: b.maxY + n };
}

function intersect(a: Bounds, b: Bounds): Bounds | null {
  const r = {
    minX: Math.max(a.minX, b.minX),
    minY: Math.max(a.minY, b.minY),
    maxX: Math.min(a.maxX, b.maxX),
    maxY: Math.min(a.maxY, b.maxY),
  };
  return r.minX < r.maxX && r.minY < r.maxY ? r : null;
}

/** The canvas's 2D context, or `null` where there is none, as in jsdom. */
function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    return canvas.getContext('2d', { alpha: false });
  } catch {
    return null;
  }
}

/** Whether the element shows keyboard focus. Old engines without `:focus-visible` count every focus. */
function focusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

function navigatorIsMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
}
