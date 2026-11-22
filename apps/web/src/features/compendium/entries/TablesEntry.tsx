import { Link } from '@/ui';
import { EntryPage, useAnchorScroll } from '../Parts';
import { TABLE_ANCHORS, anchorId, tableSetInfo } from '../model';
import styles from '../book.module.css';
import { AbilityTables } from '../tables/AbilityTables';
import { CombatTables } from '../tables/CombatTables';
import { EncounterTables } from '../tables/EncounterTables';
import { TreasureTables } from '../tables/TreasureTables';
import { useRuleTable } from '@/app';

/** Moves the book to a table on the page. Unlike a cross-link, it adds nothing to the history. */
function jumpTo(anchor: string) {
  const target = document.getElementById(anchorId(anchor));
  if (!target) return;
  target.scrollIntoView({ block: 'start' });
  target.setAttribute('data-flash', '');
  setTimeout(() => target.removeAttribute('data-flash'), 1600);
}

/** One set of rule tables, with a row of jumps to each table in it. */
export function TablesEntry({ id, anchor }: { id: string; anchor?: string }) {
  const info = tableSetInfo(id);
  const result = useRuleTable(id);
  useAnchorScroll(anchor, result.data !== null);
  const anchors = TABLE_ANCHORS.filter((entry) => entry.set === id);
  return (
    <EntryPage kicker="Tables" title={info.label} lede={info.blurb || undefined}>
      {anchors.length > 0 && (
        <nav aria-label="Tables on this page" className={styles.jumpBar}>
          <span className={styles.jumpLabel}>On this page</span>
          {anchors.map((entry) => (
            <Link key={entry.anchor} asChild tone="quiet">
              <button type="button" className={styles.entryLink} onClick={() => jumpTo(entry.anchor)}>
                {entry.title}
              </button>
            </Link>
          ))}
        </nav>
      )}
      {id === 'abilities' && <AbilityTables />}
      {id === 'combat' && <CombatTables />}
      {id === 'encounters' && <EncounterTables />}
      {id === 'treasure' && <TreasureTables />}
    </EntryPage>
  );
}
