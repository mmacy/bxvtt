/**
 * An HTML layer over the map whose children stay on world points as the camera moves. The map reports its
 * camera on every animated frame, so the layer moves its children with direct style writes instead of a React
 * render per frame.
 *
 * A child marks its anchor with `data-wx` and `data-wy` (world coordinates in cells), and can hide below a zoom
 * with `data-minzoom`. An SVG `line` marks its ends with `data-wx1`, `data-wy1`, `data-wx2`, and `data-wy2`. The
 * layer also sets `--zoom` (CSS pixels per cell, unitless) on itself for sizes that scale with the map.
 */
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import type { Camera, DungeonMapHandle, Viewport } from '@/map';
import styles from './explore.module.css';

function project(camera: Camera, viewport: Viewport, x: number, y: number): [number, number] {
  return [
    (x - camera.x) * camera.zoom + viewport.width / 2,
    (y - camera.y) * camera.zoom + viewport.height / 2,
  ];
}

function apply(container: HTMLElement, camera: Camera, viewport: Viewport): void {
  container.style.setProperty('--zoom', String(camera.zoom));
  for (const node of container.querySelectorAll<HTMLElement>('[data-wx]')) {
    const x = Number(node.dataset['wx']);
    const y = Number(node.dataset['wy']);
    const [sx, sy] = project(camera, viewport, x, y);
    node.style.transform = `translate(${Math.round(sx * 10) / 10}px, ${Math.round(sy * 10) / 10}px)`;
    const min = node.dataset['minzoom'];
    node.style.visibility = min !== undefined && camera.zoom < Number(min) ? 'hidden' : '';
  }
  for (const line of container.querySelectorAll<SVGLineElement>('line[data-wx1]')) {
    const [x1, y1] = project(camera, viewport, Number(line.dataset['wx1']), Number(line.dataset['wy1']));
    const [x2, y2] = project(camera, viewport, Number(line.dataset['wx2']), Number(line.dataset['wy2']));
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
  }
}

export interface ProjectedProps {
  map: RefObject<DungeonMapHandle | null>;
  children: ReactNode;
  className?: string;
}

/** A layer of HTML over the map that follows the camera. It never takes pointer events. */
export function Projected({ map, children, className }: ProjectedProps) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<{ camera: Camera; viewport: Viewport } | null>(null);

  useLayoutEffect(() => {
    const handle = map.current;
    if (handle === null) return;
    return handle.onCamera((camera, viewport) => {
      last.current = { camera, viewport };
      if (ref.current) apply(ref.current, camera, viewport);
    });
  }, [map]);

  // New children need a position before they paint.
  useLayoutEffect(() => {
    if (ref.current && last.current) apply(ref.current, last.current.camera, last.current.viewport);
  });

  return (
    <div ref={ref} className={className ?? styles.projected} aria-hidden="true">
      {children}
    </div>
  );
}
