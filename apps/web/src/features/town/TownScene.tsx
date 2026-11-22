/**
 * A drawn view of a village on the water at dusk: hills, a bell tower, thatched roofs with lit windows, a ferry
 * landing, and a moon. It is inline SVG that uses only the kit's color roles, so it follows the theme. It
 * decorates the masthead and carries no information, so assistive technology skips it.
 */
import styles from './TownScene.module.css';

interface House {
  x: number;
  width: number;
  height: number;
  roof: number;
  lit: number[];
  chimney?: boolean;
}

const HOUSES: House[] = [
  { x: 30, width: 64, height: 34, roof: 26, lit: [0], chimney: true },
  { x: 104, width: 48, height: 26, roof: 22, lit: [] },
  { x: 168, width: 78, height: 40, roof: 30, lit: [0, 1] },
  { x: 262, width: 54, height: 30, roof: 24, lit: [0] },
  { x: 440, width: 70, height: 38, roof: 28, lit: [1], chimney: true },
  { x: 524, width: 52, height: 28, roof: 22, lit: [0] },
  { x: 700, width: 66, height: 34, roof: 26, lit: [0, 1], chimney: true },
  { x: 780, width: 50, height: 26, roof: 22, lit: [] },
  { x: 846, width: 80, height: 42, roof: 32, lit: [0] },
  { x: 1090, width: 60, height: 32, roof: 24, lit: [1] },
];

const GROUND = 146;

function houseShapes(house: House, index: number) {
  const top = GROUND - house.height;
  const left = house.x;
  const right = house.x + house.width;
  const middle = house.x + house.width / 2;
  return (
    <g key={`house-${index}`}>
      {house.chimney && (
        <rect className={styles.near} x={right - 16} y={top - house.roof - 6} width="8" height="18" />
      )}
      <rect className={styles.near} x={left} y={top} width={house.width} height={house.height + 4} />
      <path
        className={styles.near}
        d={`M${left - 6} ${top + 2} L${middle} ${top - house.roof} L${right + 6} ${top + 2} Z`}
      />
      {house.lit.map((slot) => (
        <rect
          key={slot}
          className={styles.window}
          x={left + 10 + slot * 22}
          y={top + 10}
          width="9"
          height="11"
          rx="1"
        />
      ))}
    </g>
  );
}

const STARS: Array<[number, number, number]> = [
  [90, 24, 1.2],
  [210, 52, 1],
  [330, 18, 1.4],
  [470, 44, 1],
  [560, 14, 1.2],
  [760, 30, 1],
  [860, 16, 1.4],
  [1060, 22, 1],
  [1150, 56, 1.2],
  [640, 60, 0.9],
];

/** The masthead's background scene. */
export function TownScene({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `${styles.scene} ${className}` : styles.scene}
      viewBox="0 0 1200 180"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="town-dusk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles.skyTop} />
          <stop offset="1" className={styles.skyGlow} />
        </linearGradient>
      </defs>
      <rect className={styles.sky} x="0" y="0" width="1200" height="180" />
      {STARS.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} className={styles.star} cx={x} cy={y} r={r} />
      ))}
      <circle className={styles.halo} cx="1000" cy="52" r="46" />
      <circle className={styles.moon} cx="1000" cy="52" r="20" />
      <circle className={styles.moonShade} cx="1008" cy="47" r="18" />

      <path
        className={styles.far}
        d="M0 128 C120 88 240 118 380 100 S640 72 780 104 S1060 90 1200 106 L1200 180 L0 180 Z"
      />
      <path
        className={styles.mid}
        d="M0 142 C160 118 300 140 470 128 S760 110 920 134 S1120 126 1200 130 L1200 180 L0 180 Z"
      />

      {HOUSES.map(houseShapes)}

      <g transform="translate(80 0)">
        <rect className={styles.near} x="606" y="52" width="38" height="96" />
        <path className={styles.near} d="M600 56 L625 18 L650 56 Z" />
        <rect className={styles.near} x="621" y="8" width="8" height="12" />
        <path className={styles.archway} d="M614 78 h22 v22 a11 11 0 0 1 -22 0 Z" />
        <path
          className={styles.bell}
          d="M625 82 c-6 0 -8 7 -8 12 c0 4 -3 5 -3 7 h22 c0 -2 -3 -3 -3 -5 c0 -5 -2 -14 -8 -14 Z"
        />
        <rect className={styles.window} x="620" y="116" width="10" height="14" rx="1" />
      </g>

      <path className={styles.water} d="M0 146 H1200 V180 H0 Z" />
      <g className={styles.ripples}>
        <path d="M40 160 q12 -5 24 0 t24 0" />
        <path d="M300 168 q14 -5 28 0 t28 0" />
        <path d="M560 158 q14 -5 28 0 t28 0" />
        <path d="M820 170 q14 -5 28 0 t28 0" />
        <path d="M1040 160 q12 -5 24 0 t24 0" />
      </g>

      <g>
        <path className={styles.near} d="M950 150 q40 14 110 0 l-10 14 q-45 8 -90 0 Z" />
        <rect className={styles.near} x="1004" y="112" width="3" height="40" />
        <path className={styles.near} d="M1005 114 L1040 140 H1005 Z" opacity="0.8" />
        <circle className={styles.lantern} cx="940" cy="132" r="9" />
        <circle className={styles.lanternCore} cx="940" cy="132" r="3.5" />
        <rect className={styles.near} x="938.5" y="134" width="3" height="16" />
      </g>
    </svg>
  );
}
