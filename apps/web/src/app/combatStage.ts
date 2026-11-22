/**
 * What the combat feature tells the shell about the stage: what to show in the after-fight slot, and whether a
 * round is playing back.
 *
 * - The shell renders `aftermath` at the bottom center of the stage, over the map, in every mode that follows a
 *   fight (`exploring` and `town`). The content renders inside the table's providers, so it can use every hook.
 *   The shell clears it when a new encounter starts and when the user leaves the table.
 * - The shell holds the end screen (`game_over` or `victory`) while `playing` is true, so the round that ended
 *   the game plays back first. It waits a short grace period for playback to start, and it never waits longer
 *   than a safe limit.
 *
 * ```tsx
 * // When the fight ends:
 * useCombatStage.getState().showAftermath(<Aftermath endRevision={revision} afterSeq={seq} onClose={close} />);
 * // While a round plays back:
 * const setPlaying = useCombatStage((s) => s.setPlaying);
 * useEffect(() => setPlaying(playback.playing), [playback.playing, setPlaying]);
 * useEffect(() => () => setPlaying(false), [setPlaying]);
 * ```
 */
import type { ReactNode } from 'react';
import { create } from 'zustand';

export interface CombatStageState {
  /** What the after-fight slot shows, or `null`. */
  aftermath: ReactNode | null;
  /** Fills the after-fight slot, replacing what it showed. */
  showAftermath: (content: ReactNode) => void;
  /** Empties the after-fight slot. */
  closeAftermath: () => void;
  /** Whether combat playback is running. */
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  /** Empties the slot and stops reporting playback, when the user leaves a table. */
  reset: () => void;
}

export const useCombatStage = create<CombatStageState>()((set) => ({
  aftermath: null,
  showAftermath: (content) => set({ aftermath: content }),
  closeAftermath: () => set({ aftermath: null }),
  playing: false,
  setPlaying: (playing) => set((state) => (state.playing === playing ? state : { playing })),
  reset: () => set({ aftermath: null, playing: false }),
}));
