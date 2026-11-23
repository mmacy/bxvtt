import {
  capitalizeFirst,
  conditionLabel,
  countedLabel,
  groupName,
  joinList,
  memberName,
  type TextContext,
} from '@bxvtt/shared/text';
import { useCallback, useLayoutEffect, useRef } from 'react';
import { formatShortcut, PLAYBACK_SPEEDS, useShortcut } from '@/app';
import { ariaKeyShortcuts, Badge, Button, cx, Die, DropdownMenu, Icon, IconButton, SectionLabel } from '@/ui';
import { lineIcon, type RoundDigest } from './playback';
import { SPEEDS } from './transport';
import type { PlaybackItem, PlaybackView } from './usePlayback';
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
  // A group by its ID with a count: "2 goblins", "a goblin", "Mag Corrie".
  const counted = (groupId: string | null, count: number) => {
    const group = groupId ? ctx.groups[groupId] : undefined;
    if (!group) return count === 1 ? 'a monster' : `${count} monsters`;
    return countedLabel(group.label, group.labelPlural, count);
  };
  for (const slain of digest.slain) {
    const name = counted(slain.groupId, slain.count);
    chips.push({ text: `${capitalizeFirst(name)} slain`, tone: 'good' });
  }
  if (digest.fallen.length > 0)
    chips.push({ text: `${joinList(digest.fallen.map((id) => memberName(id, ctx)))} fell`, tone: 'bad' });
  for (const change of digest.conditions) {
    const member = change.tokenId?.startsWith('character-') ?? false;
    const who =
      member && change.tokenId ? memberName(change.tokenId, ctx) : counted(change.tokenId, change.count);
    chips.push({
      text: `${capitalizeFirst(who)} ${conditionLabel(change.condition).toLowerCase()}`,
      tone: member ? 'bad' : 'good',
    });
  }
  for (const groupId of digest.fleeing) {
    const group = ctx.groups[groupId];
    const name = group ? groupName(groupId, ctx) : 'the monsters';
    const one = group ? (group.count ?? 2) <= 1 : false;
    chips.push({ text: `${capitalizeFirst(name)} ${one ? 'is' : 'are'} fleeing`, tone: 'good' });
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
  /** What to say about an entry whose events say nothing, such as a wait while the monsters ignore the party. */
  quietText?: (item: PlaybackItem) => string | null;
  /** Registers the playback's keyboard shortcuts. Only one strip on screen should. */
  shortcuts?: boolean;
}

/** The keys of the playback controls. */
export const PLAYBACK_KEYS = { pause: 'k', forward: '.', back: ',', skip: 'escape' } as const;

/**
 * The beat playing now, with its die and the playback controls, or the last round's summary with a replay
 * control. The text sits in a live region in every state, so a screen reader reads each beat as it appears and
 * the summary when the round ends. Pause and the step keys let a reader take the beats at their own pace.
 */
export function PlaybackStrip({
  playback,
  ctx,
  idle,
  summaryTitle,
  quietText,
  shortcuts = true,
}: PlaybackStripProps) {
  const { beat, current, beatIndex, last, playing, paused, skip, replay } = playback;
  const focus = useFocusHandoff();
  const group = 'Battle';
  useShortcut({
    id: 'combat.playback.skip',
    keys: PLAYBACK_KEYS.skip,
    label: 'Skip round playback',
    group,
    enabled: shortcuts && playing,
    run: skip,
  });
  useShortcut({
    id: 'combat.playback.pause',
    keys: PLAYBACK_KEYS.pause,
    label: paused ? 'Resume round playback' : 'Pause round playback',
    group,
    enabled: shortcuts && playing,
    run: playback.togglePause,
  });
  useShortcut({
    id: 'combat.playback.forward',
    keys: PLAYBACK_KEYS.forward,
    label: 'Step forward one beat',
    group,
    enabled: shortcuts && playing,
    run: playback.stepForward,
  });
  useShortcut({
    id: 'combat.playback.back',
    keys: PLAYBACK_KEYS.back,
    label: playing ? 'Step back one beat' : 'Step back into the last round',
    group,
    enabled: shortcuts && playback.canStepBack,
    run: playback.stepBack,
  });

  if (beat !== null && current !== null) {
    const [first, ...rest] = beat.lines;
    return (
      <div className={cx(styles.strip, styles.stripPlaying, beat.referee && styles.stripReferee)}>
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
        <div className={styles.stripLive} role="status" aria-live="polite" aria-atomic="true">
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
        </div>
        <PlaybackControls playback={playback} focus={focus} />
      </div>
    );
  }

  if (last !== null) {
    const chips = digestChips(last.digest, ctx);
    const finalLine = last.beats.at(-1)?.lines.at(-1)?.text ?? (quietText ? quietText(last) : null);
    const round = last.digest.round;
    // An entry with nothing to say gets no box at all.
    if (chips.length === 0 && !finalLine) return idle === null ? null : <IdleStrip text={idle} />;
    const title = summaryTitle ?? (round !== null ? `Round ${round} result` : 'Result');
    return (
      <div className={styles.strip}>
        <div className={styles.stripDie} aria-hidden="true">
          <Icon name="battle" size={20} />
        </div>
        <div className={styles.stripLive} role="status" aria-live="polite" aria-atomic="true">
          <div className={styles.stripText}>
            <SectionLabel level="none">{title}</SectionLabel>
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
              <p className={styles.stripSub}>{finalLine}</p>
            )}
          </div>
        </div>
        {last.beats.length > 0 && <ReplayControl replay={replay} focus={focus} />}
      </div>
    );
  }

  if (idle === null) return null;
  return <IdleStrip text={idle} />;
}

/** Where keyboard focus goes when the strip swaps its controls: to Replay, or to the pause button. */
type FocusTarget = 'replay' | 'pause';

interface FocusHandoff {
  /** Called as a set of controls unmounts: if focus is inside `node`, the next set takes it at `target`. */
  leave: (node: HTMLElement | null, target: FocusTarget) => void;
  /** Whether the controls that just mounted should take focus at `target`, because focus was lost. Answers once. */
  claim: (target: FocusTarget) => boolean;
}

/**
 * Keeps keyboard focus in the strip when its controls change. When playback ends, the pause and step buttons
 * unmount; a viewer who had focus on one of them lands on Replay rather than on the page. Replay hands focus back
 * to the pause button the same way.
 */
function useFocusHandoff(): FocusHandoff {
  const pending = useRef<FocusTarget | null>(null);
  const leave = useCallback((node: HTMLElement | null, target: FocusTarget) => {
    if (node?.contains(document.activeElement)) pending.current = target;
  }, []);
  const claim = useCallback((target: FocusTarget) => {
    if (pending.current !== target) return false;
    pending.current = null;
    // Only focus that was lost moves. A viewer who has since focused something else, such as a composer, keeps it.
    const active = document.activeElement;
    return active === null || active === document.body;
  }, []);
  return { leave, claim };
}

/** The summary's Replay button, which takes focus from the playback controls that it replaces. */
function ReplayControl({ replay, focus }: { replay: () => void; focus: FocusHandoff }) {
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { leave, claim } = focus;
  useLayoutEffect(() => {
    if (claim('replay')) button.current?.focus();
    const node = container.current;
    return () => leave(node, 'pause');
  }, [leave, claim]);
  return (
    <div className={styles.stripControls} ref={container}>
      <Button
        ref={button}
        size="sm"
        variant="ghost"
        icon="rotate"
        tooltip="Play the last round again from its first beat"
        onClick={replay}
      >
        Replay
      </Button>
    </div>
  );
}

/** Pause and resume, step back and forward, the speed, and skip. */
function PlaybackControls({ playback, focus }: { playback: PlaybackView; focus: FocusHandoff }) {
  const { current, beatIndex, paused, skip } = playback;
  const total = current?.beats.length ?? 0;
  const container = useRef<HTMLDivElement>(null);
  const pause = useRef<HTMLButtonElement>(null);
  const { leave, claim } = focus;
  useLayoutEffect(() => {
    if (claim('pause')) pause.current?.focus();
    const node = container.current;
    return () => leave(node, 'replay');
  }, [leave, claim]);
  return (
    <div className={styles.stripControls} ref={container}>
      <span className="visually-hidden" aria-live="polite">
        {paused ? 'Playback paused.' : ''}
      </span>
      {paused && <Badge tone="neutral">Paused</Badge>}
      <span className={styles.stripCount} aria-hidden="true">
        {beatIndex + 1}/{total}
      </span>
      <IconButton
        icon="step-back"
        label="Step back"
        tooltip="Step back one beat"
        shortcut={formatShortcut(PLAYBACK_KEYS.back)}
        size="sm"
        variant="ghost"
        aria-keyshortcuts={ariaKeyShortcuts(PLAYBACK_KEYS.back)}
        disabled={!playback.canStepBack}
        disabledReason="This is the first beat, so there's nothing to step back to."
        onClick={playback.stepBack}
      />
      <IconButton
        ref={pause}
        icon={paused ? 'play' : 'pause'}
        label={paused ? 'Resume playback' : 'Pause playback'}
        tooltip={paused ? undefined : 'Pause playback on this beat'}
        shortcut={formatShortcut(PLAYBACK_KEYS.pause)}
        size="sm"
        variant={paused ? 'secondary' : 'ghost'}
        aria-keyshortcuts={ariaKeyShortcuts(PLAYBACK_KEYS.pause)}
        onClick={playback.togglePause}
      />
      <IconButton
        icon="step-forward"
        label="Step forward"
        tooltip="Step forward one beat"
        shortcut={formatShortcut(PLAYBACK_KEYS.forward)}
        size="sm"
        variant="ghost"
        aria-keyshortcuts={ariaKeyShortcuts(PLAYBACK_KEYS.forward)}
        onClick={playback.stepForward}
      />
      <SpeedMenu playback={playback} />
      <Button
        size="sm"
        variant="ghost"
        icon="skip-forward"
        tooltip="Skip to the end of the round"
        shortcut="Esc"
        aria-keyshortcuts="Escape"
        onClick={skip}
      >
        Skip
      </Button>
    </div>
  );
}

/** Chooses the playback speed, which this browser remembers. */
function SpeedMenu({ playback }: { playback: PlaybackView }) {
  const { speed, setSpeed } = playback;
  return (
    <DropdownMenu
      align="end"
      trigger={
        <Button
          size="sm"
          variant="ghost"
          iconEnd="chevron-down"
          aria-label={`Playback speed: ${SPEEDS[speed].label}`}
          tooltip="Choose how fast rounds play back on your screen"
        >
          {SPEEDS[speed].label}
        </Button>
      }
      items={[
        { type: 'label', label: 'Playback speed' },
        ...PLAYBACK_SPEEDS.map((value) => ({
          type: 'checkbox' as const,
          label: SPEEDS[value].label,
          checked: value === speed,
          onCheckedChange: () => setSpeed(value),
        })),
      ]}
    />
  );
}

function IdleStrip({ text }: { text: string }) {
  return (
    <div className={cx(styles.strip, styles.stripIdle)}>
      <div className={styles.stripDie} aria-hidden="true">
        <Icon name="hourglass" size={18} />
      </div>
      <div className={styles.stripLive} role="status" aria-live="polite" aria-atomic="true">
        <p className={styles.stripSub}>{text}</p>
      </div>
    </div>
  );
}
