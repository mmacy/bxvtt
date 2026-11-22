/**
 * Interface state that the combat overlays and the action bar share: which member's composer is open, whether
 * the board is collapsed, and the playback's skip control.
 */
import { create } from 'zustand';

interface CombatUiState {
  /** The member whose declaration composer is open, or `null`. */
  composing: string | null;
  setComposing: (memberId: string | null) => void;
  /** Whether the battle board shows only its header and the range track. */
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  /** Whether the referee's monster list and tools are open. */
  refereeOpen: boolean;
  setRefereeOpen: (open: boolean) => void;
  /** Whether a round is playing back, and how to skip it. */
  playing: boolean;
  skip: (() => void) | null;
  setPlayback: (playing: boolean, skip: (() => void) | null) => void;
}

export const useCombatUi = create<CombatUiState>()((set) => ({
  composing: null,
  setComposing: (composing) => set({ composing }),
  collapsed: false,
  setCollapsed: (collapsed) => set({ collapsed }),
  refereeOpen: false,
  setRefereeOpen: (refereeOpen) => set({ refereeOpen }),
  playing: false,
  skip: null,
  setPlayback: (playing, skip) => set({ playing, skip }),
}));

/** Resets the shared state. Tests call it between cases. */
export function resetCombatUi(): void {
  useCombatUi.setState({ composing: null, collapsed: false, refereeOpen: false, playing: false, skip: null });
}
