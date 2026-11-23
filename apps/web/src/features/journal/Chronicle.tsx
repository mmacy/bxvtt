import { formatGameClock } from '@bxvtt/shared/text';
import { useMemo } from 'react';
import { usePlayerView } from '@/app';
import { EmptyState, Parchment, SegmentedControl } from '@/ui';
import type { ChronicleOrder } from './model/storage';
import styles from './journal.module.css';

interface Day {
  label: string;
  entries: Array<{ key: string; time: string; text: string }>;
}

function splitClock(rounds: number): { day: string; time: string } {
  const text = formatGameClock(rounds);
  const comma = text.indexOf(', ');
  return comma === -1 ? { day: text, time: '' } : { day: text.slice(0, comma), time: text.slice(comma + 2) };
}

/** The session journal on parchment, opening with the adventure and its town. */
export function Chronicle({
  order,
  onOrderChange,
}: {
  order: ChronicleOrder;
  onOrderChange: (order: ChronicleOrder) => void;
}) {
  const view = usePlayerView();
  const days = useMemo(() => {
    const result: Day[] = [];
    const entries = (view?.journal ?? []).map((entry, index) => ({ ...entry, index }));
    if (order === 'newest') entries.reverse();
    for (const entry of entries) {
      const { day, time } = splitClock(entry.rounds);
      let current = result.at(-1);
      if (current?.label !== day) {
        current = { label: day, entries: [] };
        result.push(current);
      }
      current.entries.push({ key: String(entry.index), time, text: entry.text });
    }
    return result;
  }, [view?.journal, order]);

  if (view === null) {
    return (
      <EmptyState
        icon="journal"
        size="compact"
        title="No active game"
        description="Start a game to read the party's journal."
      />
    );
  }

  const opening = (
    <header className={styles.opening}>
      <h2 className={styles.adventureName}>{view.adventure_name}</h2>
      {view.adventure_description !== '' && (
        <p className={styles.adventureText}>{view.adventure_description}</p>
      )}
      {view.town_name !== '' && (
        <>
          <h3 className={styles.townName}>{view.town_name}</h3>
          {view.town_description !== '' && <p className={styles.adventureText}>{view.town_description}</p>}
        </>
      )}
      <div className={styles.flourish} aria-hidden="true">
        ❦
      </div>
    </header>
  );

  return (
    <div className={styles.chronicleWrap}>
      <div className={styles.chronicleBar}>
        <p className={styles.quiet}>
          {view.journal.length === 0
            ? 'No entries yet'
            : view.journal.length === 1
              ? '1 entry'
              : `${view.journal.length} entries`}
        </p>
        <SegmentedControl
          aria-label="Order"
          size="sm"
          value={order}
          onValueChange={(value) => onOrderChange(value === 'newest' ? 'newest' : 'chronicle')}
          options={[
            { value: 'chronicle', label: 'Oldest first' },
            { value: 'newest', label: 'Newest first' },
          ]}
        />
      </div>
      <Parchment variant="plain" className={styles.parchment}>
        {order === 'chronicle' && opening}
        {days.length === 0 ? (
          <p className={styles.blank}>
            No journal entries yet. Story discoveries, quest leads, and handouts appear here as you play.
          </p>
        ) : (
          days.map((day) => (
            <section key={day.label} className={styles.day} aria-label={day.label}>
              <h3 className={styles.dayLabel}>{day.label}</h3>
              <ol className={styles.entries}>
                {day.entries.map((entry) => (
                  <li key={entry.key} className={styles.entry}>
                    {entry.time !== '' && <span className={styles.entryTime}>{entry.time}</span>}
                    <p className={styles.entryText}>{entry.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
        {order === 'newest' && opening}
      </Parchment>
    </div>
  );
}
