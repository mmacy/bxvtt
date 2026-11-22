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
 * - While a round plays back, the party panel shows `memberStates`, each member's hit points and conditions at the
 *   beat on the board. Publish them with `setMemberStates` at each beat, and clear them with `null` at the end.
 * - While `playing` is true, the top bar shows `moment`, the round and game time that the playback shows, so it
 *   never runs ahead of the board. Publish it with `setMoment` as each beat plays, and clear it with `null`.
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

/** What a playing round shows: its round number, from 1, and the game clock in rounds at that beat. */
export interface PlaybackMoment {
  round: number | null;
  clockRounds: number;
}

/** A party member as a playing round shows them at one beat. */
export interface PlaybackMemberState {
  hp: number;
  maxHp: number;
  conditions: string[];
  dead: boolean;
}

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
  /** The round and the game clock (in rounds) that the playback shows now, or `null`. */
  moment: PlaybackMoment | null;
  setMoment: (moment: PlaybackMoment | null) => void;
  /**
   * Each party member's hit points and conditions at the beat the playback shows now, by member ID, or `null`
   * when no round plays back. The party panel shows these instead of the game state, so it never runs ahead of
   * the board.
   */
  memberStates: Record<string, PlaybackMemberState> | null;
  setMemberStates: (states: Record<string, PlaybackMemberState> | null) => void;
  /** Empties the slot and stops reporting playback, when the user leaves a table. */
  reset: () => void;
}

export const useCombatStage = create<CombatStageState>()((set) => ({
  aftermath: null,
  showAftermath: (content) => set({ aftermath: content }),
  closeAftermath: () => set({ aftermath: null }),
  playing: false,
  setPlaying: (playing) =>
    set((state) =>
      state.playing === playing
        ? state
        : playing
          ? { playing }
          : { playing, moment: null, memberStates: null },
    ),
  moment: null,
  setMoment: (moment) =>
    set((state) =>
      state.moment?.round === moment?.round && state.moment?.clockRounds === moment?.clockRounds
        ? state
        : { moment },
    ),
  memberStates: null,
  setMemberStates: (memberStates) => set({ memberStates }),
  reset: () => set({ aftermath: null, playing: false, moment: null, memberStates: null }),
}));
