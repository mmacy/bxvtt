import type { GameEntry } from '@bxvtt/shared/protocol';
import { joinList } from '@bxvtt/shared/text';
import { useCallback, useEffect, useMemo } from 'react';
import {
  useCombatStage,
  useFeed,
  useGameMode,
  useReduceMotion,
  useRevision,
  useScene,
  type TableStore,
} from '@/app';
import { Badge, Button, cx, Icon } from '@/ui';
import { fightEvents, summarizeFight, xpSentence } from './fight';
import { PlaybackStrip } from './PlaybackStrip';
import { RangeTrack } from './RangeTrack';
import { useCombatPeople } from './people';
import { usePlayback } from './usePlayback';
import styles from './combat.module.css';
import { useCombatText } from './text';

export interface AftermathProps {
  /** The revision the fight ended at. The entry with this revision is the fight's last. */
  endRevision: number;
  /** Plays feed entries after this `seq`. */
  afterSeq: number;
  onClose: () => void;
}

/**
 * The end of a fight or an encounter: the last round played back, then how it ended, what the party defeated and
 * what that's worth, what the slain left behind, and who fell.
 */
export function Aftermath({ endRevision, afterSeq, onClose }: AftermathProps) {
  const feed = useFeed();
  const ctx = useCombatText();
  const people = useCombatPeople();
  const reduce = useReduceMotion();
  const mode = useGameMode();
  const revision = useRevision();
  const pile = useScene()?.here?.pile === true;
  const accept = useCallback((entry: GameEntry) => entry.revision === endRevision, [endRevision]);
  const playback = usePlayback({ afterSeq, accept });
  const end = feed.find((e) => e.kind === 'game' && e.revision === endRevision && e.seq > afterSeq);
  const summary = useMemo(
    () => (end ? summarizeFight(fightEvents(feed, end.seq), ctx) : null),
    [feed, end, ctx],
  );

  // A new encounter, or the party moving on a few steps, retires the summary.
  useEffect(() => {
    if (mode !== 'exploring' && mode !== 'town') onClose();
    else if (revision !== null && revision >= endRevision + 4) onClose();
  }, [mode, revision, endRevision, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !playback.playing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, playback.playing]);

  if (summary === null) return null;
  const xp = xpSentence(summary);
  const good = summary.outcome === 'victory' || summary.outcome === 'parley' || summary.outcome === 'turned';
  return (
    <section className={cx(styles.board, styles.aftermath)} aria-label={summary.title} role="region">
      <header className={styles.boardHead}>
        <div className={styles.boardTitle}>
          <Icon name={good ? 'flag' : summary.outcome === 'defeat' ? 'skull' : 'footprints'} size={18} />
          <h2 className={styles.heading}>{summary.title}</h2>
          {summary.rounds > 0 && (
            <Badge tone="neutral">
              {summary.rounds} {summary.rounds === 1 ? 'round' : 'rounds'}
            </Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" icon="close" onClick={onClose}>
          Close
        </Button>
      </header>
      {playback.track && (
        <RangeTrack
          track={playback.track}
          colors={people.colors}
          focus={playback.beat?.focus}
          pops={playback.beat?.pops}
          popKey={playback.current ? `${playback.current.seq}-${playback.beatIndex}` : undefined}
          animate={!reduce}
          compact
        />
      )}
      {playback.playing ? (
        <PlaybackStrip playback={playback} ctx={ctx} idle={null} />
      ) : (
        <div className={styles.aftermathBody}>
          <p className={styles.aftermathSentence}>{summary.sentence}</p>
          <dl className={styles.facts}>
            {summary.defeated.length > 0 && (
              <div className={styles.fact}>
                <dt>Defeated</dt>
                <dd>{joinList(summary.defeated.map((d) => d.text))}</dd>
              </div>
            )}
            {xp && (
              <div className={styles.fact}>
                <dt>Experience</dt>
                <dd>{xp}</dd>
              </div>
            )}
            {summary.loot.length > 0 && (
              <div className={styles.fact}>
                <dt>Left behind</dt>
                <dd>{capitalize(joinList(summary.loot))}, in a pile where the party stands.</dd>
              </div>
            )}
            {summary.loot.length === 0 && summary.lootDropped && pile && (
              <div className={styles.fact}>
                <dt>Left behind</dt>
                <dd>A few coins, worth less than 1 gp, in a pile where the party stands.</dd>
              </div>
            )}
            {summary.fallen.length > 0 && (
              <div className={cx(styles.fact, styles.factBad)}>
                <dt>Fallen</dt>
                <dd>{joinList(summary.fallen)}</dd>
              </div>
            )}
          </dl>
          {playback.last && playback.last.beats.length > 0 && (
            <Button size="sm" variant="ghost" icon="rotate" onClick={playback.replay}>
              {summary.rounds > 0 ? 'Replay the last round' : 'Replay what happened'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Empties the after-fight slot. */
export function closeAftermath(): void {
  useCombatStage.getState().closeAftermath();
}

/**
 * Shows the aftermath in the shell's after-fight slot, when the battle board or the encounter panel unmounts at
 * the end of a fight.
 *
 * @param store - The table store, to read the revision the fight ended at and the feed so far.
 */
export function showAftermath(store: TableStore): void {
  const state = store.getState();
  const endRevision = state.game?.revision;
  if (endRevision === undefined) return;
  const afterSeq = state.feed.filter((e) => e.kind === 'game' && e.revision < endRevision).at(-1)?.seq ?? 0;
  useCombatStage
    .getState()
    .showAftermath(
      <Aftermath key={endRevision} endRevision={endRevision} afterSeq={afterSeq} onClose={closeAftermath} />,
    );
}
