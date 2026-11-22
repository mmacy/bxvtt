import { describe, expect, it } from 'vitest';
import {
  VelocityTracker,
  clampToBounds,
  fitBounds,
  inertiaDistance,
  lerpCamera,
  panBy,
  screenToCell,
  screenToWorld,
  stepInertia,
  visibleWorld,
  worldToScreen,
  zoomAt,
} from './camera';

const viewport = { width: 800, height: 600 };
const camera = { x: 10, y: 5, zoom: 40 };

describe('transforms', () => {
  it('puts the camera centre in the middle of the screen', () => {
    expect(worldToScreen(camera, viewport, { x: 10, y: 5 })).toEqual({ x: 400, y: 300 });
    expect(worldToScreen(camera, viewport, { x: 11, y: 5 })).toEqual({ x: 440, y: 300 });
  });

  it('round-trips between screen and world', () => {
    const p = { x: 123.5, y: 456.25 };
    const back = worldToScreen(camera, viewport, screenToWorld(camera, viewport, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('finds the cell under a screen point', () => {
    expect(screenToCell(camera, viewport, { x: 400, y: 300 })).toEqual({ x: 10, y: 5 });
    expect(screenToCell(camera, viewport, { x: 399, y: 299 })).toEqual({ x: 9, y: 4 });
  });

  it('reports the visible world rectangle', () => {
    expect(visibleWorld(camera, viewport)).toEqual({ minX: 0, minY: -2.5, maxX: 20, maxY: 12.5 });
  });
});

describe('pan and zoom', () => {
  it('moves the world with a drag', () => {
    const next = panBy(camera, 40, -80);
    expect(next).toEqual({ x: 9, y: 7, zoom: 40 });
  });

  it('keeps the world point under the pointer still while zooming', () => {
    const anchor = { x: 650, y: 120 };
    const before = screenToWorld(camera, viewport, anchor);
    const next = zoomAt(camera, viewport, anchor, 1.7);
    const after = screenToWorld(next, viewport, anchor);
    expect(next.zoom).toBeCloseTo(68);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom to the limits and still keeps the anchor', () => {
    const anchor = { x: 100, y: 100 };
    const next = zoomAt(camera, viewport, anchor, 100, { min: 5, max: 80 });
    expect(next.zoom).toBe(80);
    const a = screenToWorld(camera, viewport, anchor);
    const b = screenToWorld(next, viewport, anchor);
    expect(b.x).toBeCloseTo(a.x);
  });

  it('fits bounds with padding', () => {
    const fit = fitBounds({ minX: 0, minY: 0, maxX: 20, maxY: 10 }, viewport, 50);
    expect(fit).toEqual({ x: 10, y: 5, zoom: 35 });
  });

  it('keeps some content on screen', () => {
    const far = clampToBounds(
      { x: 500, y: -400, zoom: 40 },
      viewport,
      { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      100,
    );
    const rect = visibleWorld(far, viewport);
    expect(rect.minX).toBeLessThanOrEqual(10 - 100 / 40 + 1e-9);
    expect(rect.maxY).toBeGreaterThanOrEqual(100 / 40 - 1e-9);
  });

  it('interpolates zoom geometrically', () => {
    const mid = lerpCamera({ x: 0, y: 0, zoom: 10 }, { x: 10, y: 0, zoom: 40 }, 0.5);
    expect(mid).toEqual({ x: 5, y: 0, zoom: 20 });
  });
});

describe('inertia', () => {
  it('measures release velocity over a short window and ignores a pointer that stopped', () => {
    const tracker = new VelocityTracker(90);
    tracker.add(0, 0, 0);
    tracker.add(10, 0, 16);
    tracker.add(20, 0, 32);
    expect(tracker.velocity(32).x).toBeCloseTo(0.625);
    expect(tracker.velocity(200)).toEqual({ x: 0, y: 0 });
  });

  it('travels the same distance whatever the frame rate', () => {
    const run = (dt: number) => {
      let v = { x: 2, y: 0 };
      let total = 0;
      for (let t = 0; t < 3000; t += dt) {
        const step = stepInertia(v, dt);
        total += step.dx;
        v = step.velocity;
      }
      return total;
    };
    expect(run(8)).toBeCloseTo(run(32), 0);
    expect(run(16)).toBeCloseTo(inertiaDistance({ x: 2, y: 0 }).x, 0);
  });
});
