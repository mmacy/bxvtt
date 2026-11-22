/**
 * The log behind the screen: the game's events with referee visibility (surprise, reaction, morale, wandering
 * checks, detection rolls, hoards), newest first, in a compact list that filters by kind. It reads the events
 * route, because the referee's events are too many to push after every command.
 */
import type { EventPage } from '@bxvtt/shared/protocol';

/** One event of the log. An entry that bxapi restored from a save as raw data still has a type and a code. */
type LogEvent = LooseEvent;

/** The page's events with bxapi's message for each, without any entry that isn't an event. */
function readPage(page: EventPage): Array<{ event: LogEvent; message: string | undefined }> {
  const out: Array<{ event: LogEvent; message: string | undefined }> = [];
  page.events.forEach((event, i) => {
    const loose = event as Record<string, unknown>;
    if (typeof loose.event_type === 'string' && typeof loose.code === 'string') {
      out.push({ event: loose as LogEvent, message: page.messages[i] });
    }
  });
  return out;
}
import {
  describeEvents,
  type EventCategory,
  type EventIcon,
  type EventLine,
  type LooseEvent,
} from '@bxvtt/shared/text';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getApi, describeProblem, useRevision, useTableId, useTextContext } from '@/app';
import { Banner, Button, Icon, SearchInput, SegmentedControl, Select, Skeleton, type IconName } from '@/ui';
import styles from './sections.module.css';

const ICONS: Record<EventIcon, IconName> = {
  step: 'footprints',
  turn: 'rotate',
  stairs: 'stairs',
  door: 'door',
  lock: 'lock',
  ear: 'ear',
  search: 'search',
  trap: 'trap',
  torch: 'torch',
  monsters: 'skull',
  run: 'footprints',
  sword: 'weapon-sword',
  shield: 'shield',
  arrow: 'weapon-bow',
  dice: 'dice',
  wound: 'heart',
  heart: 'heart',
  skull: 'skull',
  spell: 'spell',
  book: 'book',
  holy: 'sun',
  scroll: 'scroll',
  potion: 'potion',
  wand: 'wand',
  coins: 'coins',
  chest: 'chest',
  gem: 'gem',
  star: 'plus',
  level: 'plus',
  quest: 'flag',
  journal: 'journal',
  clock: 'clock',
  town: 'town',
  referee: 'referee',
  info: 'info',
  flag: 'flag',
  party: 'users',
  rest: 'rest',
  food: 'rest',
  warning: 'warning',
};

const CATEGORY_LABELS: Record<EventCategory, string> = {
  movement: 'Movement',
  exploration: 'Exploration',
  door: 'Doors',
  encounter: 'Encounters',
  battle: 'Battle',
  damage: 'Damage',
  healing: 'Healing',
  death: 'Deaths',
  magic: 'Magic',
  item: 'Items',
  treasure: 'Treasure',
  xp: 'Experience',
  quest: 'Quests',
  journal: 'Journal',
  time: 'Time',
  light: 'Light',
  town: 'Town',
  referee: 'Referee',
  system: 'Other',
};

/** How many events one page loads. bxapi serves at most 500. */
const PAGE = 300;

interface Loaded {
  /** Events in order, each with bxapi's message for it. */
  events: Array<{ event: LogEvent; message: string | undefined }>;
  /** The number of events before the first one loaded. */
  start: number;
  /** The value to pass as `after` to read newer events. */
  next: number;
}

/** Loads the referee's events: the newest page first, newer events as the game moves, and older pages on demand. */
function useRefereeEvents() {
  const tableId = useTableId();
  const revision = useRevision();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadedRef = useRef<Loaded | null>(null);
  useEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);

  useEffect(() => {
    let cancelled = false;
    const api = getApi();
    const current = loadedRef.current;
    const load = async () => {
      try {
        if (current === null) {
          const probe = await api.listEvents(tableId, { visibility: 'referee', limit: 1 });
          const start = Math.max(0, probe.total - PAGE);
          const page = await api.listEvents(tableId, { visibility: 'referee', after: start, limit: PAGE });
          if (cancelled) return;
          setLoaded({
            events: readPage(page),
            start,
            next: page.next_after,
          });
        } else {
          const page = await api.listEvents(tableId, {
            visibility: 'referee',
            after: current.next,
            limit: 500,
          });
          if (cancelled || page.events.length === 0) return;
          setLoaded((prev) =>
            prev === null
              ? prev
              : {
                  ...prev,
                  events: [...prev.events, ...readPage(page)],
                  next: page.next_after,
                },
          );
        }
        setError(null);
      } catch (err) {
        if (!cancelled) {
          const problem = describeProblem(err);
          setError(`${problem.title}. ${problem.detail}`);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tableId, revision]);

  const loadOlder = useCallback(async () => {
    const current = loadedRef.current;
    if (!current || current.start === 0) return;
    setLoadingOlder(true);
    try {
      const start = Math.max(0, current.start - PAGE);
      const page = await getApi().listEvents(tableId, {
        visibility: 'referee',
        after: start,
        limit: current.start - start,
      });
      setLoaded((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              events: [...readPage(page), ...prev.events],
              start,
            },
      );
    } catch (err) {
      const problem = describeProblem(err);
      setError(`${problem.title}. ${problem.detail}`);
    } finally {
      setLoadingOlder(false);
    }
  }, [tableId]);

  return { loaded, error, loadOlder, loadingOlder };
}

function LogLine({ line }: { line: EventLine }) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={styles.logLine}
      data-tone={line.tone}
      data-referee={line.visibility === 'referee' || undefined}
    >
      <Icon name={ICONS[line.icon] ?? 'info'} size={14} className={styles.logIcon} />
      <div className={styles.logBody}>
        <p className={styles.logText}>
          {line.text}
          {line.visibility === 'referee' && <span className={styles.logMark}>Referee</span>}
        </p>
        {line.detail &&
          (open ? (
            <p className={styles.logDetail}>{line.detail}</p>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className={styles.diceButton}
              onClick={() => setOpen(true)}
              aria-label={`Show the dice: ${line.text}`}
            >
              Dice
            </Button>
          ))}
      </div>
    </li>
  );
}

/** The referee's log. */
export function RefereeLog() {
  const ctx = useTextContext();
  const { loaded, error, loadOlder, loadingOlder } = useRefereeEvents();
  const [scope, setScope] = useState<'referee' | 'all'>('referee');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  const lines = useMemo(() => {
    if (!loaded) return [];
    const kept = loaded.events.filter(({ event }) => scope === 'all' || event.visibility === 'referee');
    const described = describeEvents(
      kept.map((k) => k.event),
      ctx,
      { messages: kept.map((k) => k.message ?? '') },
    );
    return described.reverse();
  }, [loaded, scope, ctx]);

  const categories = useMemo(() => [...new Set(lines.map((l) => l.category))].sort(), [lines]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = lines.filter(
    (l) =>
      (category === 'all' || l.category === category) &&
      words.every((w) => `${l.text} ${l.detail ?? ''}`.toLowerCase().includes(w)),
  );

  if (error && !loaded)
    return (
      <Banner tone="danger" title="The log didn't load">
        {error}
      </Banner>
    );
  if (!loaded) return <Skeleton lines={10} />;

  return (
    <div className={styles.section}>
      <div className={styles.logFilters}>
        <SegmentedControl
          size="sm"
          aria-label="Which events"
          value={scope}
          onValueChange={(next) => setScope(next as 'referee' | 'all')}
          options={[
            { value: 'referee', label: 'Referee only' },
            { value: 'all', label: 'Everything' },
          ]}
        />
        <Select
          size="sm"
          aria-label="Kind of event"
          value={category}
          onValueChange={setCategory}
          options={[
            { value: 'all', label: 'Every kind' },
            ...categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
          ]}
        />
      </div>
      <SearchInput
        size="sm"
        value={query}
        onValueChange={setQuery}
        placeholder="Search the log"
        aria-label="Search the log"
      />
      {error && <Banner tone="warning">{error}</Banner>}
      {shown.length === 0 ? (
        <p className={styles.secondaryLine}>
          {scope === 'referee'
            ? 'No referee events yet. Surprise, reactions, morale, and wandering checks show here.'
            : 'Nothing has happened yet.'}
        </p>
      ) : (
        <ol className={styles.log} aria-label="Events, newest first">
          {shown.map((line, index) => (
            <LogLine key={`${loaded.start}-${lines.length - index}`} line={line} />
          ))}
        </ol>
      )}
      {loaded.start > 0 && (
        <Button size="sm" variant="ghost" loading={loadingOlder} onClick={() => void loadOlder()}>
          Load earlier events
        </Button>
      )}
    </div>
  );
}
