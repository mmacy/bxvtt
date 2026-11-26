import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cx } from '../lib/cx';
import { useKitReducedMotion } from '../lib/motion';
import { durations } from '../tokens';
import { Die, type DieSides } from './Die';
import styles from './DiceRoll.module.css';

export interface RolledDie {
  sides: DieSides;
  /** The result the server rolled. The animation always lands on this face. */
  value: number;
  /**
   * Marks a die the roll threw but didn't count, such as the die that 4d6 drop lowest drops. Take it from the
   * server's answer. The die shows with less emphasis and a diagonal strike, leaves the default total, and the
   * announcement names it.
   */
  dropped?: boolean;
}

export interface DiceRollProps {
  /** Results from the server, in order. */
  dice: RolledDie[];
  /** A flat modifier added to the total, such as a strength bonus. */
  modifier?: number;
  /** The total to show. Defaults to the sum of the dice and the modifier. */
  total?: number;
  /** What the roll is for, such as "Strength" or "Attack on the goblin". */
  label?: string;
  /** Player color id or CSS color for the numerals. */
  color?: string;
  /** Size of each die in pixels. Defaults to 44. */
  size?: number;
  /**
   * Plays the tumble. Pass false for rolls from history, such as older feed entries.
   * Change the component's `key` to replay a roll.
   */
  animate?: boolean;
  /** Glows the highest face and dims a 1. Defaults to true. */
  highlightExtremes?: boolean;
  /** Hides the total, for rolls where each die stands alone. */
  hideTotal?: boolean;
  /** Hides the label and formula line above the dice, for a caller that names the roll itself. */
  hideHeader?: boolean;
  /** Hides the Skip button. A click on the dice still lands them at once. */
  hideSkip?: boolean;
  /**
   * Announces the result in a polite live region when the dice land. Defaults to true. Pass false when the caller
   * announces rolls itself, such as a feed that names the roller.
   */
  announce?: boolean;
  /**
   * Shows the result at once, with no tumble. Defaults to the value KitProvider received, or the system's
   * `prefers-reduced-motion` setting.
   */
  reducedMotion?: boolean;
  /** Called once when every die has landed, or at once when the roll does not animate. */
  onSettled?: () => void;
  className?: string;
}

type Phase = 'rolling' | 'settled';

/** Time from the start until the last die lands, in milliseconds. */
const LAND_BASE = 620;
const STAGGER = 80;
const MAX_STAGGER = 320;

function landTime(index: number): number {
  return LAND_BASE + Math.min(index * STAGGER, MAX_STAGGER);
}

/** "3d6", "1d20 + 1", "2d6 + 1d4 − 1". */
export function formatDiceFormula(dice: RolledDie[], modifier = 0): string {
  const counts = new Map<DieSides, number>();
  for (const die of dice) counts.set(die.sides, (counts.get(die.sides) ?? 0) + 1);
  const parts = [...counts.entries()].map(([sides, count]) => `${count}d${sides === 100 ? '%' : sides}`);
  let text = parts.join(' + ');
  if (modifier > 0) text += ` + ${modifier}`;
  if (modifier < 0) text += ` − ${Math.abs(modifier)}`;
  return text;
}

function listJoin(values: number[]): string {
  if (values.length <= 1) return values.join('');
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function cosmeticFace(sides: DieSides, seed: number): number {
  return (Math.abs(seed) % sides) + 1;
}

/**
 * Plays a roll of server-supplied results: the dice tumble, slow down, and land on the given
 * faces in about a second. Click the dice or press the skip button to land them at once.
 * With reduced motion (the `reducedMotion` prop, KitProvider's value, or the system setting), the dice appear
 * already landed.
 */
export function DiceRoll({
  dice,
  modifier = 0,
  total,
  label,
  color,
  size = 44,
  animate = true,
  highlightExtremes = true,
  hideTotal = false,
  hideHeader = false,
  hideSkip = false,
  announce = true,
  reducedMotion: reducedMotionProp,
  onSettled,
  className,
}: DiceRollProps) {
  const kitReducedMotion = useKitReducedMotion();
  const reducedMotion = reducedMotionProp ?? kitReducedMotion;
  const [phase, setPhase] = useState<Phase>(() =>
    animate && !reducedMotion && dice.length > 0 ? 'rolling' : 'settled',
  );
  const [landed, setLanded] = useState<boolean[]>(() => dice.map(() => phase === 'settled'));
  const [faces, setFaces] = useState<number[]>(() =>
    dice.map((d, i) => cosmeticFace(d.sides, d.value + i * 3 + 1)),
  );
  const sidesRef = useRef(dice.map((die) => die.sides));
  const settledCallback = useRef(onSettled);
  const count = dice.length;

  useEffect(() => {
    settledCallback.current = onSettled;
    sidesRef.current = dice.map((die) => die.sides);
  });

  useEffect(() => {
    if (phase !== 'rolling') return;
    const start = Date.now();
    const pending: Array<ReturnType<typeof setTimeout>> = [];
    const lastLanding = landTime(count - 1);
    let interval = 45;
    const tick = () => {
      const elapsed = Date.now() - start;
      setFaces((current) =>
        current.map((face, i) => {
          const sides = sidesRef.current[i];
          // Cosmetic only: these faces flicker past while the die tumbles.
          return sides ? cosmeticFace(sides, Math.floor(Math.random() * 1000)) : face;
        }),
      );
      interval = Math.min(interval * 1.18, 140);
      if (elapsed + interval < lastLanding) pending.push(setTimeout(tick, interval));
    };
    pending.push(setTimeout(tick, interval));
    for (let index = 0; index < count; index += 1) {
      pending.push(
        setTimeout(() => {
          setLanded((current) => current.map((value, i) => (i === index ? true : value)));
        }, landTime(index)),
      );
    }
    pending.push(setTimeout(() => setPhase('settled'), lastLanding + 40));
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, [phase, count]);

  useEffect(() => {
    if (phase === 'settled') settledCallback.current?.();
  }, [phase]);

  const skip = () => {
    if (phase !== 'rolling') return;
    setLanded(dice.map(() => true));
    setPhase('settled');
  };

  const sum = dice.reduce((acc, die) => acc + (die.dropped ? 0 : die.value), 0) + modifier;
  const shownTotal = total ?? sum;
  const formula = formatDiceFormula(dice, modifier);
  const values = dice.map((die) => die.value);
  const dropped = dice.filter((die) => die.dropped).map((die) => die.value);
  const announcement = `${label ? `${label}: ` : ''}rolled ${listJoin(values)} on ${formula}${
    dropped.length > 0 ? ` and dropped the ${listJoin(dropped)}` : ''
  }${hideTotal ? '' : `, total ${shownTotal}`}.`;

  return (
    <div
      className={cx(styles.roll, phase === 'rolling' && styles.rolling, className)}
      role="group"
      aria-label={label ? `${label} roll` : 'Dice roll'}
      aria-busy={phase === 'rolling'}
    >
      {!hideHeader && (label || formula) && (
        <div className={styles.header} aria-hidden="true">
          {label && <span className={styles.label}>{label}</span>}
          <span className={styles.formula}>{formula}</span>
        </div>
      )}
      <div className={styles.body}>
        <div
          className={styles.dice}
          onClick={skip}
          aria-hidden="true"
          style={{ '--roll-duration': `${LAND_BASE}ms` } as CSSProperties}
        >
          {dice.map((die, i) => {
            const isLanded = landed[i] ?? phase === 'settled';
            const value = isLanded ? die.value : (faces[i] ?? die.value);
            const max = die.sides === 100 ? 100 : die.sides;
            const highlight =
              highlightExtremes && !die.dropped && isLanded && phase === 'settled'
                ? die.value === max
                  ? 'max'
                  : die.value === 1
                    ? 'min'
                    : undefined
                : undefined;
            return (
              <span
                key={i}
                className={cx(
                  styles.slot,
                  !isLanded && styles.tumbling,
                  isLanded && phase === 'rolling' && styles.landing,
                  die.dropped && styles.dropped,
                )}
                style={{ '--i': i, '--land': `${landTime(i)}ms` } as CSSProperties}
                data-value={value}
                data-landed={isLanded}
                data-dropped={die.dropped || undefined}
              >
                <Die
                  sides={die.sides}
                  value={value}
                  size={size}
                  color={color}
                  highlight={highlight}
                  decorative
                />
              </span>
            );
          })}
        </div>
        {!hideTotal && (
          <div className={cx(styles.total, phase === 'settled' && styles.totalShown)} aria-hidden="true">
            <span className={styles.equals}>=</span>
            <span className={styles.totalValue}>{phase === 'settled' ? shownTotal : ' '}</span>
          </div>
        )}
        {phase === 'rolling' && !hideSkip && (
          <button type="button" className={styles.skip} onClick={skip}>
            Skip
          </button>
        )}
      </div>
      {announce && (
        <span className="visually-hidden" aria-live="polite">
          {phase === 'settled' ? announcement : ''}
        </span>
      )}
    </div>
  );
}

/** The longest a DiceRoll animation runs, in milliseconds. */
export const DICE_ROLL_MAX_MS = Math.min(durations.diceRoll, LAND_BASE + MAX_STAGGER + 40);
