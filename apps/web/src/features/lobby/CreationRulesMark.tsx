import type { RosterEntry, TableSettings } from '@bxvtt/shared/protocol';
import { BadgePopover } from '@/ui';
import { rosterMark, tableCreationRules } from './rules';
import styles from './lobby.module.css';

/**
 * Tells a referee where a roster character's ability scores were rolled and which creation rules differ from the
 * table's, or that its rules weren't recorded. A character rolled here under the table's rules gets no mark. The
 * reason opens on a tap or a click, so a referee on a touch screen reads it too. Show it to a referee only.
 *
 * @param props.entry - The roster entry.
 * @param props.settings - The table's settings.
 */
export function CreationRulesMark({ entry, settings }: { entry: RosterEntry; settings: TableSettings }) {
  const mark = rosterMark(entry, tableCreationRules(settings));
  if (mark === null) return null;
  return (
    <BadgePopover
      tone={mark.tone}
      appearance={mark.tone === 'neutral' ? 'outline' : 'soft'}
      icon={mark.tone === 'warning' ? 'warning' : undefined}
      buttonLabel={`${mark.label}: show why`}
      popoverLabel={mark.label}
      content={
        <span className={styles.markLines}>
          {mark.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      }
    >
      {mark.label}
    </BadgePopover>
  );
}
