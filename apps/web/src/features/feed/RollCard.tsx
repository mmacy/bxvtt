import type { RollEntry } from '@bxvtt/shared/protocol';
import { memo, useMemo } from 'react';
import { Badge, DiceRoll, cx } from '@/ui';
import { useReduceMotion } from '@/app';
import { rollSentence, rollView } from './model/dice';
import { Highlight, useFeedView } from './FeedView';
import styles from './feed.module.css';

function capitalize(text: string): string {
  return text === '' ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** The numbers of a roll: each die, the modifier, the multiplier, and the total. */
function Breakdown({
  values,
  modifier,
  multiplier,
  total,
  showDice,
}: {
  values: number[];
  modifier: number;
  multiplier: number;
  total: number;
  /** Lists each die's value, for a roll the kit can't draw as faces. */
  showDice: boolean;
}) {
  const shown = !showDice ? [] : values.length > 20 ? values.slice(0, 20) : values;
  return (
    <span className={styles.breakdown} aria-hidden="true">
      {shown.map((value, index) => (
        <span key={index} className={styles.breakdownDie}>
          {value}
        </span>
      ))}
      {showDice && values.length > shown.length && (
        <span className={styles.breakdownMore}>+{values.length - shown.length} more</span>
      )}
      {modifier !== 0 && (
        <span className={styles.breakdownModifier}>
          {modifier > 0 ? '+' : '−'}
          {Math.abs(modifier)}
        </span>
      )}
      {multiplier !== 1 && <span className={styles.breakdownModifier}>×{multiplier}</span>}
      <span className={styles.breakdownEquals}>=</span>
      <span className={styles.breakdownTotal}>{total}</span>
    </span>
  );
}

/**
 * One dice roll: the dice in the roller's color, the breakdown, and a mark for a natural 20 or 1 on a d20. A roll
 * that arrives while the reader watches tumbles with the kit's DiceRoll. A roll from history shows its result.
 */
export const RollCard = memo(function RollCard({
  entry,
  color,
}: {
  entry: RollEntry;
  color: string | undefined;
}) {
  const view = useFeedView();
  const reduceMotion = useReduceMotion();
  const roll = useMemo(() => rollView(entry), [entry]);
  const animate = view.animate(entry.seq) && !reduceMotion;
  const name = view.nameOf(entry.user_id);
  const comment = entry.comment.trim();
  const d20 = roll.expression?.sides === 20;
  return (
    <div
      className={cx(
        styles.roll,
        roll.natural === 20 && styles.rollNat20,
        roll.natural === 1 && styles.rollNat1,
      )}
    >
      <div className={styles.rollHead}>
        <span className={styles.rollExpression}>{entry.expression}</span>
        {comment !== '' && (
          <span className={styles.rollComment}>
            <Highlight text={capitalize(comment)} query={view.query} />
          </span>
        )}
      </div>
      <div className={styles.rollBody}>
        {roll.drawn !== null ? (
          // The kit announces its own result. The feed announces the roll with the roller's name instead, so the
          // tumble is inert.
          <div inert className={styles.rollDice}>
            <DiceRoll
              dice={roll.drawn}
              modifier={roll.modifier}
              total={roll.total}
              color={color}
              size={34}
              animate={animate}
              highlightExtremes={d20}
              hideTotal
            />
          </div>
        ) : null}
        <Breakdown
          values={roll.values}
          modifier={roll.modifier}
          multiplier={roll.multiplier}
          total={roll.total}
          showDice={roll.drawn === null}
        />
        {roll.natural === 20 && (
          <Badge tone="gold" appearance="soft" icon="dice">
            Natural 20
          </Badge>
        )}
        {roll.natural === 1 && (
          <Badge tone="danger" appearance="soft" icon="dice">
            Natural 1
          </Badge>
        )}
      </div>
      <span className="visually-hidden">{rollSentence(name, entry)}</span>
    </div>
  );
});
