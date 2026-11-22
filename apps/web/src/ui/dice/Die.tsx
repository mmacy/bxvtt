import type { CSSProperties } from 'react';
import { cx } from '../lib/cx';
import { isPlayerColorId, playerColorHex } from '../tokens';
import { dieGeometry, facetLight, pointsAttr, type DieSides } from './geometry';
import styles from './Die.module.css';

export type { DieSides } from './geometry';

export interface DieProps {
  sides: DieSides;
  /** The face to show. Leave it out to draw a blank die, as in a dice picker. */
  value?: number;
  /** Size in pixels. Defaults to 48. */
  size?: number;
  /** Player color id or CSS color for the numerals, like crayon rubbed into the digits. */
  color?: string;
  /** Glows for the highest face and dims for a 1. */
  highlight?: 'max' | 'min';
  /** Hides the die from assistive technology. DiceRoll uses this and announces the result itself. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

function crayon(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return isPlayerColorId(color) ? playerColorHex(color) : color;
}

function SingleDie({
  sides,
  label,
  size,
  ink,
  highlight,
}: {
  sides: Exclude<DieSides, 100>;
  /** Text on the face. Undefined draws a blank die. */
  label: string | undefined;
  size: number;
  ink: string | undefined;
  highlight: 'max' | 'min' | undefined;
}) {
  const g = dieGeometry[sides];
  const blank = label === undefined;
  const text = blank ? (sides === 6 ? '' : `d${sides}`) : label;
  // Underline 6 and 9 so they read correctly on dice that can show both.
  const underline = (label === '6' || label === '9') && sides !== 6;
  const fontSize = blank ? g.label.size * 0.5 : text.length > 1 ? g.label.size * 0.82 : g.label.size;
  return (
    <svg
      viewBox="-4 -4 108 108"
      width={size}
      height={size}
      className={cx(styles.svg, highlight && styles[highlight])}
      style={ink ? ({ '--die-crayon': ink } as CSSProperties) : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <polygon points={pointsAttr(g.outline)} className={styles.outline} />
      {g.facets.map((facet, i) => {
        const light = facetLight(facet);
        const tone = light > 0.3 ? styles.facetLight : light < -0.3 ? styles.facetDark : styles.facetMid;
        return <polygon key={i} points={pointsAttr(facet)} className={cx(styles.facet, tone)} />;
      })}
      <polygon points={pointsAttr(g.face)} className={styles.face} />
      <polygon points={pointsAttr(g.outline)} className={styles.edge} />
      {text && (
        <text
          x={g.label.x}
          y={g.label.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          className={cx(styles.numeral, blank && styles.blankLabel)}
        >
          {text}
        </text>
      )}
      {underline && (
        <line
          x1={g.label.x - fontSize * 0.26}
          x2={g.label.x + fontSize * 0.26}
          y1={g.label.y + fontSize * 0.5}
          y2={g.label.y + fontSize * 0.5}
          className={styles.underline}
          strokeWidth={fontSize * 0.08}
        />
      )}
    </svg>
  );
}

/** A polyhedral die drawn in SVG: d4, d6, d8, d10, d12, d20, or d100 (a pair of d10s). */
export function Die({
  sides,
  value,
  size = 48,
  color,
  highlight,
  decorative = false,
  className,
  style,
}: DieProps) {
  const ink = crayon(color);
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': value === undefined ? `d${sides}` : `d${sides} showing ${value}` };
  if (sides === 100) {
    const tens = value === undefined ? undefined : value === 100 ? 0 : Math.floor(value / 10) * 10;
    const units = value === undefined ? undefined : value % 10;
    return (
      <span className={cx(styles.die, styles.pair, className)} style={style} {...a11y}>
        <SingleDie
          sides={10}
          label={tens === undefined ? undefined : tens === 0 ? '00' : String(tens)}
          size={size}
          ink={ink}
          highlight={highlight}
        />
        <SingleDie
          sides={10}
          label={units === undefined ? undefined : String(units)}
          size={size}
          ink={ink}
          highlight={highlight}
        />
      </span>
    );
  }
  return (
    <span className={cx(styles.die, className)} style={style} {...a11y}>
      <SingleDie
        sides={sides}
        label={value === undefined ? undefined : String(value)}
        size={size}
        ink={ink}
        highlight={highlight}
      />
    </span>
  );
}
