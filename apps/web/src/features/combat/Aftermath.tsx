import type { GameEntry } from '@bxvtt/shared/protocol';
import { coinParts, describeEvents, joinList, type Coins, type TextContext } from '@bxvtt/shared/text';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  cachesToTake,
  pileContentsSentence,
  treasureRowText,
  useCanSend,
  useCombatStage,
  useFeed,
  useGameMode,
  useHere,
  usePlayerTextContext,
  useReduceMotion,
  useRevision,
  useParty,
  useSendCommand,
  useTextContext,
  type TableStore,
} from '@/app';
import { Badge, Button, cx, Icon } from '@/ui';
import { fightEvents, summarizeFight, xpSentence } from './fight';
import { PlaybackStrip } from './PlaybackStrip';
import { RangeTrack } from './RangeTrack';
import { useCombatPeople } from './people';
import type { AnyEvent } from './playback';
import { usePlayback, usePublishPlayback } from './usePlayback';
import styles from './combat.module.css';

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
  const ctx = useTextContext();
  const people = useCombatPeople();
  const reduce = useReduceMotion();
  const mode = useGameMode();
  const revision = useRevision();
  const accept = useCallback((entry: GameEntry) => entry.revision === endRevision, [endRevision]);
  const playback = usePlayback({ afterSeq, accept });
  // The party panel and the top bar follow the last round while it plays here, and settle when it ends.
  usePublishPlayback(playback, useParty());
  const end = feed.find((e) => e.kind === 'game' && e.revision === endRevision && e.seq > afterSeq);
  const summary = useMemo(() => {
    if (!end) return null;
    const fight = fightEvents(feed, end.seq, ctx);
    return summarizeFight(fight.events, fight.ctx);
  }, [feed, end, ctx]);

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
      <header className={cx(styles.boardHead, styles.headKeepClose)}>
        <div className={styles.boardTitle}>
          <Icon name={good ? 'flag' : summary.outcome === 'defeat' ? 'skull' : 'footprints'} size={18} />
          <h2 className={styles.heading}>{summary.title}</h2>
          {summary.rounds > 0 && (
            <Badge tone="neutral">
              {summary.rounds} {summary.rounds === 1 ? 'round' : 'rounds'}
            </Badge>
          )}
        </div>
        <Button size="sm" variant="ghost" icon="close" shortcut="Esc" onClick={onClose}>
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
          {summary.sentence !== '' && <p className={styles.aftermathSentence}>{summary.sentence}</p>}
          <dl className={styles.facts}>
            {summary.defeated.length > 0 && (
              <div className={styles.fact}>
                <dt>Defeated</dt>
                <dd>{capitalize(joinList(summary.defeated.map((d) => d.text)))}</dd>
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
                <dd>{capitalize(joinList(summary.loot))}.</dd>
              </div>
            )}
            {summary.fallen.length > 0 && (
              <div className={cx(styles.fact, styles.factBad)}>
                <dt>Fallen</dt>
                <dd>{joinList(summary.fallen)}</dd>
              </div>
            )}
          </dl>
          <PickUp />
          {playback.last && playback.last.beats.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon="rotate"
              tooltip={
                summary.rounds > 0
                  ? 'Play the last round again, then return to this summary'
                  : 'Play how the encounter ended again, then return to this summary'
              }
              onClick={playback.replay}
            >
              {summary.rounds > 0 ? 'Replay last round' : 'Replay encounter'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** Points the party at what it can pick up where it stands: dropped goods, or a treasure hoard. */
export function PickUp() {
  const here = useHere();
  const canTake = useCanSend('take_treasure');
  const ctx = useTextContext();
  const playerText = usePlayerTextContext();
  const contentsId = useId();
  const { send, pendingType } = useSendCommand();
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'info' | 'danger'; text: string } | null>(null);
  const caches = cachesToTake(here);
  const pile = here?.pile ?? null;
  const contents = pile === null ? '' : pileContentsSentence(pile, playerText);
  // The answer stays on screen after the goods are gone.
  if (pile === null && caches.length === 0 && outcome === null) return null;
  // Report what bxapi answered, including that there was nothing to take, so the button never fails silently.
  const take = async (featureId: string) => {
    setOutcome(null);
    const result = await send(
      { command_type: 'take_treasure', feature_id: featureId },
      { display: 'inline' },
    );
    if (result.status === 'accepted') setOutcome(takeOutcome(result.result.events as AnyEvent[], ctx));
    else if (result.status === 'refused' || result.status === 'error')
      setOutcome({ tone: 'danger', text: result.message });
  };
  const busy = pendingType === 'take_treasure';
  return (
    <div className={styles.pickUp}>
      {outcome && (
        <p className={cx(styles.pickUpOutcome, outcome.tone === 'danger' && styles.toneBad)} role="status">
          {outcome.text}
        </p>
      )}
      {pile !== null && (
        <div className={styles.pickUpRow}>
          <Icon name="coins" size={16} />
          <span className={styles.pickUpBlock}>
            <span className={styles.pickUpText}>Dropped goods lie here.</span>
            {contents !== '' && (
              <span id={contentsId} className={styles.pickUpSub}>
                {contents}
              </span>
            )}
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={!canTake.allowed}
            disabledReason={canTake.reason}
            aria-describedby={contents === '' ? undefined : contentsId}
            onClick={() => void take('pile')}
          >
            Pick up
          </Button>
        </div>
      )}
      {caches.map((cache) => (
        <CacheRow
          key={cache.id}
          // Numbered among every cache here, as the scene panel numbers them, so one cache has one name.
          text={treasureRowText(cache, here?.caches ?? caches)}
          trapFound={cache.trapState === 'found'}
          busy={busy}
          canTake={canTake}
          onTake={() => void take(cache.id)}
        />
      ))}
    </div>
  );
}

/**
 * One treasure the party can take where it stands: its description in full, and the take button. When the
 * party has found a trap on it, a "Trapped" badge sits beside the text and the button reads "Take anyway", so the
 * player decides. The client never says whether a trap exists before the party finds it.
 */
function CacheRow({
  text,
  trapFound,
  busy,
  canTake,
  onTake,
}: {
  /** The row's text, from `treasureRowText`. */
  text: string;
  trapFound: boolean;
  busy: boolean;
  canTake: { allowed: boolean; reason: string | null };
  onTake: () => void;
}) {
  const textId = useId();
  // The text wraps in full. When it's too long to share a line, the badge and the button move to the next line.
  return (
    <div className={styles.pickUpRow}>
      <span className={styles.pickUpLineGroup}>
        <Icon name="chest" size={16} className={styles.pickUpIcon} />
        <span id={textId} className={styles.pickUpLine}>
          {text}
        </span>
      </span>
      <span className={styles.pickUpControls}>
        {trapFound && (
          <Badge tone="warning" icon="trap">
            Trapped
          </Badge>
        )}
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!canTake.allowed}
          disabledReason={canTake.reason}
          aria-describedby={textId}
          onClick={onTake}
        >
          {trapFound ? 'Take anyway' : 'Take'}
        </Button>
      </span>
    </div>
  );
}

/**
 * Whether an event acquired coins: any coin by denomination, which counts loot worth less than 1 gp, or the gp
 * value when every coin count is zero, as in an event from before osrlib 2.7.
 */
function acquiredCoins(event: AnyEvent): boolean {
  const coins = event.coins;
  if (typeof coins === 'object' && coins !== null && coinParts(coins as Coins).length > 0) return true;
  return typeof event.coins_gp_value === 'number' && event.coins_gp_value > 0;
}

/**
 * What a take answered: the lines that say who took what, or that there was nothing to take when nobody took
 * anything.
 */
export function takeOutcome(
  events: readonly AnyEvent[],
  ctx: TextContext,
): { tone: 'success' | 'info'; text: string } {
  const took = events.some(
    (e) =>
      e.event_type === 'item_acquired' &&
      ((Array.isArray(e.item_ids) && e.item_ids.length > 0) || acquiredCoins(e)),
  );
  if (!took) return { tone: 'info', text: 'There was nothing to pick up.' };
  const lines = describeEvents(
    events.filter((e) => e.event_type === 'item_acquired'),
    ctx,
  )
    .map((l) => l.text)
    .filter((t) => !/takes nothing/.test(t));
  return { tone: 'success', text: lines.join(' ') };
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
