import type { SaveEntry } from '@bxvtt/shared/protocol';
import { classLabel, conditionLabel, formatGameClock, sessionModeDescription } from '@bxvtt/shared/text';
import { useEffect, useState } from 'react';
import {
  describeProblem,
  getApi,
  tokenClass,
  useApiAction,
  useGame,
  useIsReferee,
  useParty,
  useTableId,
} from '@/app';
import { Badge, Banner, Button, ConfirmDialog, HpBar, Skeleton, TokenPortrait } from '@/ui';
import styles from './table.module.css';

function saveTitle(save: SaveEntry): string {
  return save.label ?? (save.autosave ? 'Autosave' : 'Saved game');
}

/** The referee's way back: restore a save, or return the table to its lobby. */
function RefereeChoices() {
  const tableId = useTableId();
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
      <h2 id="end-choices" className={styles.endSubtitle}>
        What next
      </h2>
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
          {saves.slice(0, 6).map((save) => (
            <li key={save.id} className={styles.saveRow}>
              <div className={styles.grow}>
                <p className={styles.saveTitle}>{saveTitle(save)}</p>
                <p className={styles.endNote}>
                  {formatGameClock(save.clock.rounds)} · {new Date(save.created_at).toLocaleString()}
                </p>
              </div>
              <Button size="sm" variant="secondary" icon="undo" onClick={() => setRestoring(save)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" icon="home" loading={pending && ending} onClick={() => setEnding(true)}>
        Return the table to its lobby
      </Button>
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
        description="The game ends and the saves stay. In the lobby, you can change the party and start again."
        confirmLabel="Return to the lobby"
        onConfirm={async () => {
          await run(() => getApi().endGame(tableId), { errorTitle: "Couldn't end the game" });
        }}
      />
    </section>
  );
}

/** The end of a game: victory or a fallen party, with a summary and the referee's choices. */
export function EndScreen() {
  const game = useGame();
  const party = useParty();
  const referee = useIsReferee();
  if (game === null) return null;
  const victory = game.mode === 'victory';
  return (
    <div className={styles.end}>
      <div className={styles.endCard}>
        <p className={styles.endKicker}>{game.adventure_name}</p>
        <h1 className={styles.endTitle}>{victory ? 'Victory' : 'The party has fallen'}</h1>
        <p className={styles.endLead}>{sessionModeDescription(game.mode)}</p>
        <p className={styles.endNote}>The game ended at {formatGameClock(game.view.clock_rounds)}.</p>
        <ul className={styles.endParty} aria-label="The party">
          {party.map((member) => {
            const dead = member.conditions.includes('dead');
            return (
              <li key={member.id} className={styles.endMember}>
                <TokenPortrait
                  name={member.name}
                  characterClass={tokenClass(member.class_id)}
                  size={40}
                  state={dead ? 'dead' : member.current_hp <= 0 ? 'unconscious' : 'normal'}
                  decorative
                />
                <div className={styles.grow}>
                  <p className={styles.saveTitle}>{member.name}</p>
                  <p className={styles.endNote}>
                    Level {member.level} {classLabel(member.class_id).toLowerCase()} · {member.xp} XP
                  </p>
                </div>
                <div className={styles.endHp}>
                  <HpBar current={member.current_hp} max={member.max_hp} size="sm" />
                </div>
                {member.conditions.map((condition) => (
                  <Badge key={condition} tone={condition === 'dead' ? 'danger' : 'warning'}>
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
