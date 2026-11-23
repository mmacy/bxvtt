/**
 * The mode the play screen shows, which can lag the game's mode for a moment at the end of a game: when a fight
 * ends the game, the shell keeps the fight on screen while the combat feature plays the last round back, and only
 * then swaps to the end screen. A feature that lays itself out by mode, such as the map chrome, reads
 * `useShownMode()` so it matches what the shell shows.
 *
 * ```tsx
 * const mode = useShownMode();
 * const combat = mode === 'encounter' || mode === 'battle';
 * ```
 */
import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useCombatStage } from './combatStage';
import { useGameMode } from './table/hooks';

/** How long the shell waits for playback to start after the game ends, in milliseconds. */
export const END_GRACE_MS = 1500;
/**
 * The longest the shell holds the end screen back while playback runs without moving on to another beat, in
 * milliseconds. The longest beat lasts about 6.3 seconds (3.5 seconds of reading and a 1.2-second hold, at the
 * slow speed), so a playback that goes this long without a new beat has stopped reporting.
 */
export const END_STALL_MS = 15_000;

function isEnded(mode: string | null): boolean {
  return mode === 'game_over' || mode === 'victory';
}

function isFight(mode: string | null): boolean {
  return mode === 'encounter' || mode === 'battle';
}

/**
 * The mode to show: the game's mode, or the fight's mode while the round that ended the game plays back. The
 * hold ends when playback stops (it finished, or the viewer skipped it), when playback hasn't started within
 * {@link END_GRACE_MS}, or when a running playback goes {@link END_STALL_MS} without a new beat. While the
 * viewer has paused, the hold lasts until they resume or skip.
 */
export function useHeldMode(): string | null {
  const mode = useGameMode();
  const playing = useCombatStage((s) => s.playing);
  const paused = useCombatStage((s) => s.paused);
  const beat = useCombatStage((s) => s.beat);
  const [previous, setPrevious] = useState(mode);
  const [held, setHeld] = useState<string | null>(null);
  const started = useRef(0);
  const sawPlayback = useRef(false);

  // A game that ends in a fight holds the fight on screen. Any other change of mode ends a hold.
  if (mode !== previous) {
    setPrevious(mode);
    setHeld(isEnded(mode) && isFight(previous) ? previous : null);
  }

  useEffect(() => {
    if (held === null) return;
    if (started.current === 0) {
      started.current = performance.now();
      sawPlayback.current = false;
    }
    const elapsed = performance.now() - started.current;
    if (playing) sawPlayback.current = true;
    // A viewer who paused on the last round reads it at their own pace.
    if (playing && paused) return;
    // Each new beat restarts the wait, so the hold lasts as long as the playback keeps moving.
    const wait = playing ? END_STALL_MS : sawPlayback.current ? 0 : END_GRACE_MS - elapsed;
    const timer = setTimeout(() => setHeld(null), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [held, playing, paused, beat]);

  useEffect(() => {
    if (held === null) started.current = 0;
  }, [held]);

  return held ?? mode;
}

const ShownModeContext = createContext<string | null | undefined>(undefined);

/** Shares the shown mode with the parts of the shell, so the top bar and the stage agree. */
export function ShownModeProvider({ mode, children }: { mode: string | null; children: ReactNode }) {
  return createElement(ShownModeContext.Provider, { value: mode }, children);
}

/**
 * The mode the play screen shows: the game's mode, or the fight's mode while the shell holds the end screen back
 * for the last round's playback. Outside the play screen, it is the game's mode.
 */
export function useShownMode(): string | null {
  const shown = useContext(ShownModeContext);
  const mode = useGameMode();
  return shown === undefined ? mode : shown;
}
