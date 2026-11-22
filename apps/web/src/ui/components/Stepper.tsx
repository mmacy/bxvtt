import { Icon } from '../icons/Icon';
import { cx } from '../lib/cx';
import styles from './Stepper.module.css';

export interface StepperStep {
  id: string;
  label: string;
  /** Short text under the label, such as the choice made in that step. */
  description?: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step. Earlier steps show as complete. */
  current: number;
  /** Lets the user go back to a completed step. */
  onStepClick?: (index: number) => void;
  /** Accessible name, such as "Character creation". */
  'aria-label': string;
  className?: string;
}

/** Shows progress through a wizard, such as the character creation steps. */
export function Stepper({ steps, current, onStepClick, 'aria-label': ariaLabel, className }: StepperProps) {
  return (
    <nav aria-label={ariaLabel} className={cx(styles.nav, className)}>
      <ol className={styles.steps}>
        {steps.map((step, index) => {
          const state = index < current ? 'complete' : index === current ? 'current' : 'upcoming';
          const content = (
            <>
              <span className={styles.marker} aria-hidden="true">
                {state === 'complete' ? <Icon name="check" size={14} strokeWidth={2.5} /> : index + 1}
              </span>
              <span className={styles.text}>
                <span className={styles.label}>
                  {step.label}
                  {state === 'complete' && <span className="visually-hidden"> (complete)</span>}
                </span>
                {step.description && <span className={styles.description}>{step.description}</span>}
              </span>
            </>
          );
          return (
            <li key={step.id} className={cx(styles.step, styles[state])}>
              {onStepClick && state === 'complete' ? (
                <button type="button" className={styles.inner} onClick={() => onStepClick(index)}>
                  {content}
                </button>
              ) : (
                <span className={styles.inner} aria-current={state === 'current' ? 'step' : undefined}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
