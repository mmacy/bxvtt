import type { SaveEntry } from '@bxvtt/shared/protocol';
import {
  classLabel,
  conditionLabel,
  formatDurationRounds,
  formatGameClock,
  joinList,
  sessionModeDescription,
} from '@bxvtt/shared/text';
import { useEffect, useMemo, useState } from 'react';
import {
  describeProblem,
  getApi,
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

function saveTitle(save: SaveEntry): string {
  return save.label ?? (save.autosave ? 'Autosave' : 'Saved game');
}

/** The quests the party completed, from the `quest_completed` events the feed holds, in order. */
function useCompletedQuests(): string[] {
  const feed = useFeed();
  return useMemo(() => {
    const names: string[] = [];
    for (const entry of feed) {
      if (entry.kind !== 'game') continue;
      for (const event of entry.events) {
        if (event.event_type !== 'quest_completed') continue;
        const name = (event as { name?: unknown }).name;
        if (typeof name === 'string' && !names.includes(name)) names.push(name);
      }
    }
    return names;
  }, [feed]);
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
        <Banner tone="warning" title="Couldn't load the saves">
          {error}
        </Banner>
      )}
      {saves === null && error === null && <Skeleton lines={3} />}
      {saves !== null && saves.length === 0 && (
        <p className={styles.endNote}>This table has no saves to restore.</p>
      )}
      {saves !== null && saves.length > 0 && (
        <ul className={styles.saveList}>
          {saves.slice(0, RECENT_SAVES).map((save) => (
            <li key={save.id} className={styles.saveRow}>
              <div className={styles.grow}>
                <p className={styles.saveTitle}>{saveTitle(save)}</p>
                <p className={styles.endMeta}>
                  <span>{formatGameClock(save.clock.rounds)}</span>
                  <span className="visually-hidden">, saved </span>
                  <span>{new Date(save.created_at).toLocaleString()}</span>
                </p>
              </div>
              <Button size="sm" variant="secondary" icon="undo" onClick={() => setRestoring(save)}>
                Restore
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
          Return the table to its lobby
        </Button>
      </div>
      <ConfirmDialog
        open={restoring !== null}
        onOpenChange={(open) => !open && setRestoring(null)}
        title={`Restore ${restoring ? saveTitle(restoring).toLowerCase() : 'this save'}?`}
        description="The table moves to the saved game, and everyone keeps their seats."
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
        title="Return the table to its lobby?"
        description="The game ends and the saves stay. In the lobby, you can change the party and start again, or continue from a save."
        confirmLabel="Return to the lobby"
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
  const quests = useCompletedQuests();
  if (game === null) return null;
  const victory = game.mode === 'victory';
  const fallen = party.filter((member) => member.conditions.includes('dead')).map((member) => member.name);
  return (
    <div className={styles.end}>
      <div className={styles.endCard}>
        <p className={styles.endKicker}>{game.adventure_name}</p>
        <h2 className={styles.endTitle}>{victory ? 'Victory' : 'The party has fallen'}</h2>
        <p className={styles.endLead}>{sessionModeDescription(game.mode)}</p>

        <dl className={styles.endFacts}>
          <div className={styles.endFact}>
            <dt>Game time</dt>
            <dd>
              {formatDurationRounds(game.view.clock_rounds)}, ending at{' '}
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
                      Level {member.level} {classLabel(member.class_id).toLowerCase()}
                    </span>
                    <span className="visually-hidden">, </span>
                    <span>{member.xp} XP</span>
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
            They can restore a save to play on, or return the table to its lobby for a new game.
          </Banner>
        )}
      </div>
    </div>
  );
}
