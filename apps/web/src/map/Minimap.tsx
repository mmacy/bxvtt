import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { Camera, Viewport } from './camera';
import type { DungeonMapHandle } from './DungeonMap';
import type { Bounds, LevelMap } from './model';
import { resolveTheme, type MapTheme, type ThemeName } from './themes';
import { rgba } from './render/util';

export interface MinimapProps {
  /** The same level the main map draws. */
  map: LevelMap | null;
  /** The main map's handle, which the minimap follows and pans. */
  target: RefObject<DungeonMapHandle | null>;
  theme?: ThemeName | MapTheme;
  /** CSS size. Defaults to 200 by 150. */
  width?: number;
  height?: number;
  /** The accessible name. Defaults to "Minimap". */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

interface Layout {
  bounds: Bounds;
  scale: number;
  ox: number;
  oy: number;
}

/** The fewest cells a player's minimap spans, so a level the party barely knows shows as a small shape. */
const MIN_SPAN = { w: 16, h: 12 };

export function layoutFor(map: LevelMap, width: number, height: number): Layout {
  const b = map.layer === 'referee' ? map.bounds : (map.knownBounds ?? map.bounds);
  const bounds = { minX: b.minX - 1, minY: b.minY - 1, maxX: b.maxX + 1, maxY: b.maxY + 1 };
  if (map.layer === 'player') {
    const growX = Math.max(0, MIN_SPAN.w - (bounds.maxX - bounds.minX)) / 2;
    const growY = Math.max(0, MIN_SPAN.h - (bounds.maxY - bounds.minY)) / 2;
    bounds.minX -= growX;
    bounds.maxX += growX;
    bounds.minY -= growY;
    bounds.maxY += growY;
  }
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  // Cap the scale so a level the party barely knows doesn't fill the minimap with one cell.
  const scale = Math.min(width / w, height / h, 12);
  return { bounds, scale, ox: (width - w * scale) / 2, oy: (height - h * scale) / 2 };
}

/**
 * A small overview of the level with the main map's viewport on it. Click or drag to move the main
 * map. With focus, the arrow keys pan the main map a quarter of a screen at a time.
 */
export function Minimap(props: MinimapProps) {
  const { map, target, width = 200, height = 150 } = props;
  const theme = resolveTheme(props.theme);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<{ camera: Camera; viewport: Viewport } | null>(null);
  const layoutRef = useRef<Layout | null>(null);
  const draggingRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.rock.color;
    ctx.fillRect(0, 0, width, height);
    const base = baseRef.current;
    if (base) ctx.drawImage(base, 0, 0, width, height);
    const layout = layoutRef.current;
    const cam = cameraRef.current;
    if (layout && map?.party) {
      const px = layout.ox + (map.party.x + 0.5 - layout.bounds.minX) * layout.scale;
      const py = layout.oy + (map.party.y + 0.5 - layout.bounds.minY) * layout.scale;
      ctx.beginPath();
      ctx.arc(px, py, Math.min(5, Math.max(3, layout.scale * 0.6)), 0, Math.PI * 2);
      ctx.fillStyle = theme.party.fill;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.party.stroke;
      ctx.stroke();
    }
    if (layout && cam) {
      const halfW = cam.viewport.width / 2 / cam.camera.zoom;
      const halfH = cam.viewport.height / 2 / cam.camera.zoom;
      const x = layout.ox + (cam.camera.x - halfW - layout.bounds.minX) * layout.scale;
      const y = layout.oy + (cam.camera.y - halfH - layout.bounds.minY) * layout.scale;
      const w = halfW * 2 * layout.scale;
      const h = halfH * 2 * layout.scale;
      // The viewport as an outline only, clipped to the minimap. When the main map shows more than the minimap
      // covers, the outline would only frame the edge, so it's left out.
      const x0 = Math.max(0, x);
      const y0 = Math.max(0, y);
      const x1 = Math.min(width, x + w);
      const y1 = Math.min(height, y + h);
      const covers = x0 <= 0 && y0 <= 0 && x1 >= width && y1 >= height;
      if (!covers && x1 > x0 && y1 > y0) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = theme.hover.stroke;
        ctx.strokeRect(x0 + 0.75, y0 + 0.75, Math.max(2, x1 - x0 - 1.5), Math.max(2, y1 - y0 - 1.5));
      }
    }
  }, [height, map, theme, width]);

  // The static picture of the level, redrawn when the level or the theme changes.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (!map) {
      baseRef.current = null;
      layoutRef.current = null;
      draw();
      return;
    }
    const layout = layoutFor(map, width, height);
    layoutRef.current = layout;
    const base = document.createElement('canvas');
    base.width = Math.round(width * dpr);
    base.height = Math.round(height * dpr);
    const ctx = base.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cell = layout.scale;
      // A player's minimap draws only what the party knows, on the theme's rock. A referee's draws the whole
      // level, with what the party hasn't seen under the veil.
      for (const c of map.cells) {
        if (map.layer === 'player' && !c.known) continue;
        ctx.fillStyle = c.known ? theme.floor.color : rgba(theme.fog.veil, 0.85);
        ctx.fillRect(
          layout.ox + (c.x - layout.bounds.minX) * cell,
          layout.oy + (c.y - layout.bounds.minY) * cell,
          Math.ceil(cell),
          Math.ceil(cell),
        );
      }
      // The walls, so the explored shape reads at a glance.
      if (cell >= 3) {
        ctx.beginPath();
        for (const e of map.edges) {
          if (e.kind === 'open') continue;
          const x = layout.ox + (e.x - layout.bounds.minX) * cell;
          const y = layout.oy + (e.y - layout.bounds.minY) * cell;
          ctx.moveTo(x, y);
          if (e.side === 'north') ctx.lineTo(x + cell, y);
          else ctx.lineTo(x, y + cell);
        }
        ctx.lineWidth = Math.max(1, cell * 0.14);
        ctx.lineCap = 'square';
        ctx.strokeStyle = theme.wall.color;
        ctx.stroke();
      }
    }
    baseRef.current = base;
    draw();
  }, [draw, height, map, theme, width]);

  useEffect(() => {
    const handle = target.current;
    if (!handle) return;
    return handle.onCamera((camera, viewport) => {
      cameraRef.current = { camera, viewport };
      draw();
    });
  }, [draw, target, map]);

  const panToEvent = (e: PointerEvent<HTMLCanvasElement>, animate: boolean) => {
    const layout = layoutRef.current;
    const handle = target.current;
    if (!layout || !handle) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left - layout.ox) / layout.scale + layout.bounds.minX;
    const y = (e.clientY - rect.top - layout.oy) / layout.scale + layout.bounds.minY;
    handle.panTo({ x, y }, animate);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const handle = target.current;
    const cam = cameraRef.current;
    if (!handle || !cam) return;
    const stepX = cam.viewport.width / 4 / cam.camera.zoom;
    const stepY = cam.viewport.height / 4 / cam.camera.zoom;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [0, -stepY],
      ArrowDown: [0, stepY],
      ArrowLeft: [-stepX, 0],
      ArrowRight: [stepX, 0],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    handle.panTo({ x: cam.camera.x + move[0], y: cam.camera.y + move[1] }, true);
  };

  return (
    <canvas
      ref={canvasRef}
      className={props.className}
      tabIndex={0}
      role="application"
      aria-roledescription="minimap"
      aria-label={props.ariaLabel ?? 'Minimap'}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        panToEvent(e, true);
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) panToEvent(e, false);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
      style={{
        width,
        height,
        display: 'block',
        borderRadius: 8,
        border: `1px solid ${theme.ui.border}`,
        cursor: 'pointer',
        touchAction: 'none',
        ...props.style,
      }}
    />
  );
}
