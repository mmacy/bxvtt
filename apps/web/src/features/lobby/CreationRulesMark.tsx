import type { RosterEntry, TableSettings } from '@bxvtt/shared/protocol';
import { Badge, Tooltip } from '@/ui';
import { rosterMark, tableCreationRules } from './rules';
import styles from './lobby.module.css';

/**
 * Tells a referee where a roster character's ability scores were rolled and which creation rules differ from the
 * table's, or that its rules weren't recorded. A character rolled here under the table's rules gets no mark. Show
 * it to a referee only.
 *
 * @param props.entry - The roster entry.
 * @param props.settings - The table's settings.
 */
export function CreationRulesMark({ entry, settings }: { entry: RosterEntry; settings: TableSettings }) {
  const mark = rosterMark(entry, tableCreationRules(settings));
  if (mark === null) return null;
  return (
    <Tooltip
      content={
        mark.lines.length === 1 ? (
          mark.lines[0]
        ) : (
          <span className={styles.markLines}>
            {mark.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </span>
        )
      }
    >
      <span tabIndex={0} className={styles.markFocus}>
        <Badge
          tone={mark.tone}
          appearance={mark.tone === 'neutral' ? 'outline' : 'soft'}
          icon={mark.tone === 'warning' ? 'warning' : undefined}
        >
          {mark.label}
        </Badge>
      </span>
    </Tooltip>
  );
}
