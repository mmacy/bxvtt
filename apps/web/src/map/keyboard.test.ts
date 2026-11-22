import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, fixtureLevel } from './fixtures/fixtures';
import { fromRefereeView } from './model';
import { MapRenderer, type MapCallbacks, type RendererOptions } from './render/renderer';

const explored = fixture('showcase-explored');
const map = fromRefereeView(fixtureLevel(explored, 'vault', 1), explored.referee.dungeon_state, {
  dungeonId: 'vault',
});

let renderer: MapRenderer | null = null;

/** A map inside a parent that, like the play screen, moves the party with the arrow keys in the capture phase. */
function setup(options: Partial<RendererOptions>) {
  const parent = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  parent.appendChild(canvas);
  document.body.appendChild(parent);
  const parentMoves = vi.fn();
  parent.addEventListener(
    'keydown',
    (e) => {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        parentMoves(e.key);
      }
    },
    true,
  );
  renderer = new MapRenderer(canvas);
  renderer.resize(800, 600, 1);
  renderer.setMap(map);
  renderer.setOptions(options);
  const callbacks = {
    onPickCell: vi.fn(),
    onPickEdge: vi.fn(),
    onPickCancel: vi.fn(),
    onPinCreate: vi.fn(),
    onPing: vi.fn(),
    onMeasure: vi.fn(),
    onMeasureChange: vi.fn(),
    onCursorChange: vi.fn(),
    onMoveKey: vi.fn(),
  } satisfies MapCallbacks;
  renderer.setCallbacks(callbacks);
  const announced: string[] = [];
  renderer.setAnnouncer((text) => announced.push(text));
  canvas.focus();
  return { canvas, renderer, callbacks, parentMoves, announced };
}

function press(canvas: HTMLCanvasElement, key: string, init: KeyboardEventInit = {}): boolean {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  canvas.dispatchEvent(event);
  return event.defaultPrevented;
}

afterEach(() => {
  renderer?.destroy();
  renderer = null;
  document.body.innerHTML = '';
});

describe('the keyboard cursor', () => {
  it('picks a cell with the arrow keys and Enter, ahead of a parent that moves the party', () => {
    const { canvas, callbacks, parentMoves, announced } = setup({ tool: 'pick-cell' });
    // The party stands at 16,15. The first arrow shows the cursor there, if focus didn't already.
    press(canvas, 'ArrowUp');
    press(canvas, 'ArrowUp');
    press(canvas, 'ArrowLeft');
    expect(canvas.dataset['mapCursor']).toBe('on');
    expect(press(canvas, 'Enter')).toBe(true);
    expect(parentMoves).not.toHaveBeenCalled();
    const picked = callbacks.onPickCell.mock.calls[0]?.[0];
    expect(picked).toMatchObject({ kind: 'cell', floor: true });
    expect(picked.x + picked.y).toBeLessThan(31);
    expect(announced.at(-1)).toMatch(/Press Enter to choose this square/);
    expect(callbacks.onCursorChange).toHaveBeenCalled();
  });

  it('turns through the sides with E and picks a door with Enter', () => {
    const { canvas, callbacks } = setup({ tool: 'pick-edge' });
    press(canvas, 'ArrowUp');
    // Walk the cursor from the party at 16,15 to 16,9, under the wedged door.
    for (let i = 0; i < 6; i++) press(canvas, 'ArrowUp');
    for (let i = 0; i < 4; i++) {
      press(canvas, 'Enter');
      const last = callbacks.onPickEdge.mock.calls.at(-1)?.[0];
      if (last?.edge.key === '16,9:north') break;
      press(canvas, 'e');
    }
    expect(callbacks.onPickEdge.mock.calls.at(-1)?.[0].edge.key).toBe('16,9:north');
  });

  it('stops picking on Escape and gives the arrow keys back', () => {
    const { canvas, callbacks, parentMoves } = setup({ tool: 'pick-cell' });
    press(canvas, 'ArrowUp');
    expect(press(canvas, 'Escape')).toBe(true);
    expect(callbacks.onPickCancel).toHaveBeenCalledTimes(1);
    expect(canvas.dataset['mapCursor']).toBeUndefined();
    // Out of a picking tool, the parent's own arrow handling runs again.
    renderer?.setOptions({ tool: 'select' });
    press(canvas, 'ArrowUp');
    expect(parentMoves).toHaveBeenCalledWith('ArrowUp');
  });

  it('measures with the keyboard and states the result in words', () => {
    const { canvas, callbacks, announced } = setup({ tool: 'ruler' });
    press(canvas, 'ArrowUp');
    press(canvas, 'Enter');
    for (let i = 0; i < 6; i++) press(canvas, 'ArrowUp');
    expect(announced.at(-1)).toMatch(/^6 squares, 60 feet\./);
    press(canvas, 'Enter');
    expect(callbacks.onMeasure.mock.calls.at(-1)?.[0]).toMatchObject({ squares: 6, feet: 60 });
    expect(callbacks.onMeasureChange).toHaveBeenCalled();
  });

  it('places a pin and pings at the cursor', () => {
    const { canvas, callbacks } = setup({ tool: 'pin' });
    press(canvas, 'ArrowRight');
    press(canvas, 'ArrowRight');
    press(canvas, 'Enter');
    expect(callbacks.onPinCreate).toHaveBeenCalledWith({ x: 17.5, y: 15.5 });
    renderer?.setOptions({ tool: 'ping' });
    press(canvas, 'Enter');
    expect(callbacks.onPing).toHaveBeenCalledWith({ x: 17.5, y: 15.5 });
  });

  it('hides the cursor when the map loses focus', () => {
    const { canvas } = setup({ tool: 'pick-cell' });
    press(canvas, 'ArrowUp');
    canvas.blur();
    expect(canvas.dataset['mapCursor']).toBeUndefined();
    expect(renderer?.hasKeyboardCursor()).toBe(false);
  });
});
