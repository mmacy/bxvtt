import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture } from './fixtures/fixtures';
import { fromPlayerView } from './model';
import { MapRenderer, type MapCallbacks, type RendererOptions } from './render/renderer';

const map = fromPlayerView(fixture('showcase-explored').view);
// The camera puts world point (5, 5) at the centre of an 800 by 600 canvas, at 40 pixels a cell.
const CENTRE = { x: 400, y: 300 };
const CELL = 40;

let renderer: MapRenderer | null = null;

function setup(options: Partial<RendererOptions> = {}) {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  renderer = new MapRenderer(canvas);
  renderer.resize(800, 600, 1);
  renderer.setMap(map);
  renderer.setCamera({ x: 5, y: 5, zoom: CELL });
  renderer.setOptions(options);
  const callbacks = {
    onStrokeErase: vi.fn(),
    onMeasure: vi.fn(),
    onCellClick: vi.fn(),
    onFollowPartyChange: vi.fn(),
  } satisfies MapCallbacks;
  renderer.setCallbacks(callbacks);
  return { canvas, renderer, callbacks };
}

let pointerId = 1;
function pointer(canvas: HTMLCanvasElement, type: string, at: { x: number; y: number }) {
  const event = new MouseEvent(type, { clientX: at.x, clientY: at.y, button: 0, bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  canvas.dispatchEvent(event);
}

function tap(canvas: HTMLCanvasElement, at = CENTRE) {
  pointerId += 1;
  pointer(canvas, 'pointerdown', at);
  pointer(canvas, 'pointerup', at);
}

/** Presses a key on the map, and returns whether the map handled it. */
function press(canvas: HTMLCanvasElement, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  canvas.dispatchEvent(event);
  canvas.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
  return event.defaultPrevented;
}

afterEach(() => {
  renderer?.destroy();
  renderer = null;
  document.body.innerHTML = '';
});

describe('the keys the map handles', () => {
  it('handles its own keys and lets letters reach the app', () => {
    const { canvas } = setup();
    expect(press(canvas, 'ArrowLeft')).toBe(true);
    expect(press(canvas, '+')).toBe(true);
    expect(press(canvas, '0')).toBe(true);
    for (const key of ['a', 'w', 's', 'd', 'c', 'f', 'b', 'r']) expect(press(canvas, key)).toBe(false);
    expect(press(canvas, 'A', { shiftKey: true })).toBe(false);
    expect(press(canvas, '1', { altKey: true })).toBe(false);
    expect(press(canvas, 'k', { metaKey: true })).toBe(false);
    // Escape passes through when the map has nothing to clear, such as when the app cancels a pick with it.
    expect(press(canvas, 'Escape')).toBe(false);
  });

  it('handles W, A, S, D, C, and F with letterKeys', () => {
    const { canvas, callbacks } = setup({ letterKeys: true, followParty: false });
    for (const key of ['a', 'w', 's', 'd', 'c']) expect(press(canvas, key)).toBe(true);
    expect(press(canvas, 'f')).toBe(true);
    expect(callbacks.onFollowPartyChange).toHaveBeenCalledWith(true);
    expect(press(canvas, 'b')).toBe(false);
  });
});

describe('erasing', () => {
  const stroke = {
    id: 'stroke-1',
    points: [[4.5, 5] as [number, number], [5.5, 5] as [number, number]],
    color: '#e4572e',
    width: 0.1,
  };

  it('hides an erased stroke until restored, so a refused erase can bring it back', () => {
    const { canvas, callbacks } = setup({ tool: 'erase', strokes: [stroke] });
    tap(canvas);
    expect(callbacks.onStrokeErase).toHaveBeenLastCalledWith(['stroke-1']);
    // The stroke is hidden, so the eraser no longer finds it.
    tap(canvas);
    expect(callbacks.onStrokeErase).toHaveBeenCalledTimes(1);
    renderer?.restoreErasedStrokes(['stroke-1']);
    tap(canvas);
    expect(callbacks.onStrokeErase).toHaveBeenCalledTimes(2);
  });

  it('leaves the strokes to the caller with hideErasedStrokes off', () => {
    const { canvas, callbacks } = setup({ tool: 'erase', strokes: [stroke], hideErasedStrokes: false });
    tap(canvas);
    tap(canvas);
    expect(callbacks.onStrokeErase).toHaveBeenCalledTimes(2);
  });
});

describe('measuring from a cell', () => {
  it('follows the pointer and reports the measurement on a click, which goes nowhere else', () => {
    const { canvas, callbacks } = setup();
    renderer?.startMeasure({ x: 5, y: 5 });
    expect(renderer?.isMeasuring()).toBe(true);
    pointer(canvas, 'pointermove', { x: CENTRE.x + 2 * CELL, y: CENTRE.y + CELL });
    tap(canvas, { x: CENTRE.x + 2 * CELL, y: CENTRE.y + CELL });
    expect(callbacks.onMeasure).toHaveBeenCalledWith(
      expect.objectContaining({ from: { x: 5, y: 5 }, to: { x: 7, y: 6 }, squares: 3, feet: 30 }),
    );
    expect(callbacks.onCellClick).not.toHaveBeenCalled();
    expect(renderer?.isMeasuring()).toBe(false);
  });

  it('moves its far end with the arrow keys and ends with Enter', () => {
    const { canvas, callbacks } = setup({ arrowKeys: 'move' });
    renderer?.startMeasure({ x: 5.4, y: 5.9 });
    expect(press(canvas, 'ArrowRight')).toBe(true);
    expect(press(canvas, 'ArrowRight')).toBe(true);
    expect(press(canvas, 'ArrowUp')).toBe(true);
    expect(press(canvas, 'Enter')).toBe(true);
    expect(callbacks.onMeasure).toHaveBeenCalledWith(
      expect.objectContaining({ to: { x: 7, y: 4 }, squares: 3 }),
    );
  });

  it('ends with no result on Escape or a tool change', () => {
    const { canvas, callbacks } = setup();
    renderer?.startMeasure({ x: 5, y: 5 });
    expect(press(canvas, 'Escape')).toBe(true);
    expect(callbacks.onMeasure).toHaveBeenLastCalledWith(null);
    renderer?.startMeasure({ x: 5, y: 5 });
    renderer?.setOptions({ tool: 'draw' });
    expect(callbacks.onMeasure).toHaveBeenCalledTimes(2);
    expect(renderer?.isMeasuring()).toBe(false);
  });
});
