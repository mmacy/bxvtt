import { conditionLabel, joinList, memberName, type TextContext } from '@bxvtt/shared/text';
import { useShortcut } from '@/app';
import { Badge, Button, cx, Die, Icon, Kbd } from '@/ui';
import { lineIcon, type RoundDigest } from './playback';
import type { PlaybackView } from './usePlayback';
import styles from './combat.module.css';

/** The round in a few chips: who acted first, damage both ways, who fell, what was slain, who flees. */
export function digestChips(
  digest: RoundDigest,
  ctx: TextContext,
): Array<{ text: string; tone: 'good' | 'bad' | 'neutral' }> {
  const chips: Array<{ text: string; tone: 'good' | 'bad' | 'neutral' }> = [];
  if (digest.first)
    chips.push({
      text: digest.first === 'party' ? 'The party acted first' : 'The monsters acted first',
      tone: 'neutral',
    });
  if (digest.damageDealt > 0) chips.push({ text: `${digest.damageDealt} damage dealt`, tone: 'good' });
  if (digest.damageTaken > 0) chips.push({ text: `${digest.damageTaken} damage taken`, tone: 'bad' });
  if (digest.healed > 0) chips.push({ text: `${digest.healed} hit points healed`, tone: 'good' });
  for (const slain of digest.slain) {
    const group = slain.groupId ? ctx.groups[slain.groupId] : undefined;
    const noun = group
      ? slain.count === 1
        ? group.label
        : group.labelPlural
      : slain.count === 1
        ? 'monster'
        : 'monsters';
    chips.push({ text: `${slain.count} ${noun} slain`, tone: 'good' });
  }
  if (digest.fallen.length > 0)
    chips.push({ text: `${joinList(digest.fallen.map((id) => memberName(id, ctx)))} fell`, tone: 'bad' });
  for (const change of digest.conditions) {
    const group = change.tokenId ? ctx.groups[change.tokenId] : undefined;
    const who = change.tokenId?.startsWith('character-')
      ? memberName(change.tokenId, ctx)
      : `${change.count} ${group ? (change.count === 1 ? group.label : group.labelPlural) : change.count === 1 ? 'monster' : 'monsters'}`;
    chips.push({
      text: `${who} ${conditionLabel(change.condition).toLowerCase()}`,
      tone: change.tokenId?.startsWith('character-') ? 'bad' : 'good',
    });
  }
  for (const groupId of digest.fleeing) {
    const group = ctx.groups[groupId];
    chips.push({ text: `The ${group?.labelPlural ?? 'monsters'} are fleeing`, tone: 'good' });
  }
  return chips;
}

export interface PlaybackStripProps {
  playback: PlaybackView;
  ctx: TextContext;
  /** What to show before anything has played, or `null` to show nothing. */
  idle: string | null;
  /** The heading of the last round's summary, such as "Round 2". */
  summaryTitle?: string;
  /** Registers Escape to skip. Only one strip on screen should. */
  shortcuts?: boolean;
}

/**
 * The beat playing now, with its die and a skip control, or the last round's summary with a replay control.
 */
export function PlaybackStrip({ playback, ctx, idle, summaryTitle, shortcuts = true }: PlaybackStripProps) {
  const { beat, current, beatIndex, last, playing, skip, replay } = playback;
  useShortcut({
    id: 'combat.playback.skip',
    keys: 'escape',
    label: 'Skip the round playback',
    group: 'Battle',
    enabled: shortcuts && playing,
    run: skip,
  });

  if (beat !== null && current !== null) {
    const [first, ...rest] = beat.lines;
    return (
      <div
        className={cx(styles.strip, styles.stripPlaying, beat.referee && styles.stripReferee)}
        role="status"
        aria-live="polite"
        onClick={skip}
      >
        <div className={styles.stripDie} aria-hidden="true">
          {beat.roll ? (
            <Die
              key={`${current.seq}-${beatIndex}`}
              className={styles.stripRoll}
              sides={20}
              value={beat.roll.natural}
              size={34}
              highlight={beat.roll.natural === 20 ? 'max' : beat.roll.natural === 1 ? 'min' : undefined}
              decorative
            />
          ) : (
            <Icon name={first ? lineIcon(first.icon) : 'info'} size={20} />
          )}
        </div>
        <div className={styles.stripText} key={`${current.seq}-${beatIndex}`}>
          {first && (
            <p
              className={cx(
                styles.stripLine,
                first.tone === 'bad' || first.tone === 'danger'
                  ? styles.toneBad
                  : first.tone === 'good' && styles.toneGood,
              )}
            >
              {beat.referee && (
                <Badge tone="referee" appearance="outline">
                  Referee
                </Badge>
              )}{' '}
              {first.text}
            </p>
          )}
          {rest.slice(0, 2).map((line, i) => (
            <p key={i} className={styles.stripSub}>
              {line.text}
            </p>
          ))}
          {rest.length > 2 && <p className={styles.stripSub}>And {rest.length - 2} more.</p>}
          {first?.detail && <p className={styles.stripDetail}>{first.detail}</p>}
        </div>
        <div className={styles.stripControls}>
          <span className={styles.stripCount} aria-hidden="true">
            {beatIndex + 1}/{current.beats.length}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              skip();
            }}
          >
            Skip <Kbd keys="Esc" />
          </Button>
        </div>
      </div>
    );
  }

  if (last !== null) {
    const chips = digestChips(last.digest, ctx);
    const finalLine = last.beats.at(-1)?.lines.at(-1);
    const round = last.digest.round;
    return (
      <div className={styles.strip}>
        <div className={styles.stripDie} aria-hidden="true">
          <Icon name="battle" size={20} />
        </div>
        <div className={styles.stripText}>
          <p className={styles.stripTitle}>
            {summaryTitle ?? (round !== null ? `Round ${round} result` : 'What happened')}
          </p>
          {chips.length > 0 ? (
            <ul className={styles.chips}>
              {chips.map((chip) => (
                <li
                  key={chip.text}
                  className={cx(
                    styles.chip,
                    chip.tone === 'good' && styles.chipGood,
                    chip.tone === 'bad' && styles.chipBad,
                  )}
                >
                  {chip.text}
                </li>
              ))}
            </ul>
          ) : (
            finalLine && <p className={styles.stripSub}>{finalLine.text}</p>
          )}
        </div>
        {last.beats.length > 0 && (
          <div className={styles.stripControls}>
            <Button size="sm" variant="ghost" icon="rotate" onClick={replay}>
              Replay
            </Button>
          </div>
        )}
      </div>
    );
  }

  if (idle === null) return null;
  return (
    <div className={cx(styles.strip, styles.stripIdle)}>
      <div className={styles.stripDie} aria-hidden="true">
        <Icon name="hourglass" size={18} />
      </div>
      <p className={styles.stripSub}>{idle}</p>
    </div>
  );
}
