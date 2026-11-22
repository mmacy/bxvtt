import { Card } from '@/ui';
import { EntryLink } from '../Parts';
import { TABLE_ANCHORS, TABLE_SETS } from '../model';
import { useNavigation } from '../navigation';
import styles from '../sections.module.css';
import { SectionShell } from './common';

/** The four sets of rule tables, each with a list of the tables in it. */
export function TablesSection() {
  const { go } = useNavigation();
  return (
    <SectionShell section="tables">
      <ul className={styles.tableSets}>
        {TABLE_SETS.map((set) => (
          <li key={set.id}>
            <Card padding="md" className={styles.tableSet}>
              <h3 className={styles.tableSetTitle}>
                <button
                  type="button"
                  className={styles.titleButton}
                  onClick={() => go({ page: 'entry', kind: 'tables', id: set.id })}
                >
                  {set.label}
                </button>
              </h3>
              <p className={styles.tableSetBlurb}>{set.blurb}</p>
              <ul className={styles.tableLinks}>
                {TABLE_ANCHORS.filter((anchor) => anchor.set === set.id).map((anchor) => (
                  <li key={anchor.anchor}>
                    <EntryLink kind="tables" id={set.id} anchor={anchor.anchor}>
                      {anchor.title}
                    </EntryLink>
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
