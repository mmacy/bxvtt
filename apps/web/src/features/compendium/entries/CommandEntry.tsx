import { useCommandCatalog } from '@/app';
import { commandInfo, sessionModeLabel } from '@bxvtt/shared/text';
import { Badge } from '@/ui';
import { CatalogProblem, PageSkeleton } from '../Frame';
import { EntryPage, Inline, Stat } from '../Parts';
import styles from '../book.module.css';

/** An action a player or referee can take, from the command catalog. Other features open it by deep link. */
export function CommandEntry({ id }: { id: string }) {
  const commands = useCommandCatalog();
  if (commands.data === null) {
    return commands.error ? (
      <CatalogProblem title="Couldn't load the actions" result={commands} />
    ) : (
      <PageSkeleton label="Loading the action" />
    );
  }
  const command = commands.data.find((entry) => entry.command_type === id);
  const info = commandInfo(id);
  return (
    <EntryPage
      kicker="Action"
      title={info.label}
      badges={
        command ? (
          <Badge tone={command.kind === 'referee' ? 'referee' : 'neutral'} appearance="outline">
            {command.kind === 'referee' ? 'Referee action' : 'Player action'}
          </Badge>
        ) : undefined
      }
      lede={info.description}
    >
      {command && (
        <section className={styles.factSheet} aria-label="Action facts">
          <dl className={styles.statGrid}>
            <Stat label="Available when" span="full">
              <Inline items={command.allowed_modes.map((mode) => sessionModeLabel(mode))} />
            </Stat>
          </dl>
        </section>
      )}
    </EntryPage>
  );
}
