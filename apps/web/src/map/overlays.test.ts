import { describe, expect, it } from 'vitest';
import { measure, measurementLabel, simplifyStroke, strokesHit } from './overlays';

describe('measure', () => {
  it('counts the orthogonal steps the party walks by default', () => {
    const m = measure({ x: 1.2, y: 1.9 }, { x: 4.7, y: 5.1 });
    expect(m).toMatchObject({ from: { x: 1, y: 1 }, to: { x: 4, y: 5 }, squares: 7, feet: 70 });
    expect(measurementLabel(m)).toBe("7 squares · 70'");
  });

  it('counts a diagonal as one square, or the straight line', () => {
    expect(measure({ x: 0, y: 0 }, { x: 3.5, y: 4.5 }, 'diagonal').squares).toBe(4);
    expect(measure({ x: 0, y: 0 }, { x: 3.5, y: 4.5 }, 'straight')).toMatchObject({ squares: 5, feet: 50 });
  });

  it('measures zero within one cell and uses the singular for one square', () => {
    expect(measure({ x: 2.1, y: 2.1 }, { x: 2.9, y: 2.8 }).squares).toBe(0);
    expect(measurementLabel(measure({ x: 0, y: 0 }, { x: 1.5, y: 0 }))).toBe("1 square · 10'");
  });
});

describe('simplifyStroke', () => {
  it('drops points on a straight line and keeps corners and ends', () => {
    const line: [number, number][] = [];
    for (let i = 0; i <= 10; i++) line.push([i, 0]);
    for (let i = 1; i <= 10; i++) line.push([10, i]);
    expect(simplifyStroke(line, 0.01)).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it('keeps wobbles larger than the tolerance and drops duplicates', () => {
    const pts: [number, number][] = [
      [0, 0],
      [0, 0],
      [1, 0.5],
      [2, 0],
    ];
    expect(simplifyStroke(pts, 0.1)).toEqual([
      [0, 0],
      [1, 0.5],
      [2, 0],
    ]);
    expect(simplifyStroke(pts, 1)).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });
});

describe('strokesHit', () => {
  const strokes = [
    {
      id: 'a',
      points: [
        [0, 0],
        [4, 0],
      ] as [number, number][],
      color: '#000',
      width: 0.2,
    },
    { id: 'b', points: [[2, 3]] as [number, number][], color: '#000', width: 0.2 },
  ];

  it('hits a stroke within the radius plus half its width', () => {
    expect(strokesHit(strokes, { x: 2, y: 0.25 }, 0.2)).toEqual(['a']);
    expect(strokesHit(strokes, { x: 2, y: 0.35 }, 0.2)).toEqual([]);
    expect(strokesHit(strokes, { x: 2.1, y: 3 }, 0.1)).toEqual(['b']);
  });
});
