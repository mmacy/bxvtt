import { describe, expect, it } from 'vitest';
import { GestureRecognizer, wheelZoomFactor, type PointerSample } from './input';

const p = (id: number, x: number, y: number, t: number, pointerType = 'mouse'): PointerSample => ({
  id,
  x,
  y,
  t,
  button: 0,
  pointerType,
  altKey: false,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
});

describe('GestureRecognizer', () => {
  it('reports a tap when the pointer barely moves', () => {
    const g = new GestureRecognizer();
    g.down(p(1, 10, 10, 0));
    expect(g.move(p(1, 12, 11, 20))).toEqual([]);
    expect(g.up(p(1, 12, 11, 40)).map((e) => e.type)).toEqual(['tap']);
    expect(g.active).toBe(false);
  });

  it('turns a press into a drag past the slop, with deltas and a release velocity', () => {
    const g = new GestureRecognizer({ mouseSlop: 4 });
    g.down(p(1, 0, 0, 0));
    const start = g.move(p(1, 10, 0, 16));
    expect(start.map((e) => e.type)).toEqual(['drag-start', 'drag']);
    expect(g.move(p(1, 20, 0, 32))).toEqual([{ type: 'drag', x: 20, y: 0, dx: 10, dy: 0 }]);
    const end = g.up(p(1, 30, 0, 48));
    expect(end[0]?.type).toBe('drag-end');
    if (end[0]?.type === 'drag-end') expect(end[0].velocity.x).toBeGreaterThan(0.4);
  });

  it('uses a wider slop for touch', () => {
    const g = new GestureRecognizer({ mouseSlop: 4, touchSlop: 9 });
    g.down(p(1, 0, 0, 0, 'touch'));
    expect(g.move(p(1, 6, 0, 10, 'touch'))).toEqual([]);
  });

  it('fires a long press for a still press and then suppresses the tap', () => {
    const g = new GestureRecognizer({ longPressMs: 500 });
    g.down(p(1, 5, 5, 100));
    expect(g.longPressDue).toBe(600);
    expect(g.tick(550)).toEqual([]);
    expect(g.tick(600).map((e) => e.type)).toEqual(['long-press']);
    expect(g.up(p(1, 5, 5, 700))).toEqual([]);
  });

  it('allows no long press when the caller says so', () => {
    const g = new GestureRecognizer({ longPressMs: 500 });
    g.down(p(1, 5, 5, 0), false);
    expect(g.longPressDue).toBeNull();
    expect(g.tick(1000)).toEqual([]);
  });

  it('switches to a pinch on a second finger, cancelling a drag, and reports scale and centre motion', () => {
    const g = new GestureRecognizer();
    g.down(p(1, 0, 0, 0, 'touch'));
    g.move(p(1, 20, 0, 10, 'touch'));
    const start = g.down(p(2, 120, 0, 20, 'touch'));
    expect(start.map((e) => e.type)).toEqual(['cancel', 'pinch-start']);
    const pinch = g.move(p(2, 220, 0, 30, 'touch'));
    expect(pinch[0]).toMatchObject({ type: 'pinch', scale: 2, dx: 50, dy: 0 });
    expect(g.up(p(2, 220, 0, 40, 'touch')).map((e) => e.type)).toEqual(['pinch-end']);
    // The remaining finger doesn't start a pan.
    expect(g.move(p(1, 60, 0, 50, 'touch'))).toEqual([]);
    expect(g.up(p(1, 60, 0, 60, 'touch'))).toEqual([]);
    expect(g.active).toBe(false);
  });
});

describe('wheelZoomFactor', () => {
  it('zooms in on a negative delta and out on a positive one, more strongly for a pinch', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
    expect(wheelZoomFactor(-10, 0, true)).toBeGreaterThan(wheelZoomFactor(-10, 0, false));
    expect(wheelZoomFactor(-3, 1, false)).toBeCloseTo(wheelZoomFactor(-48, 0, false));
  });
});
