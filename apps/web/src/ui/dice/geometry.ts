export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;
export type Point = [number, number];

export interface DieGeometry {
  /** Silhouette of the die. */
  outline: Point[];
  /** The face that shows the number. */
  face: Point[];
  /** The visible side facets around the face. */
  facets: Point[][];
  /** Where the number sits, and its size relative to the 100 unit view box. */
  label: { x: number; y: number; size: number };
}

function polygon(cx: number, cy: number, r: number, sides: number, startDeg = -90): Point[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((startDeg + (360 / sides) * i) * Math.PI) / 180;
    return [Number((cx + r * Math.cos(a)).toFixed(2)), Number((cy + r * Math.sin(a)).toFixed(2))] as Point;
  });
}

function at<T>(list: T[], index: number): T {
  const value = list[((index % list.length) + list.length) % list.length];
  if (value === undefined) throw new Error('Empty polygon');
  return value;
}

const hex = polygon(50, 50, 46, 6);
const d20Face: Point[] = [
  [50, 15],
  [81, 68.5],
  [19, 68.5],
];
const decagon = polygon(50, 51, 46, 10);
const pentagon = polygon(50, 53, 30, 5);

export const dieGeometry: Record<Exclude<DieSides, 100>, DieGeometry> = {
  4: {
    outline: [
      [50, 6],
      [95, 86],
      [5, 86],
    ],
    face: [
      [50, 18],
      [82, 76],
      [18, 76],
    ],
    facets: [
      [
        [50, 6],
        [50, 18],
        [18, 76],
        [5, 86],
      ],
      [
        [50, 6],
        [95, 86],
        [82, 76],
        [50, 18],
      ],
      [
        [5, 86],
        [18, 76],
        [82, 76],
        [95, 86],
      ],
    ],
    label: { x: 50, y: 59, size: 40 },
  },
  6: {
    outline: [
      [8, 8],
      [92, 8],
      [92, 92],
      [8, 92],
    ],
    face: [
      [17, 17],
      [83, 17],
      [83, 83],
      [17, 83],
    ],
    facets: [
      [
        [8, 8],
        [92, 8],
        [83, 17],
        [17, 17],
      ],
      [
        [92, 8],
        [92, 92],
        [83, 83],
        [83, 17],
      ],
      [
        [92, 92],
        [8, 92],
        [17, 83],
        [83, 83],
      ],
      [
        [8, 92],
        [8, 8],
        [17, 17],
        [17, 83],
      ],
    ],
    label: { x: 50, y: 51, size: 58 },
  },
  8: {
    outline: hex,
    face: [at(hex, 0), at(hex, 2), at(hex, 4)],
    facets: [
      [at(hex, 0), at(hex, 1), at(hex, 2)],
      [at(hex, 2), at(hex, 3), at(hex, 4)],
      [at(hex, 4), at(hex, 5), at(hex, 0)],
    ],
    label: { x: 50, y: 52, size: 42 },
  },
  10: {
    outline: [
      [50, 4],
      [95, 47],
      [50, 96],
      [5, 47],
    ],
    face: [
      [50, 4],
      [78, 56],
      [50, 72],
      [22, 56],
    ],
    facets: [
      [
        [50, 4],
        [22, 56],
        [5, 47],
      ],
      [
        [50, 4],
        [95, 47],
        [78, 56],
      ],
      [
        [5, 47],
        [22, 56],
        [50, 72],
        [50, 96],
      ],
      [
        [95, 47],
        [78, 56],
        [50, 72],
        [50, 96],
      ],
    ],
    label: { x: 50, y: 44, size: 38 },
  },
  12: {
    outline: decagon,
    face: pentagon,
    facets: pentagon.map((_, i) => [
      at(pentagon, i),
      at(decagon, i * 2),
      at(decagon, i * 2 + 1),
      at(decagon, i * 2 + 2),
      at(pentagon, i + 1),
    ]),
    label: { x: 50, y: 55, size: 36 },
  },
  20: {
    outline: hex,
    face: d20Face,
    facets: [
      [at(hex, 0), at(hex, 1), at(d20Face, 0)],
      [at(hex, 1), at(d20Face, 1), at(d20Face, 0)],
      [at(hex, 1), at(hex, 2), at(d20Face, 1)],
      [at(hex, 2), at(hex, 3), at(d20Face, 1)],
      [at(hex, 3), at(d20Face, 2), at(d20Face, 1)],
      [at(hex, 3), at(hex, 4), at(d20Face, 2)],
      [at(hex, 4), at(hex, 5), at(d20Face, 2)],
      [at(hex, 5), at(d20Face, 0), at(d20Face, 2)],
      [at(hex, 5), at(hex, 0), at(d20Face, 0)],
    ],
    label: { x: 50, y: 51, size: 40 },
  },
};

export function pointsAttr(points: Point[]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ');
}

/**
 * Light comes from the upper left. Returns how much a facet faces the light, from -1 (away)
 * to 1 (toward), based on the direction from the die's center to the facet's center.
 */
export function facetLight(points: Point[], center: Point = [50, 50]): number {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const dx = cx - center[0];
  const dy = cy - center[1];
  const length = Math.hypot(dx, dy) || 1;
  return (dx * -0.55 + dy * -0.83) / length;
}
