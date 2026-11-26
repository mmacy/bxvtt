import { ActivityPanel, BusinessPanel, ChecklistPanel, PartyGlance, ServicesPanel } from './Glance';
import { RoadPanel } from './Road';
import { SpellBanner, hasSpellAdvice, useSpellAdvice } from './SpellAdvice';
import styles from './TownStage.module.css';

/** The town square: what the town offers, the road out, and the party's state at a glance. */
export function Square() {
  // The banner states the spell advice, so the checklist below names it without repeating it.
  const spellBanner = hasSpellAdvice(useSpellAdvice());
  return (
    <div className={styles.squareWrap}>
      <SpellBanner />
      <div className={styles.square}>
        <div className={styles.column}>
          <RoadPanel />
          <ServicesPanel />
          <ChecklistPanel spellBanner={spellBanner} />
        </div>
        <div className={styles.column}>
          <PartyGlance />
          <BusinessPanel />
          <ActivityPanel />
        </div>
      </div>
    </div>
  );
}
