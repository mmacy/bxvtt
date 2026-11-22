import type { ReactNode } from 'react';

/**
 * Original game icons drawn on the lucide grid: a 24 unit view box, 2 unit padding, round caps
 * and joins, and no fills. They inherit stroke width and color from the parent `<svg>`, so they
 * sit beside lucide interface icons without a visible change in style.
 */

function polygonPoints(
  cx: number,
  cy: number,
  r: number,
  sides: number,
  startDeg = -90,
): Array<[number, number]> {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((startDeg + (360 / sides) * i) * Math.PI) / 180;
    return [Number((cx + r * Math.cos(a)).toFixed(2)), Number((cy + r * Math.sin(a)).toFixed(2))];
  });
}

function pathFrom(points: Array<[number, number]>, close = true): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + (close ? ' Z' : '');
}

const d12Outer = polygonPoints(12, 12, 9.75, 10);
const d12Inner = polygonPoints(12, 12.4, 5, 5);
const d12Spokes = d12Inner
  .map(([x, y], i) => {
    const outer = d12Outer[i * 2];
    return outer ? `M${x} ${y} L${outer[0]} ${outer[1]}` : '';
  })
  .join(' ');

const hex = polygonPoints(12, 12, 9.75, 6);
const d20Inner: Array<[number, number]> = [
  [12, 7.4],
  [16.4, 15],
  [7.6, 15],
];

function hexPoint(i: number): [number, number] {
  return hex[i] ?? [12, 12];
}

export const gameIconNodes = {
  'class-cleric': (
    <>
      <path d="M8.5 2.5 12 7l3.5-4.5" />
      <circle cx="12" cy="14" r="7" />
      <path d="M12 10.5v7M8.75 13.5h6.5" />
    </>
  ),
  'class-dwarf': (
    <>
      <path d="M5 10.5a7 7 0 0 1 14 0" />
      <path d="M3.5 10.5h17" />
      <path d="M12 3.5v7" />
      <path d="M6 10.5v3a6 8 0 0 0 12 0v-3" />
      <path d="M8.5 15c1.6 0 2.5-1 3.5-1s1.9 1 3.5 1" />
      <path d="M12 16.5v4" />
    </>
  ),
  'class-elf': (
    <>
      <path d="M4 20c0-9 6-15.5 16-16-.5 10-6.5 16-16 16Z" />
      <path d="M4 20 15 9" />
      <path d="M9 15h4.5M12 12V8" />
    </>
  ),
  'class-fighter': (
    <>
      <path d="M5 21V9.5C5 5.4 8.1 3 12 3s7 2.4 7 6.5V21Z" />
      <path d="M7.5 11h9" />
      <path d="M12 11v7" />
    </>
  ),
  'class-halfling': (
    <>
      <path d="M3.5 12.5h7v3a3.5 3.5 0 0 1-7 0Z" />
      <path d="M10.5 14.5 20.5 11" />
      <path d="M5.5 9c-1-1.2.8-2.3 0-4M8.5 9c-1-1.2.8-2.3 0-4" />
    </>
  ),
  'class-magic-user': (
    <>
      <path d="M7 17 10.5 6.5C11.2 4.4 12.6 3 15 2.5c-1.2 1.6-1.4 3.4-.8 5.2L17 17" />
      <path d="M3 18.5c0-1.4 4-2.5 9-2.5s9 1.1 9 2.5-4 2.5-9 2.5-9-1.1-9-2.5Z" />
      <path d="m12.5 9.5.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6Z" />
    </>
  ),
  'class-thief': (
    <>
      <path d="M2.5 10c0-1.6 1.6-2.6 3.6-2.6 2 0 3.9 1 5.9 1s3.9-1 5.9-1c2 0 3.6 1 3.6 2.6 0 3.2-2.2 6-5.2 6-1.9 0-2.9-1.5-4.3-1.5s-2.4 1.5-4.3 1.5c-3 0-5.2-2.8-5.2-6Z" />
      <path d="M5.75 11.4q1.6-1.5 3.5 0q-1.75 1-3.5 0Z" />
      <path d="M14.75 11.4q1.75-1.5 3.5 0q-1.75 1-3.5 0Z" />
    </>
  ),
  'weapon-mace': (
    <>
      <path d="M4 20.5 12.5 12" />
      <path d="M3 19.5l1.5 1.5" />
      <circle cx="15.5" cy="8.5" r="3.5" />
      <path d="M15.5 2.5V5M21.5 8.5H19M19.75 4.25 18 6M11.25 4.25 13 6M19.75 12.75 18 11" />
    </>
  ),
  'weapon-dagger': (
    <>
      <path d="M12 2.5 14 6v8.5h-4V6Z" />
      <path d="M7.5 14.5h9" />
      <path d="M12 14.5v4.5" />
      <circle cx="12" cy="20.5" r="1.25" />
    </>
  ),
  'weapon-spear': (
    <>
      <path d="M3.5 20.5 15.5 8.5" />
      <path d="M15 9 16.2 4.8 21 3l-1.8 4.8Z" />
      <path d="M5.5 16.5l2 2" />
    </>
  ),
  'armour-leather': (
    <>
      <path d="M8 3 4 6v5l2 1v9h12v-9l2-1V6l-4-3c-1 2-2.5 3-4 3s-3-1-4-3Z" />
      <path d="M12 8v10" />
      <path d="M10.5 10.5h3M10.5 13.5h3M10.5 16.5h3" />
    </>
  ),
  'armour-chain': (
    <>
      <path d="M8 3 4 6v5l2 1v9h12v-9l2-1V6l-4-3c-1 2-2.5 3-4 3s-3-1-4-3Z" />
      <path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h7" strokeDasharray="0.01 2.33" />
    </>
  ),
  'armour-plate': (
    <>
      <path d="M5 5.5C8 4 10 3 12 3s4 1 7 2.5l-1 7.5c-.6 4-2.8 6.8-6 8-3.2-1.2-5.4-4-6-8Z" />
      <path d="M12 3v18" />
      <path d="M6.5 13c3.5 1.6 7.5 1.6 11 0" />
    </>
  ),
  'door-secret': (
    <>
      <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" strokeDasharray="2.6 2.4" />
      <path d="M2.5 21h19" />
      <path d="M13.5 9.5c-.4-.7-1-1-1.7-1-1 0-1.8.6-1.8 1.5 0 2 3.6 1.4 3.6 3.5 0 .9-.8 1.5-1.8 1.5-.8 0-1.5-.4-1.8-1.1" />
    </>
  ),
  stairs: (
    <>
      <path d="M3 20.5h4.5v-4h4.5v-4h4.5v-4H21" />
      <path d="M3 20.5h18v-12" />
    </>
  ),
  trap: (
    <>
      <path d="M2 8h3.5M18.5 8H22" />
      <path d="M5.5 8h13" strokeDasharray="1.5 2" />
      <path d="M5.5 8v12.5h13V8" />
      <path d="M7.5 20.5l1.75-5.5 1.75 5.5 1.75-5.5 1.75 5.5 1.75-5.5 1.75 5.5" />
    </>
  ),
  chest: (
    <>
      <path d="M3 11h18v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5Z" />
      <path d="M3 11V8.5A4.5 4.5 0 0 1 7.5 4h9A4.5 4.5 0 0 1 21 8.5V11" />
      <path d="M7 4.5V21M17 4.5V21" />
      <path d="M10.5 9.5h3v4h-3Z" />
    </>
  ),
  torch: (
    <>
      <path d="M10.5 22 9 12.5h6L13.5 22Z" />
      <path d="M9.4 15.25h5.2" />
      <path d="M12 2c1.6 2 3.5 3.6 3.5 6.2a3.5 3.5 0 0 1-7 0c0-1.5.8-2.6 1.5-3.4.2 1 .8 1.6 1.5 1.8-.5-1.8-.2-3.2.5-4.6Z" />
    </>
  ),
  lantern: (
    <>
      <path d="M10 4.5a2 2 0 0 1 4 0" />
      <path d="M8 7.5h8l-1.2-3H9.2Z" />
      <path d="M8.5 7.5v9.5M15.5 7.5v9.5" />
      <path d="M7 17h10v2.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5Z" />
      <path d="M12 10c1 1.2 1.5 2.1 1.5 3a1.5 1.5 0 0 1-3 0c0-.9.5-1.8 1.5-3Z" />
    </>
  ),
  ring: (
    <>
      <circle cx="12" cy="15.5" r="5.5" />
      <path d="M9.5 6.5 11 4h2l1.5 2.5L12 10Z" />
    </>
  ),
  d4: (
    <>
      <path d="M12 2.75 21.5 19.5h-19Z" />
      <path d="M12 2.75v11.5M12 14.25 2.5 19.5M12 14.25l9.5 5.25" />
    </>
  ),
  d6: (
    <>
      <path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5Z" />
      <path d="M3.5 7.25 12 12l8.5-4.75M12 12v9.5" />
    </>
  ),
  d8: (
    <>
      <path d={pathFrom(hex)} />
      <path d={pathFrom([hexPoint(0), hexPoint(2), hexPoint(4)])} />
    </>
  ),
  d10: (
    <>
      <path d="M12 2.5 21.25 10.5 12 21.5 2.75 10.5Z" />
      <path d="M12 2.5 8 12.25l4 2.5 4-2.5Z" />
      <path d="M2.75 10.5 8 12.25M21.25 10.5 16 12.25M12 14.75v6.75" />
    </>
  ),
  d12: (
    <>
      <path d={pathFrom(d12Outer)} />
      <path d={pathFrom(d12Inner)} />
      <path d={d12Spokes} />
    </>
  ),
  d20: (
    <>
      <path d={pathFrom(hex)} />
      <path d={pathFrom(d20Inner)} />
      <path
        d={[
          `M${d20Inner[0]?.join(' ')} L${hexPoint(0).join(' ')}`,
          `M${d20Inner[0]?.join(' ')} L${hexPoint(1).join(' ')}`,
          `M${d20Inner[0]?.join(' ')} L${hexPoint(5).join(' ')}`,
          `M${d20Inner[1]?.join(' ')} L${hexPoint(1).join(' ')}`,
          `M${d20Inner[1]?.join(' ')} L${hexPoint(2).join(' ')}`,
          `M${d20Inner[1]?.join(' ')} L${hexPoint(3).join(' ')}`,
          `M${d20Inner[2]?.join(' ')} L${hexPoint(3).join(' ')}`,
          `M${d20Inner[2]?.join(' ')} L${hexPoint(4).join(' ')}`,
          `M${d20Inner[2]?.join(' ')} L${hexPoint(5).join(' ')}`,
        ].join(' ')}
      />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type DrawnGameIconName = keyof typeof gameIconNodes;
