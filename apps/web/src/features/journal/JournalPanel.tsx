import { useState } from 'react';
import { useTableId } from '@/app';
import { SegmentedControl } from '@/ui';
import { Chronicle } from './Chronicle';
import { PartyNotes } from './PartyNotes';
import { Quests } from './Quests';
import { readChoices, writeChoices, type ChronicleOrder, type JournalSection } from './model/storage';
import styles from './journal.module.css';

/** The journal tab of the dock: the active quests, the session journal, and the party's shared notes. */
export function JournalPanel() {
  const tableId = useTableId();
  const [choices, setChoices] = useState(() => readChoices(tableId));
  const update = (next: Partial<{ section: JournalSection; order: ChronicleOrder }>) => {
    const value = { ...choices, ...next };
    setChoices(value);
    writeChoices(tableId, value);
  };
  return (
    <div className={styles.panel}>
      <div className={styles.switcher}>
        <SegmentedControl
          aria-label="Journal section"
          size="sm"
          value={choices.section}
          onValueChange={(value) =>
            update({ section: value === 'journal' || value === 'notes' ? value : 'quests' })
          }
          options={[
            { value: 'quests', label: 'Quests', icon: 'flag' },
            { value: 'journal', label: 'Journal', icon: 'journal' },
            {
              value: 'notes',
              label: 'Notes',
              icon: 'edit',
              tooltip: 'Edit the notes that everyone at the table shares',
            },
          ]}
          className={styles.sections}
        />
      </div>
      <div
        className={styles.body}
        role="region"
        // The body scrolls, so it takes focus for keyboard scrolling, as the feed's list does.
        tabIndex={0}
        aria-label={
          choices.section === 'quests' ? 'Quests' : choices.section === 'journal' ? 'Journal' : 'Party notes'
        }
      >
        {choices.section === 'quests' && <Quests />}
        {choices.section === 'journal' && (
          <Chronicle order={choices.order} onOrderChange={(order) => update({ order })} />
        )}
        {choices.section === 'notes' && <PartyNotes />}
      </div>
    </div>
  );
}
