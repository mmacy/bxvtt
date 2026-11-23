import { Button, Card, Icon, Kbd } from '@/ui';
import type { CompendiumCatalogs } from './catalogs';
import { SECTIONS, type SectionId } from './model';
import { isPlayCommand } from './search';
import { useNavigation } from './navigation';
import { RecentList } from './SearchResults';
import type { Row } from './rows';
import styles from './home.module.css';

const EXAMPLES = ['sleep', 'goblin', '3rd level', 'plate mail', 'turn undead', '4 hd'];

function countFor(section: SectionId, catalogs: CompendiumCatalogs): number | null {
  switch (section) {
    case 'classes':
      return catalogs.classes.data?.length ?? null;
    case 'spells':
      return catalogs.spells.data?.length ?? null;
    case 'monsters':
      return catalogs.monsters.data?.length ?? null;
    case 'equipment':
      return catalogs.equipment.data?.length ?? null;
    case 'magic-items':
      return catalogs.magicItems.data?.length ?? null;
    case 'languages':
      return catalogs.languages.data?.length ?? null;
    case 'tables':
      return 4;
    case 'commands':
      return catalogs.commands.data?.filter(isPlayCommand).length ?? null;
  }
}

/** The first page of the book: the sections, the entries opened lately, and what to type in the search box. */
export function Home({
  catalogs,
  recents,
  activeIndex,
  onHover,
  onChoose,
  onForget,
  onExample,
}: {
  catalogs: CompendiumCatalogs;
  recents: Row[];
  activeIndex: number;
  onHover: (index: number) => void;
  onChoose: (row: Row) => void;
  onForget: () => void;
  onExample: (query: string) => void;
}) {
  const { go } = useNavigation();
  return (
    <div className={styles.home}>
      <section aria-labelledby="compendium-contents">
        <h2 id="compendium-contents" className={styles.heading}>
          Contents
        </h2>
        <ul className={styles.tiles}>
          {SECTIONS.map((section) => {
            const count = countFor(section.id, catalogs);
            return (
              <li key={section.id}>
                <Card interactive padding="md" className={styles.tile}>
                  <button
                    type="button"
                    className={styles.tileButton}
                    onClick={() => go({ page: 'section', section: section.id })}
                  >
                    <span className={styles.tileIcon}>
                      <Icon name={section.icon} size={24} />
                    </span>
                    <span className={styles.tileText}>
                      <span className={styles.tileName}>
                        {section.label}
                        {count !== null && <span className={styles.tileCount}>{count}</span>}
                      </span>
                      <span className={styles.tileBlurb}>{section.blurb}</span>
                    </span>
                  </button>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {recents.length > 0 && (
        <section aria-labelledby="compendium-recent">
          <div className={styles.headingRow}>
            <h2 id="compendium-recent" className={styles.heading}>
              Recent entries
            </h2>
            <Button variant="ghost" size="sm" onClick={onForget}>
              Clear list
            </Button>
          </div>
          <RecentList rows={recents} activeIndex={activeIndex} onHover={onHover} onChoose={onChoose} />
        </section>
      )}

      <section aria-labelledby="compendium-tips">
        <h2 id="compendium-tips" className={styles.heading}>
          Search tips
        </h2>
        <p className={styles.tip}>
          Search by name across classes, spells, monsters, equipment, languages, and tables, or filter by
          spell level, hit dice, class, alignment, or item type.
        </p>
        <ul className={styles.examples}>
          {EXAMPLES.map((example) => (
            <li key={example}>
              <Button
                variant="secondary"
                size="sm"
                tooltip={`Search the rules for "${example}"`}
                onClick={() => onExample(example)}
              >
                {example}
              </Button>
            </li>
          ))}
        </ul>
        <p className={styles.tip}>
          Press <Kbd keys="/" /> to jump to the search box, <Kbd keys={['Alt', 'Left']} /> and{' '}
          <Kbd keys={['Alt', 'Right']} /> to go back and forward, and <Kbd keys="Esc" /> to close the book.
        </p>
      </section>
    </div>
  );
}
