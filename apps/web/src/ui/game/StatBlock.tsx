import type { CSSProperties } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { coinColors, type CoinKind } from '../tokens';
import styles from './StatBlock.module.css';

/** Formats a modifier for display: "+1", "−2" (with a true minus sign), or "0". */
export function formatModifier(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '0';
}

export interface StatBoxProps {
  /** Short label, such as "STR". */
  abbreviation: string;
  /** Full name for assistive technology, such as "Strength". */
  name: string;
  score: number;
  /** The modifier bxapi reports for the score. Leave it out to hide the modifier. */
  modifier?: number;
  /** Marks a prime requisite. */
  prime?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** An ability score with its modifier, as on a character sheet. */
export function StatBox({
  abbreviation,
  name,
  score,
  modifier,
  prime = false,
  size = 'md',
  className,
}: StatBoxProps) {
  const label = `${name} ${score}${modifier !== undefined ? `, modifier ${formatModifier(modifier)}` : ''}${prime ? ', prime requisite' : ''}`;
  return (
    <div
      className={cx(styles.stat, styles[size], prime && styles.prime, className)}
      role="group"
      aria-label={label}
    >
      <span className={styles.abbr} aria-hidden="true">
        {abbreviation}
      </span>
      <span className={styles.score} aria-hidden="true">
        {score}
      </span>
      {modifier !== undefined && (
        <span
          className={cx(styles.modifier, modifier > 0 && styles.positive, modifier < 0 && styles.negative)}
          aria-hidden="true"
        >
          {formatModifier(modifier)}
        </span>
      )}
    </div>
  );
}

export interface HpBarProps {
  current: number;
  max: number;
  /** Accessible name. Defaults to "Hit points". */
  label?: string;
  /** Shows "current / max" beside the bar. */
  showValue?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Hit points as a bar. The fill turns from green to ochre to red as hit points fall, and a pale
 * trail shows the size of the last hit before it drains away.
 */
export function HpBar({
  current,
  max,
  label = 'Hit points',
  showValue = true,
  size = 'md',
  className,
}: HpBarProps) {
  const safeMax = Math.max(1, max);
  const pct = Math.max(0, Math.min(100, (current / safeMax) * 100));
  const tone = current <= 0 ? 'down' : pct <= 25 ? 'low' : pct <= 50 ? 'hurt' : 'healthy';
  return (
    <div className={cx(styles.hp, styles[`hp-${size}`], className)}>
      <div
        className={cx(styles.track, styles[tone])}
        role="meter"
        aria-label={label}
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={`${current} of ${max}`}
      >
        <span className={styles.trail} style={{ width: `${pct}%` }} />
        <span className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      {showValue && (
        <span className={styles.hpValue} aria-hidden="true">
          <span className={styles.hpCurrent}>{current}</span>
          <span className={styles.hpSlash}>/</span>
          {max}
        </span>
      )}
    </div>
  );
}

export interface AcShieldProps {
  value: number;
  /** Accessible name. Defaults to "Armour class". */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Armour class on a heater shield. */
export function AcShield({ value, label = 'Armour class', size = 'md', className }: AcShieldProps) {
  return (
    <span
      className={cx(styles.ac, styles[`ac-${size}`], className)}
      role="img"
      aria-label={`${label} ${value}`}
    >
      <svg viewBox="0 0 40 46" aria-hidden="true" focusable="false">
        <path
          className={styles.acBody}
          d="M3 4.5C9 4.5 15 3 20 1c5 2 11 3.5 17 3.5V20c0 11-7.2 19.4-17 24.5C10.2 39.4 3 31 3 20Z"
        />
        <path
          className={styles.acInner}
          d="M7 8c5 0 9.5-1 13-2.6C23.5 7 28 8 33 8v12c0 8.6-5.4 15.6-13 20-7.6-4.4-13-11.4-13-20Z"
        />
      </svg>
      <span className={styles.acValue} aria-hidden="true">
        {value < 0 ? `\u2212${Math.abs(value)}` : value}
      </span>
      <span className={styles.acLabel} aria-hidden="true">
        AC
      </span>
    </span>
  );
}

const coinOrder: CoinKind[] = ['pp', 'gp', 'ep', 'sp', 'cp'];
const coinNames: Record<CoinKind, string> = {
  pp: 'platinum',
  gp: 'gold',
  ep: 'electrum',
  sp: 'silver',
  cp: 'copper',
};

export interface CoinPurseProps {
  coins: Partial<Record<CoinKind, number>>;
  /** Shows metals with zero coins. Defaults to false. */
  showEmpty?: boolean;
  layout?: 'row' | 'stack';
  className?: string;
}

/** Coins by metal, in B/X order from platinum to copper. */
export function CoinPurse({ coins, showEmpty = false, layout = 'row', className }: CoinPurseProps) {
  const entries = coinOrder.filter((kind) => showEmpty || (coins[kind] ?? 0) > 0);
  if (entries.length === 0) {
    return <span className={cx(styles.purseEmpty, className)}>No coins</span>;
  }
  return (
    <ul className={cx(styles.purse, styles[`purse-${layout}`], className)} aria-label="Coins">
      {entries.map((kind) => {
        const count = coins[kind] ?? 0;
        return (
          <li key={kind} className={cx(styles.coin, count === 0 && styles.coinEmpty)}>
            {/* The disc paints its letter with generated content, so the letter stays out of the text. */}
            <span
              className={styles.disc}
              style={{ '--coin': coinColors[kind] } as CSSProperties}
              data-letter={kind.charAt(0)}
              aria-hidden="true"
            />
            <span className={styles.coinCount}>{count.toLocaleString('en-US')}</span>{' '}
            <span className={styles.coinUnit}>
              {kind}
              <span className="visually-hidden"> ({coinNames[kind]})</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export type ConditionTone = 'harm' | 'boon' | 'magic' | 'neutral';

export interface ConditionChipProps {
  label: string;
  tone?: ConditionTone;
  icon?: IconName;
  /** Remaining time as bxapi reports it, such as "3 rounds" or "2 turns". */
  duration?: string;
  /** Shows a remove button, for referee tools. */
  onRemove?: () => void;
  className?: string;
}

const conditionIcon: Record<ConditionTone, IconName> = {
  harm: 'warning',
  boon: 'shield',
  magic: 'spell',
  neutral: 'info',
};

/** A condition on a character or monster, such as "Asleep" or "Blessed". */
export function ConditionChip({
  label,
  tone = 'neutral',
  icon,
  duration,
  onRemove,
  className,
}: ConditionChipProps) {
  return (
    <span className={cx(styles.condition, styles[`cond-${tone}`], className)}>
      <Icon name={icon ?? conditionIcon[tone]} size={12} />
      <span>{label}</span>
      {duration && <span className={styles.condDuration}>{duration}</span>}
      {onRemove && (
        <button type="button" className={styles.condRemove} aria-label={`Remove ${label}`} onClick={onRemove}>
          <Icon name="close" size={12} />
        </button>
      )}
    </span>
  );
}
