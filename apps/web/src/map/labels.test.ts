import { describe, expect, it } from 'vitest';
import { fixture } from './fixtures/fixtures';
import { LabelObstacles, fitLabel, labelSpot, labelSpotsRanked, placeLabels, splitInTwo } from './labels';
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

describe('labelSpotsRanked', () => {
  const view = fixture('showcase-explored').view;

  it('still finds room when the only known cell of an area holds a feature', () => {
    // The party knows one cell of the area, and a feature stands on it, as at the priory's gatehouse stair.
    const map = fromPlayerView(view, undefined, {
      extras: {
        areas: [{ id: 'stair', name: 'Gatehouse stair', cells: [[16, 15]] }],
        features: [{ id: 'statue', kind: 'custom', x: 16, y: 15 }],
      },
    });
    if (!map) throw new Error('no map');
    const scene = new Scene(map);
    const area = map.areas[0];
    if (!area) throw new Error('no area');
    const [spot] = labelSpotsRanked(scene, area);
    expect(spot).toMatchObject({ x: 16.5, y: 15.5, inside: 1 });
    // The name may run two cells past the cell on each side, over the corridor walls.
    expect(spot?.width).toBe(5);
  });
});

describe('placeLabels', () => {
  const none = () => [];

  it('takes the first candidate that overlaps nothing', () => {
    const placed = placeLabels(
      [
        {
          id: 'a',
          width: 2,
          height: 0.5,
          candidates: [
            { x: 5, y: 5 },
            { x: 5, y: 4 },
          ],
        },
      ],
      none,
      [{ x0: 4.6, y0: 4.6, x1: 5.4, y1: 5.4 }],
    );
    // The token covers the first spot, so the label moves to the row above.
    expect(placed.get('a')).toEqual({ x: 5, y: 4 });
  });

  it('keeps a label off a door and off a label placed before it', () => {
    const door = { x0: 4, y0: 2.85, x1: 6, y1: 3.15 };
    const placed = placeLabels(
      [
        { id: 'first', width: 3, height: 0.6, candidates: [{ x: 5, y: 5 }] },
        {
          id: 'second',
          width: 3,
          height: 0.6,
          candidates: [
            { x: 5.5, y: 5 },
            { x: 5, y: 3 },
            { x: 5, y: 6 },
          ],
        },
      ],
      (r) => (r.y0 < door.y1 && r.y1 > door.y0 ? [door] : []),
      [],
    );
    expect(placed.get('first')).toEqual({ x: 5, y: 5 });
    expect(placed.get('second')).toEqual({ x: 5, y: 6 });
  });

  it('takes the least overlap when nothing is clear', () => {
    const wall = { x0: 0, y0: 0, x1: 10, y1: 10 };
    const placed = placeLabels(
      [
        {
          id: 'a',
          width: 2,
          height: 2,
          candidates: [
            { x: 5, y: 5 },
            { x: 0, y: 0 },
          ],
        },
      ],
      () => [wall],
      [],
    );
    expect(placed.get('a')).toEqual({ x: 0, y: 0 });
  });
});

describe('LabelObstacles', () => {
  it('marks doors, an open door’s leaf, and symbol cells', () => {
    const explored = fixture('showcase-explored');
    const map = fromPlayerView(explored.view);
    if (!map) throw new Error('no map');
    const obstacles = new LabelObstacles(new Scene(map));
    // The wedged, open door on the north side of 16,9: its bar on the edge and its leaf below it.
    expect(obstacles.near({ x0: 16.4, y0: 8.9, x1: 16.6, y1: 9.1 }).length).toBeGreaterThan(0);
    expect(obstacles.near({ x0: 16.2, y0: 9.2, x1: 16.3, y1: 9.4 }).some((r) => r.y1 > 9.3)).toBe(true);
    // The dropped pile's cell at 6,9.
    expect(
      obstacles.near({ x0: 6.4, y0: 9.4, x1: 6.6, y1: 9.6 }).some((r) => r.x0 <= 6.4 && r.x1 >= 6.6),
    ).toBe(true);
  });
});
