import { describe, expect, it } from 'vitest';
import { placeLabels } from './RangeTrack';

describe('placeLabels', () => {
  it('leaves every label below when the groups stand far apart', () => {
    expect(placeLabels({ a: 0, b: 200 }, false)).toEqual({
      a: { above: false, maxWidth: null },
      b: { above: false, maxWidth: null },
    });
  });

  it('moves the nearer of two crowded groups above its token', () => {
    // A giant centipede at 5 feet and a medusa at 30 feet, 40 pixels apart on a phone.
    expect(placeLabels({ centipede: 100, medusa: 140 }, false)).toEqual({
      centipede: { above: true, maxWidth: null },
      medusa: { above: false, maxWidth: null },
    });
  });

  it('alternates below, above, below from the farthest of three crowded groups', () => {
    const places = placeLabels({ near: 0, middle: 50, far: 100 }, false);
    expect([places.far?.above, places.middle?.above, places.near?.above]).toEqual([false, true, false]);
  });

  it('never lets a label run into a label two groups along on the same side', () => {
    // Three groups 40 pixels apart: the nearest label has no room below or above, so it truncates below.
    const places = placeLabels({ near: 0, middle: 40, far: 80 }, false);
    expect(places).toEqual({
      far: { above: false, maxWidth: null },
      middle: { above: true, maxWidth: null },
      near: { above: false, maxWidth: 72 },
    });
  });

  it('truncates a crowded label to the gap on a compact track, where nothing fits above', () => {
    expect(placeLabels({ centipede: 100, medusa: 140 }, true).centipede).toEqual({
      above: false,
      maxWidth: 32,
    });
  });
});
