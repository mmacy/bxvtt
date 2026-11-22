import { useLanguageCatalog } from '@/app';
import { Badge, SearchInput } from '@/ui';
import { useMemo } from 'react';
import { EntryLink } from '../Parts';
import { useIndexState } from '../indexState';
import { matchesFilter } from '../search';
import styles from '../sections.module.css';
import { CatalogGate, NoMatches, SectionShell, countText } from './common';

/** The languages a character can speak. */
export function LanguagesSection() {
  const languages = useLanguageCatalog();
  const filter = useIndexState((s) => s.languages);
  const setIndex = useIndexState((s) => s.set);
  const visible = useMemo(
    () => (languages.data ?? []).filter((language) => matchesFilter(language.name, filter.query)),
    [languages.data, filter],
  );
  return (
    <SectionShell
      section="languages"
      count={languages.data ? countText(visible.length, languages.data.length, 'languages') : undefined}
      toolbar={
        <SearchInput
          size="sm"
          aria-label="Filter languages by name"
          placeholder="Filter by name"
          value={filter.query}
          onValueChange={(query) => setIndex({ languages: { query } })}
          wrapperClassName={styles.filterInput}
        />
      }
    >
      <CatalogGate result={languages} label="languages">
        {() =>
          visible.length === 0 ? (
            <NoMatches onClear={() => setIndex({ languages: { query: '' } })} />
          ) : (
            <ul className={styles.nameGrid}>
              {visible.map((language) => (
                <li key={language.id} className={styles.languageRow}>
                  <EntryLink kind="languages" id={language.id} tone="quiet">
                    {language.name}
                  </EntryLink>
                  {language.choosable && <Badge tone="neutral">Extra language</Badge>}
                </li>
              ))}
            </ul>
          )
        }
      </CatalogGate>
    </SectionShell>
  );
}
