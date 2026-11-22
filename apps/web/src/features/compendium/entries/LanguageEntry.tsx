import { useLanguageCatalog } from '@/app';
import type { ClassDefinition } from '@bxvtt/shared/bxapi';
import { Badge } from '@/ui';
import { useEntries } from '../catalogs';
import { CatalogProblem, PageSkeleton } from '../Frame';
import { EntryLink, EntryPage, Inline, Stat } from '../Parts';
import styles from '../book.module.css';
import { titleFromId } from '../model';

const CLASS_IDS = ['cleric', 'dwarf', 'elf', 'fighter', 'halfling', 'magic_user', 'thief'];

/** A language, and which classes speak it. */
export function LanguageEntry({ id }: { id: string }) {
  const languages = useLanguageCatalog();
  const classes = useEntries<ClassDefinition>(CLASS_IDS.map((classId) => `classes/${classId}`));
  const language = languages.data?.find((entry) => entry.id === id);

  if (languages.data === null) {
    return languages.error ? (
      <CatalogProblem title="Couldn't load the languages" result={languages} section="languages" />
    ) : (
      <PageSkeleton label="Loading the language" />
    );
  }
  const name = language?.name ?? titleFromId(id);
  const speakers = Object.values(classes.data)
    .filter((definition) => definition.languages.includes(id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <EntryPage
      kicker="Language"
      title={name}
      badges={
        language ? (
          <Badge tone={language.choosable ? 'accent' : 'neutral'} appearance="outline">
            {language.choosable ? 'Can be an extra language' : 'Not an extra language'}
          </Badge>
        ) : undefined
      }
    >
      <section className={styles.factSheet} aria-label="Language facts">
        <dl className={styles.statGrid}>
          <Stat label="Spoken by classes" span="full">
            {classes.loading && speakers.length === 0 ? (
              'Loading'
            ) : speakers.length === 0 ? (
              'No class speaks it from the start'
            ) : (
              <Inline
                items={speakers.map((definition) => (
                  <EntryLink key={definition.id} kind="classes" id={definition.id}>
                    {definition.name}
                  </EntryLink>
                ))}
              />
            )}
          </Stat>
          {language?.choosable && (
            <Stat label="Extra language" span="full">
              <span>
                A character with a high enough Intelligence can choose it. See the{' '}
                <EntryLink kind="tables" id="abilities" anchor="intelligence">
                  Intelligence table
                </EntryLink>
                .
              </span>
            </Stat>
          )}
        </dl>
      </section>
    </EntryPage>
  );
}
