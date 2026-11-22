import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import type { Camera, Viewport, ZoomLimits } from './camera';
import { describeTarget } from './describe';
import type { Direction, Point } from './geometry';
import type {
  CellTarget,
  EdgeTarget,
  FeatureTarget,
  MapTarget,
  PartyTarget,
  PinTarget,
  TransitionTarget,
} from './hit';
import type { LevelMap } from './model';
import type { MapPin, MapPing, MapPointer, MapStroke, MapTool, Measurement, RulerMetric } from './overlays';
import { MapRenderer, type MapPointerInfo, type RendererStats } from './render/renderer';
import { resolveTheme, type MapTheme, type ThemeName } from './themes';
import styles from './DungeonMap.module.css';

export interface DungeonMapProps {
  /** The level to draw, from `fromPlayerView`, `fromRefereeView`, or `fromReferee`. `null` draws empty rock. */
  map: LevelMap | null;
  /** A theme name or a theme object. Defaults to `'blueprint'`. */
  theme?: ThemeName | MapTheme;
  /** The active tool. Defaults to `'select'`. Holding Space pans in every tool. */
  tool?: MapTool;
  /** Pings to animate. Each new id pulses once for about 2.6 seconds from when the map first receives it. */
  pings?: readonly MapPing[];
  /** Committed freehand strokes. */
  strokes?: readonly MapStroke[];
  /** Pins. A pin's note shows on hover. */
  pins?: readonly MapPin[];
  /** Other people's pointers, drawn as cursors with names. The map eases them toward each new position. */
  pointers?: readonly MapPointer[];
  /** The color of a new stroke. */
  strokeColor?: string;
  /** The width of a new stroke, in cells. Defaults to 0.09. */
  strokeWidth?: number;
  /** How the ruler counts squares. Defaults to `'grid'`, the orthogonal steps the party walks. */
  rulerMetric?: RulerMetric;
  /** Keeps the camera on the party. The map turns it off when the user pans, and reports that through `onFollowPartyChange`. */
  followParty?: boolean;
  /** What the arrow keys do: pan the camera (default), or call `onMoveKey`. With `'move'`, Shift and the arrows pan. */
  arrowKeys?: 'pan' | 'move';
  /**
   * Handles letter keys on the focused map: W, A, S, and D pan, C centres on the party, and F toggles follow mode.
   * Defaults to false, so letters reach the app's shortcuts. Turn it on where the map is the whole page, such as
   * the harness.
   */
  letterKeys?: boolean;
  /** Turns off easing, inertia, and flicker. Defaults to the user's `prefers-reduced-motion` setting. */
  reducedMotion?: boolean;
  /** On a referee map, draws area labels and the encounter, treasure, and trap markers. Defaults to true. */
  refereeMarkers?: boolean;
  /**
   * On a player map, draws the names of the areas passed in `fromPlayerView`'s `extras.areas`. Defaults to true.
   * Pass false when you draw your own labels and pass the areas only for the hover tooltip.
   */
  areaLabels?: boolean;
  /**
   * Hides a stroke as soon as the eraser touches it, until the next `strokes` list arrives. Defaults to true. Call
   * `restoreErasedStrokes` on the handle to show strokes again, such as after the server refused an erase. Pass
   * false to control erasing fully: the map only reports `onStrokeErase`, and a stroke stays until you remove it.
   */
  hideErasedStrokes?: boolean;
  /** Zoom limits in CSS pixels per cell. Defaults to 6 and 160. */
  zoomLimits?: ZoomLimits;
  /** Where the camera starts on a new level: fit the known map (default) or close on the party. */
  initialView?: 'fit' | 'party';
  /** Shows the referee's wandering monster chip in the corner of a referee map. Defaults to true. */
  showWandering?: boolean;
  /** The accessible name of the map. Defaults to "Dungeon map". */
  ariaLabel?: string;
  /**
   * Applied to the container, after the map's own defaults (`position: relative`, `overflow: hidden`, and the
   * theme's rock color as the background), which have no specificity. A class or a style can position the map,
   * such as `position: absolute; inset: 0`. Give the container a size.
   */
  className?: string;
  style?: CSSProperties;

  /** A click on a cell. `target.direction` is set when the cell is next to the party, so the caller can send a move. */
  onCellClick?: (target: CellTarget, info: MapPointerInfo) => void;
  /** A click on a door or passage. `target.direction` is the party's side when the party stands beside it. */
  onEdgeClick?: (target: EdgeTarget, info: MapPointerInfo) => void;
  /** A click on a feature: a cache, a pile, a trick, or a custom feature. */
  onFeatureClick?: (target: FeatureTarget, info: MapPointerInfo) => void;
  /** A click on stairs, a trapdoor, or a chute. */
  onTransitionClick?: (target: TransitionTarget, info: MapPointerInfo) => void;
  /** A click on the party token. */
  onPartyClick?: (target: PartyTarget, info: MapPointerInfo) => void;
  /** A click on a pin. */
  onPinClick?: (target: PinTarget, info: MapPointerInfo) => void;
  /** A right-click or a long press with a mouse. Passing it turns off the browser's own menu. */
  onContextMenu?: (target: MapTarget | null, screen: Point, info: MapPointerInfo) => void;
  /** The hovered target changed. */
  onHover?: (target: MapTarget | null) => void;
  /** The user pinged: Alt and click, a long press, or a click with the ping tool. */
  onPing?: (point: Point) => void;
  /** The user finished a stroke with the draw tool. The points are simplified. Add an id and pass it back in `strokes`. */
  onStrokeComplete?: (stroke: Omit<MapStroke, 'id'>) => void;
  /** The eraser touched these strokes. Remove them from `strokes`. */
  onStrokeErase?: (ids: string[]) => void;
  /** A click with the pin tool on an empty spot. */
  onPinCreate?: (point: Point) => void;
  /** A click with the pick-a-cell tool. */
  onPickCell?: (target: CellTarget) => void;
  /** A click with the pick-an-edge tool. */
  onPickEdge?: (target: EdgeTarget) => void;
  /** The ruler finished a measurement, or cleared one (`null`). */
  onMeasure?: (measurement: Measurement | null) => void;
  /** The camera moved. It fires every animated frame, so don't set React state from it directly. */
  onCameraChange?: (camera: Camera) => void;
  /** The map turned follow mode on or off: a pan turns it off, and the F key toggles it. */
  onFollowPartyChange?: (follow: boolean) => void;
  /** An arrow key with `arrowKeys="move"`. `repeat` is true while the key is held. */
  onMoveKey?: (direction: Direction, repeat: boolean) => void;

  ref?: Ref<DungeonMapHandle>;
}

export interface DungeonMapHandle {
  zoomIn(): void;
  zoomOut(): void;
  /** Fits the cells the party knows (the whole level on a referee map with nothing known). */
  fitToExplored(animate?: boolean): void;
  centerOnParty(animate?: boolean): void;
  /** Centers the camera on a world point. */
  panTo(point: Point, animate?: boolean): void;
  getCamera(): Camera;
  setCamera(camera: Camera, animate?: boolean): void;
  /** Subscribes to camera changes, as the minimap does. Returns the unsubscribe function. */
  onCamera(listener: (camera: Camera, viewport: Viewport) => void): () => void;
  /**
   * A snapshot as a data URL. `area: 'viewport'` (default) captures the screen. `area: 'level'`
   * paints the known level at `scale` device pixels per cell, with strokes, pins, and the party.
   */
  toDataURL(options?: {
    area?: 'viewport' | 'level';
    type?: string;
    quality?: number;
    scale?: number;
  }): string;
  /** Frame timing, for a performance overlay. */
  getStats(): RendererStats;
  /** Focuses the map so it takes keyboard input. */
  focus(): void;
  /**
   * Starts a measurement from a cell (`{ x, y }` in cells), in any tool, such as "Measure from here" in a context
   * menu. The ruler runs to the cell under the pointer, and the arrow keys move its far end while the map has
   * focus. A click or Enter ends it and reports the measurement through `onMeasure`. The click doesn't reach the
   * other callbacks. Escape, a tool change, a level change, or `cancelMeasure()` ends it and reports `null`.
   */
  startMeasure(from: Point): void;
  /** Ends a measurement that `startMeasure` began, and reports `null` through `onMeasure`. */
  cancelMeasure(): void;
  /** Whether a measurement that `startMeasure` began is running. */
  isMeasuring(): boolean;
  /** Shows strokes the eraser hid again: the given ids, or every hidden stroke. */
  restoreErasedStrokes(ids?: readonly string[]): void;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

const hiddenText: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * The dungeon map. It draws a `LevelMap` on a canvas and reports what the user does through
 * callbacks. It never sends a request or decides whether an action is legal.
 */
export function DungeonMap(props: DungeonMapProps) {
  const { ref } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const propsRef = useRef(props);
  const [focusRing, setFocusRing] = useState(false);
  const helpId = useId();
  const theme = resolveTheme(props.theme);

  useLayoutEffect(() => {
    propsRef.current = props;
  });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const renderer = new MapRenderer(canvas);
    rendererRef.current = renderer;
    const p = () => propsRef.current;
    renderer.setCallbacks({
      onCellClick: (t, i) => p().onCellClick?.(t, i),
      onEdgeClick: (t, i) => p().onEdgeClick?.(t, i),
      onFeatureClick: (t, i) => p().onFeatureClick?.(t, i),
      onTransitionClick: (t, i) => p().onTransitionClick?.(t, i),
      onPartyClick: (t, i) => p().onPartyClick?.(t, i),
      onPinClick: (t, i) => p().onPinClick?.(t, i),
      onHover: (t) => p().onHover?.(t),
      onPing: (pt) => p().onPing?.(pt),
      onStrokeComplete: (s) => p().onStrokeComplete?.(s),
      onStrokeErase: (ids) => p().onStrokeErase?.(ids),
      onPinCreate: (pt) => p().onPinCreate?.(pt),
      onPickCell: (t) => p().onPickCell?.(t),
      onPickEdge: (t) => p().onPickEdge?.(t),
      onMeasure: (m) => p().onMeasure?.(m),
      onCameraChange: (c) => p().onCameraChange?.(c),
      onFollowPartyChange: (f) => p().onFollowPartyChange?.(f),
      onMoveKey: (d, r) => p().onMoveKey?.(d, r),
      get onContextMenu() {
        const handler = p().onContextMenu;
        return handler ? (t: MapTarget | null, s: Point, i: MapPointerInfo) => handler(t, s, i) : undefined;
      },
    });
    renderer.setHoverListener((target, screen) => {
      const tip = tooltipRef.current;
      const map = propsRef.current.map;
      if (!tip) return;
      const description = target && map && screen ? describeTarget(target, map) : null;
      if (!description || !screen) {
        tip.style.opacity = '0';
        return;
      }
      const title = tip.firstElementChild;
      const body = tip.lastElementChild;
      if (title) title.textContent = description.title;
      if (body) body.textContent = description.lines.join('\n');
      const width = container.clientWidth;
      const x = Math.min(screen.x + 16, Math.max(8, width - 268));
      const y = Math.max(8, screen.y + 18);
      tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      tip.style.opacity = '1';
    });
    const measure = () => {
      const rect = container.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(container);
    // A move to a screen with another pixel ratio needs a fresh resolution.
    let media: MediaQueryList | null = null;
    const watchDpr = () => {
      media?.removeEventListener('change', onDpr);
      if (typeof window.matchMedia !== 'function') return;
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      media.addEventListener('change', onDpr);
    };
    const onDpr = () => {
      measure();
      watchDpr();
    };
    watchDpr();
    return () => {
      observer?.disconnect();
      media?.removeEventListener('change', onDpr);
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    rendererRef.current?.setMap(props.map);
  }, [props.map]);

  const {
    tool = 'select',
    pings,
    strokes,
    pins,
    pointers,
    strokeColor = '#e4572e',
    strokeWidth = 0.09,
    rulerMetric = 'grid',
    followParty = false,
    arrowKeys = 'pan',
    letterKeys = false,
    reducedMotion,
    refereeMarkers = true,
    areaLabels = true,
    hideErasedStrokes = true,
    zoomLimits,
    initialView = 'fit',
  } = props;
  const reduced = reducedMotion ?? prefersReducedMotion();

  useLayoutEffect(() => {
    rendererRef.current?.setOptions({
      theme,
      tool,
      strokeColor,
      strokeWidth,
      rulerMetric,
      followParty,
      arrowKeys,
      letterKeys,
      reducedMotion: reduced,
      refereeMarkers,
      areaLabels,
      hideErasedStrokes,
      initialView,
    });
  }, [
    theme,
    tool,
    strokeColor,
    strokeWidth,
    rulerMetric,
    followParty,
    arrowKeys,
    letterKeys,
    reduced,
    refereeMarkers,
    areaLabels,
    hideErasedStrokes,
    initialView,
  ]);

  useLayoutEffect(() => {
    if (zoomLimits) rendererRef.current?.setOptions({ zoomLimits });
  }, [zoomLimits]);
  useLayoutEffect(() => {
    rendererRef.current?.setOptions({ pings: pings ?? [] });
  }, [pings]);
  useLayoutEffect(() => {
    rendererRef.current?.setOptions({ strokes: strokes ?? [] });
  }, [strokes]);
  useLayoutEffect(() => {
    rendererRef.current?.setOptions({ pins: pins ?? [] });
  }, [pins]);
  useLayoutEffect(() => {
    rendererRef.current?.setOptions({ pointers: pointers ?? [] });
  }, [pointers]);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => rendererRef.current?.zoomBy(1.4),
      zoomOut: () => rendererRef.current?.zoomBy(1 / 1.4),
      fitToExplored: (animate = true) => rendererRef.current?.fitToExplored(animate),
      centerOnParty: (animate = true) => rendererRef.current?.centerOnParty(animate),
      panTo: (point, animate = true) => rendererRef.current?.panTo(point, animate),
      getCamera: () => rendererRef.current?.getCamera() ?? { x: 0, y: 0, zoom: 32 },
      setCamera: (camera, animate = false) => rendererRef.current?.setCamera(camera, animate),
      onCamera: (listener) => rendererRef.current?.onCamera(listener) ?? (() => undefined),
      toDataURL: (options) => rendererRef.current?.toDataURL(options) ?? '',
      getStats: () =>
        rendererRef.current?.stats ?? { fps: 0, frameMs: 0, worstMs: 0, tilesPainted: 0, tilesCached: 0 },
      focus: () => canvasRef.current?.focus(),
      startMeasure: (from) => rendererRef.current?.startMeasure(from),
      cancelMeasure: () => rendererRef.current?.cancelMeasure(),
      isMeasuring: () => rendererRef.current?.isMeasuring() ?? false,
      restoreErasedStrokes: (ids) => rendererRef.current?.restoreErasedStrokes(ids),
    }),
    [],
  );

  useEffect(() => {
    const tip = tooltipRef.current;
    if (tip) tip.style.opacity = '0';
  }, [props.map?.key, tool]);

  const map = props.map;
  const party = map?.party;
  const status = party
    ? `The party is at ${party.x}, ${party.y}, facing ${party.facing}.`
    : 'The party isn’t on this level.';
  const wandering = map?.layer === 'referee' && (props.showWandering ?? true) ? map.wandering : null;

  return (
    <div
      ref={containerRef}
      className={[styles.root, props.className].filter(Boolean).join(' ')}
      style={
        {
          '--dungeon-map-rock': theme.rock.color,
          boxShadow: focusRing ? `inset 0 0 0 2px ${theme.hover.stroke}` : undefined,
          ...props.style,
        } as CSSProperties
      }
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-roledescription="map"
        aria-label={props.ariaLabel ?? 'Dungeon map'}
        aria-describedby={helpId}
        onFocus={(e) => setFocusRing(e.currentTarget.matches(':focus-visible'))}
        onBlur={() => setFocusRing(false)}
        style={{ display: 'block', width: '100%', height: '100%', outline: 'none', userSelect: 'none' }}
      />
      <div id={helpId} style={hiddenText}>
        {arrowKeys === 'move'
          ? `Arrow keys move the party. Shift and the arrow keys${letterKeys ? ' or W, A, S, and D' : ''} pan the map.`
          : `Arrow keys${letterKeys ? ' or W, A, S, and D' : ''} pan the map.`}{' '}
        Plus and minus zoom. Zero fits the explored map.
        {letterKeys ? ' C centres on the party. F follows the party.' : ''}
      </div>
      <div aria-live="polite" style={hiddenText}>
        {status}
      </div>
      <div
        ref={tooltipRef}
        role="tooltip"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          maxWidth: 260,
          padding: '6px 9px',
          borderRadius: 6,
          background: theme.ui.panel,
          color: theme.ui.text,
          border: `1px solid ${theme.ui.border}`,
          boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
          font: '13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif',
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 90ms linear',
          whiteSpace: 'pre-line',
          zIndex: 2,
        }}
      >
        <div style={{ fontWeight: 650 }} />
        <div style={{ color: theme.ui.muted, marginTop: 2 }} />
      </div>
      {wandering ? (
        <div
          style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            padding: '4px 9px',
            borderRadius: 999,
            background: theme.ui.panel,
            color: theme.ui.muted,
            border: `1px solid ${theme.ui.border}`,
            font: '12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif',
            pointerEvents: 'none',
          }}
        >
          Wandering monsters: {wandering.chanceInSix} in 6 every {wandering.intervalTurns}{' '}
          {wandering.intervalTurns === 1 ? 'turn' : 'turns'}
          {wandering.customTable ? ', level table' : ''}
        </div>
      ) : null}
    </div>
  );
}
