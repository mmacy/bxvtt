import { describe, expect, it } from 'vitest';
import { fixture } from './fixtures/fixtures';
import { fitLabel, labelSpot, splitInTwo } from './labels';
import { fromPlayerView } from './model';
import { Scene } from './scene';

/** A fake measure: every character is `px * 0.5` wide. */
const measure = (text: string, px: number) => text.length * px * 0.5;

describe('fitLabel', () => {
  it('keeps a name that fits on one line at the full size', () => {
    expect(fitLabel('Crypt', 100, measure, { px: 12, minPx: 9 }, true)).toEqual({ lines: ['Crypt'], px: 12 });
  });

  it('wraps a long name onto two balanced lines before it shrinks it', () => {
    // "Foot of the night stair" is 23 characters: 138 wide at 12, too wide for 90.
    expect(fitLabel('Foot of the night stair', 90, measure, { px: 12, minPx: 9 }, true)).toEqual({
      lines: ['Foot of the', 'night stair'],
      px: 12,
    });
  });

  it('shrinks when two lines aren’t allowed, and cuts with an ellipsis only at the smallest size', () => {
    expect(fitLabel('Foot of the night stair', 110, measure, { px: 12, minPx: 9 }, false)).toEqual({
      lines: ['Foot of the night stair'],
      px: 9,
    });
    const cut = fitLabel('Foot of the night stair', 60, measure, { px: 12, minPx: 9 }, false);
    expect(cut.px).toBe(9);
    expect(cut.lines[0]?.endsWith('…')).toBe(true);
    expect(measure(cut.lines[0] ?? '', 9)).toBeLessThanOrEqual(60);
  });

  it('splits at the space that balances the lines', () => {
    expect(splitInTwo('The House of the Second Dawn', (s) => s.length)).toEqual([
      'The House of',
      'the Second Dawn',
    ]);
    expect(splitInTwo('Vestibule', (s) => s.length)).toBeNull();
  });
});

describe('labelSpot', () => {
  const view = fixture('showcase-explored').view;
  const withAreas = (areas: { id: string; name: string; cells: [number, number][] }[], extras = {}) =>
    new Scene(
      fromPlayerView(view, undefined, { extras: { areas, ...extras } }) ??
        (() => {
          throw new Error('no map');
        })(),
    );

  it('centres the label on the widest run of the area’s cells', () => {
    // The pillared hall is 8 cells wide (13 to 20) and 6 tall (9 to 14).
    const cells: [number, number][] = [];
    for (let y = 9; y <= 14; y++) for (let x = 13; x <= 20; x++) cells.push([x, y]);
    const scene = withAreas([{ id: 'hall', name: 'Pillared hall', cells }]);
    const area = scene.map.areas[0];
    if (!area) throw new Error('no area');
    const spot = labelSpot(scene, area);
    expect(spot.x).toBe(17);
    expect(spot.width).toBeGreaterThanOrEqual(8);
  });

  it('keeps the label’s run clear of a feature in the area', () => {
    // One row of the pillared hall, 13 to 20 at y = 12, with a stair glyph at 15,12.
    const cells: [number, number][] = [13, 14, 15, 16, 17, 18, 19, 20].map((x) => [x, 12]);
    const scene = withAreas([{ id: 'row', name: 'A long row', cells }], {
      transitions: [{ kind: 'stairs_down', x: 15, y: 12 }],
    });
    const area = scene.map.areas[0];
    if (!area) throw new Error('no area');
    const spot = labelSpot(scene, area);
    // The run 16 to 20 is longer than 13 to 14, and the label stops short of the stairs at 15.
    expect(spot.x).toBe(18.5);
    expect(spot.x - spot.width / 2).toBeGreaterThanOrEqual(16);
  });
});
