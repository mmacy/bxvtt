import { formatGameClock } from '@bxvtt/shared/text';
import { Icon } from '@/ui';
import { TownScene } from './TownScene';
import styles from './Masthead.module.css';

export interface MastheadProps {
  townName: string;
  townDescription: string;
  adventureName: string;
  clockRounds: number;
  /** A slim version for the shop and temple pages, which need the room. */
  compact: boolean;
}

/** The town's name and description over a drawn village, with the adventure and the game clock. */
export function Masthead({ townName, townDescription, adventureName, clockRounds, compact }: MastheadProps) {
  const clock = formatGameClock(clockRounds);
  return (
    <header className={compact ? `${styles.masthead} ${styles.compact}` : styles.masthead}>
      <TownScene className={styles.scene} />
      <div className={styles.shade} aria-hidden="true" />
      <div className={styles.content}>
        <p className={styles.eyebrow}>
          <span>Between delves</span>
          <span className={styles.dot} aria-hidden="true" />
          <span>{adventureName}</span>
        </p>
        <h2 className={styles.name}>{townName}</h2>
        {!compact && townDescription !== '' && <p className={styles.description}>{townDescription}</p>}
      </div>
      <div className={styles.facts}>
        <span className={styles.fact}>
          <Icon name="clock" size={14} />
          <span className="visually-hidden">Game time: </span>
          <span className={styles.clock}>{clock}</span>
        </span>
      </div>
    </header>
  );
}
