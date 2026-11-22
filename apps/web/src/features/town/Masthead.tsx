import { TownScene } from './TownScene';
import styles from './Masthead.module.css';

export interface MastheadProps {
  townName: string;
  townDescription: string;
  adventureName: string;
  /** A slim version for the shop and temple pages, which need the room. */
  compact: boolean;
}

/** The town's name and description over a drawn village, with the adventure it belongs to. The top bar shows the game clock. */
export function Masthead({ townName, townDescription, adventureName, compact }: MastheadProps) {
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
    </header>
  );
}
