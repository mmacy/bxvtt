import { useId } from 'react';
import { Button, Die, IconButton, Switch, TextInput, cx } from '@/ui';
import {
  TRAY_DICE,
  TRAY_MAX_COUNT,
  TRAY_MAX_MODIFIER,
  addDie,
  trayExpression,
  EMPTY_TRAY,
  type TrayState,
} from './model/dice';
import styles from './composer.module.css';

export interface DiceTrayProps {
  tray: TrayState;
  onTrayChange: (tray: TrayState) => void;
  label: string;
  onLabelChange: (label: string) => void;
  secret: boolean;
  onSecretChange: (secret: boolean) => void;
  /** Whether the user may roll in secret. */
  canRollSecret: boolean;
  /** The whisper recipients' names, when the roll will go as a whisper. */
  whisperTo: string | null;
  pending: boolean;
  onRoll: () => void;
  onClose: () => void;
  color: string | undefined;
}

/** Builds a roll by tapping dice: one kind of die, a count, and a modifier, with an optional label. */
export function DiceTray({
  tray,
  onTrayChange,
  label,
  onLabelChange,
  secret,
  onSecretChange,
  canRollSecret,
  whisperTo,
  pending,
  onRoll,
  onClose,
  color,
}: DiceTrayProps) {
  const labelId = useId();
  const expression = trayExpression(tray);
  const setCount = (count: number) =>
    onTrayChange(count < 1 ? EMPTY_TRAY : { ...tray, count: Math.min(TRAY_MAX_COUNT, count) });
  const setModifier = (modifier: number) =>
    onTrayChange({ ...tray, modifier: Math.max(-TRAY_MAX_MODIFIER, Math.min(TRAY_MAX_MODIFIER, modifier)) });
  return (
    <section className={styles.tray} aria-label="Dice tray">
      <div className={styles.trayHeader}>
        <p className={styles.trayTitle}>Roll dice</p>
        <IconButton icon="close" label="Close the dice tray" size="sm" onClick={onClose} />
      </div>
      <div className={styles.dice} role="group" aria-label="Add a die">
        {TRAY_DICE.map((sides) => {
          const chosen = tray.sides === sides;
          const name = sides === 100 ? 'd100' : `d${sides}`;
          return (
            <button
              key={sides}
              type="button"
              className={cx(styles.dieButton, chosen && styles.dieChosen)}
              aria-label={chosen ? `Add another ${name}, ${tray.count} chosen` : `Add a ${name}`}
              onClick={() => onTrayChange(addDie(tray, sides))}
            >
              <Die sides={sides} size={sides === 100 ? 24 : 30} color={color} decorative />
              <span className={styles.dieName}>{name}</span>
              {chosen && <span className={styles.dieCount}>{tray.count}</span>}
            </button>
          );
        })}
      </div>
      <div className={styles.trayRow}>
        <div className={styles.stepper} role="group" aria-label="Number of dice">
          <span className={styles.stepperLabel}>Dice</span>
          <IconButton
            icon="minus"
            label="One die fewer"
            size="sm"
            disabled={tray.count < 1}
            onClick={() => setCount(tray.count - 1)}
          />
          <span className={styles.stepperValue} aria-live="polite">
            {tray.count}
          </span>
          <IconButton
            icon="plus"
            label="One die more"
            size="sm"
            disabled={tray.sides === null || tray.count >= TRAY_MAX_COUNT}
            onClick={() => setCount(tray.count + 1)}
          />
        </div>
        <div className={styles.stepper} role="group" aria-label="Modifier">
          <span className={styles.stepperLabel}>Modifier</span>
          <IconButton
            icon="minus"
            label="Lower the modifier"
            size="sm"
            onClick={() => setModifier(tray.modifier - 1)}
          />
          <span className={styles.stepperValue} aria-live="polite">
            {tray.modifier > 0
              ? `+${tray.modifier}`
              : tray.modifier < 0
                ? `−${Math.abs(tray.modifier)}`
                : '0'}
          </span>
          <IconButton
            icon="plus"
            label="Raise the modifier"
            size="sm"
            onClick={() => setModifier(tray.modifier + 1)}
          />
        </div>
      </div>
      <div className={styles.trayRow}>
        <label htmlFor={labelId} className="visually-hidden">
          What the roll is for
        </label>
        <TextInput
          id={labelId}
          size="sm"
          value={label}
          maxLength={120}
          placeholder="What's it for? Such as: to open the door"
          onChange={(event) => onLabelChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && expression !== null) {
              event.preventDefault();
              onRoll();
            }
          }}
          wrapperClassName={styles.trayLabel}
        />
      </div>
      {canRollSecret && (
        <Switch
          label="Secret roll"
          description="Only referees see the result."
          checked={secret}
          onCheckedChange={onSecretChange}
          className={styles.traySecret}
        />
      )}
      {whisperTo !== null && !secret && (
        <p className={styles.trayNote}>The roll goes to {whisperTo} as a whisper.</p>
      )}
      <div className={styles.trayActions}>
        <Button
          variant="ghost"
          size="sm"
          disabled={tray.sides === null && tray.modifier === 0}
          onClick={() => onTrayChange(EMPTY_TRAY)}
        >
          Clear
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon="dice"
          disabled={expression === null}
          loading={pending}
          onClick={onRoll}
        >
          {expression === null ? 'Pick a die' : `Roll ${expression}`}
        </Button>
      </div>
      <p className={styles.trayHint}>One kind of die per roll. Tap a die again to add another.</p>
    </section>
  );
}
