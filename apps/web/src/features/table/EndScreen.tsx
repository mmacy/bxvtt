import type { SaveEntry } from '@bxvtt/shared/protocol';
import {
  conditionLabel,
  count,
  formatGameClock,
  formatInteger,
  joinList,
  SECONDS_PER_ROUND,
  sessionModeDescription,
} from '@bxvtt/shared/text';
import { useEffect, useMemo, useState } from 'react';
import {
  describeProblem,
  getApi,
  memberClassName,
  tokenClass,
  useApiAction,
  useFeed,
  useGame,
  useIsReferee,
  useParty,
  useTableId,
  useTableUi,
} from '@/app';
import { Badge, Banner, Button, ConfirmDialog, HpBar, SectionLabel, Skeleton, TokenPortrait } from '@/ui';
import styles from './table.module.css';

/** How many recent saves the end screen lists. The saves dialog lists every one. */
const RECENT_SAVES = 3;

/**
 * How long the game ran, as a person would say it: "1 day, 10 hours, and 20 minutes". The engine counts in days,
 * turns, and rounds, but nobody at the table counts hours in turns.
 */
export function gameTimeText(rounds: number): string {
  const seconds = Math.max(0, Math.round(rounds)) * SECONDS_PER_ROUND;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(count(days, 'day'));
  if (hours > 0) parts.push(count(hours, 'hour'));
  if (minutes > 0) parts.push(count(minutes, 'minute'));
  if (parts.length === 0) parts.push(count(seconds % 60, 'second'));
  return joinList(parts);
}

/** When a save was made, in the reader's own short date and time: "Nov 22, 2026, 4:25 AM". */
function savedAtText(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function saveTitle(save: SaveEntry): string {
  return save.label ?? (save.autosave ? 'Autosave' : 'Saved game');
}

interface GameOutcome {
  quests: string[];
  closing: string | null;
}

/** Reads the quests the party completed, in order, and the adventure's closing words, from a list of events. */
function outcomeOf(
  events: Iterable<{ event_type?: unknown; name?: unknown; narrative?: unknown }>,
): GameOutcome {
  const quests: string[] = [];
  let closing: string | null = null;
  for (const event of events) {
    if (event.event_type === 'quest_completed') {
      if (typeof event.name === 'string' && event.name !== '' && !quests.includes(event.name)) {
        quests.push(event.name);
      }
    } else if (event.event_type === 'adventure_completed') {
      if (typeof event.narrative === 'string' && event.narrative.trim() !== '') closing = event.narrative;
    }
  }
  return { quests, closing };
}

/** How many pages of the event log the end screen reads at most, 500 events each. */
const MAX_EVENT_PAGES = 40;

/**
 * What the game that ended achieved: the quests the party completed, in order, and the adventure's closing words.
 *
 * It reads the game's event log, which a restored game inherits from its save, so the quests the party completed
 * before the save count too, and the table's earlier adventures don't. Until the log arrives, or if it can't be
 * read, it counts the game's own entries in the feed.
 */
function useGameOutcome(tableId: string, sessionId: string | null, revision: number): GameOutcome {
  const feed = useFeed();
  const fromFeed = useMemo(
    () =>
      outcomeOf(
        feed.flatMap((entry) =>
          entry.kind === 'game' && entry.session_id === sessionId ? entry.events : [],
        ),
      ),
    [feed, sessionId],
  );
  const [fromLog, setFromLog] = useState<{ key: string; outcome: GameOutcome } | null>(null);
  const key = `${sessionId}:${revision}`;
  useEffect(() => {
    if (sessionId === null) return;
    let cancelled = false;
    void (async () => {
      const events: { event_type?: unknown; name?: unknown; narrative?: unknown }[] = [];
      let after = 0;
      for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
        const result = await getApi().listEvents(tableId, { after, limit: 500, visibility: 'player' });
        events.push(...(result.events as typeof events));
        if (result.events.length === 0 || result.next_after >= result.total) break;
        after = result.next_after;
      }
      if (!cancelled) setFromLog({ key, outcome: outcomeOf(events) });
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [tableId, sessionId, key]);
  return fromLog !== null && fromLog.key === key ? fromLog.outcome : fromFeed;
}

/** The referee's way back: restore one of the newest saves, see every save, or return the table to its lobby. */
function RefereeChoices() {
  const tableId = useTableId();
  const setSavesOpen = useTableUi((s) => s.setSavesOpen);
  const { run, pending } = useApiAction();
  const [saves, setSaves] = useState<SaveEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<SaveEntry | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getApi()
      .listSaves(tableId)
      .then(
        (list) => !cancelled && setSaves(list.items),
        (problem: unknown) => {
          if (cancelled) return;
          const message = describeProblem(problem);
          setError(`${message.title}. ${message.detail}`);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [tableId]);

  return (
    <section className={styles.endChoices} aria-labelledby="end-choices">
      <SectionLabel level={2}>
        <span id="end-choices">Continue from a save</span>
      </SectionLabel>
      {error !== null && (
        <Banner tone="warning" title="Couldn't load saves">
          {error}
        </Banner>
      )}
      {saves === null && error === null && <Skeleton lines={3} />}
      {saves !== null && saves.length === 0 && (
        <p className={styles.endNote}>No saves are available to restore.</p>
      )}
      {saves !== null && saves.length > 0 && (
        <ul className={styles.saveList}>
          {saves.slice(0, RECENT_SAVES).map((save) => (
            <li key={save.id} className={styles.saveRow}>
              <div className={styles.grow}>
                <p className={styles.saveTitle}>{saveTitle(save)}</p>
                <p className={styles.endMeta}>
                  <span>
                    {formatGameClock(save.clock.rounds)}
                    <span className="visually-hidden-inline">,</span>
                  </span>
                  <span>
                    <span className="visually-hidden-inline">saved </span>
                    {savedAtText(save.created_at)}
                  </span>
                </p>
              </div>
              <Button size="sm" variant="secondary" icon="undo" onClick={() => setRestoring(save)}>
                Restore<span className="visually-hidden"> {saveTitle(save)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.endActions}>
        {saves !== null && saves.length > RECENT_SAVES && (
          <Button variant="ghost" icon="download" onClick={() => setSavesOpen(true)}>
            All {saves.length} saves
          </Button>
        )}
        <Button variant="ghost" icon="home" loading={pending && ending} onClick={() => setEnding(true)}>
          Return to lobby
        </Button>
      </div>
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => !open && setRestoring(null)}
        title={`Restore ${restoring ? saveTitle(restoring) : 'this save'}?`}
        description="Everyone resumes play from this saved game and keeps their current seats."
        confirmLabel="Restore save"
        onConfirm={async () => {
          if (restoring === null) return;
          await run(() => getApi().restoreSave(tableId, restoring.id), {
            errorTitle: "Couldn't restore the save",
          });
        }}
      />
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="Return to lobby?"
        description="This ends the game for everyone and keeps every save. A new game starts the characters from their first sheets. Continue from a save to keep their experience, treasure, and injuries."
        confirmLabel="Return to lobby"
        onConfirm={async () => {
          await run(() => getApi().endGame(tableId), { errorTitle: "Couldn't end the game" });
        }}
      />
    </section>
  );
}

/**
 * The end of a game: how it ended, how long the party played in game time, who fell, the quests the party
 * completed, the party, and the referee's choices. It fits one screen.
 */
export function EndScreen() {
  const game = useGame();
  const party = useParty();
  const referee = useIsReferee();
  const tableId = useTableId();
  const { quests, closing } = useGameOutcome(tableId, game?.session_id ?? null, game?.revision ?? 0);
  if (game === null) return null;
  const victory = game.mode === 'victory';
  const fallen = party.filter((member) => member.conditions.includes('dead')).map((member) => member.name);
  return (
    <div className={styles.end}>
      <div className={styles.endCard}>
        <p className={styles.endKicker}>{game.adventure_name}</p>
        <h2 className={styles.endTitle}>{victory ? 'Victory' : 'The party has fallen'}</h2>
        <p className={styles.endLead}>{sessionModeDescription(game.mode)}</p>
        {victory && closing !== null && <p className={styles.endClosing}>{closing}</p>}

        <dl className={styles.endFacts}>
          <div className={styles.endFact}>
            <dt>Game time</dt>
            <dd>
              {gameTimeText(game.view.clock_rounds)} of game time, ending at{' '}
              {formatGameClock(game.view.clock_rounds)}
            </dd>
          </div>
          <div className={styles.endFact}>
            <dt>Fallen</dt>
            <dd>{fallen.length === 0 ? 'Nobody' : joinList(fallen)}</dd>
          </div>
          <div className={styles.endFact}>
            <dt>Quests completed</dt>
            <dd>{quests.length === 0 ? 'None' : joinList(quests)}</dd>
          </div>
        </dl>

        <ul className={styles.endParty} aria-label="The party">
          {party.map((member) => {
            const dead = member.conditions.includes('dead');
            return (
              <li key={member.id} className={styles.endMember}>
                <TokenPortrait
                  name={member.name}
                  characterClass={tokenClass(member.class_id)}
                  size={32}
                  state={dead ? 'dead' : member.current_hp <= 0 ? 'unconscious' : 'normal'}
                  decorative
                />
                <div className={styles.grow}>
                  <p className={styles.saveTitle}>{member.name}</p>
                  <p className={styles.endMeta}>
                    <span>
                      Level {member.level} {memberClassName(member)}
                      <span className="visually-hidden-inline">,</span>
                    </span>
                    <span>{formatInteger(member.xp)} XP</span>
                  </p>
                </div>
                <div className={styles.endHp}>
                  <HpBar current={member.current_hp} max={member.max_hp} size="sm" />
                </div>
                {member.conditions.map((condition) => (
                  // An outline badge sets the condition's color on the row's own surface, which keeps the small
                  // text above a 4.5:1 contrast ratio.
                  <Badge
                    key={condition}
                    tone={condition === 'dead' ? 'danger' : 'warning'}
                    appearance="outline"
                  >
                    {conditionLabel(condition)}
                  </Badge>
                ))}
              </li>
            );
          })}
        </ul>

        {referee ? (
          <RefereeChoices />
        ) : (
          <Banner tone="neutral" title="The referee decides what comes next">
            The referee can restore a save to keep playing, or return to the lobby to start a new game.
          </Banner>
        )}
      </div>
    </div>
  );
}
