import { useClassCatalog } from '@/app';
import { abilityLabel } from '@bxvtt/shared/text';
import { Card, Icon } from '@/ui';
import { classIcon, formatRequirements } from '../entries/ClassEntry';
import { useNavigation } from '../navigation';
import styles from '../sections.module.css';
import { raceLabel } from '../model';
import { CatalogGate, SectionShell } from './common';

/** The classes as cards, each with the facts a player compares when choosing one. */
export function ClassesSection() {
  const classes = useClassCatalog();
  const { go } = useNavigation();
  return (
    <SectionShell section="classes" count={classes.data ? `${classes.data.length} classes` : undefined}>
      <CatalogGate result={classes} label="classes">
        {(items) => (
          <ul className={styles.classGrid}>
            {items.map((item) => (
              <li key={item.id}>
                <Card interactive padding="md" className={styles.classCard}>
                  <button
                    type="button"
                    className={styles.cardButton}
                    onClick={() => go({ page: 'entry', kind: 'classes', id: item.id })}
                  >
                    <span className={styles.classIcon}>
                      <Icon name={classIcon(item.id)} size={32} />
                    </span>
                    <span className={styles.classText}>
                      <span className={styles.className}>{item.name}</span>
                      <span className={styles.classRace}>{raceLabel(item.race)}</span>
                    </span>
                    <span className={styles.classFacts}>
                      <span>
                        <span className={styles.factLabel}>Hit die</span> d{item.hit_die}
                      </span>
                      <span>
                        <span className={styles.factLabel}>Maximum level</span> {item.max_level}
                      </span>
                      <span>
                        <span className={styles.factLabel}>Prime requisite</span>{' '}
                        {item.prime_requisites.map((a) => abilityLabel(a, 'short')).join(', ')}
                      </span>
                      <span>
                        <span className={styles.factLabel}>Minimum scores</span>{' '}
                        {formatRequirements(item.requirements, 'short')}
                      </span>
                    </span>
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </CatalogGate>
    </SectionShell>
  );
}
