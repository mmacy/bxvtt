/**
 * Which part of the town the table is looking at, and whether the leave dialog is open. `TownStage` renders
 * both, and `TownActions` and the shortcuts change them, so the two components share this small store.
 */
import { create } from 'zustand';

/** The places in town, in the order the tabs show them. */
export type TownSection = 'square' | 'outfitter' | 'temple' | 'treasure' | 'rest';

export interface TownUiState {
  section: TownSection;
  setSection: (section: TownSection) => void;
  /** Whether the "set out" dialog is open. */
  leaveOpen: boolean;
  setLeaveOpen: (open: boolean) => void;
  /** The dungeon whose **Set out** button opened the dialog, or `null` when the dialog picks the first one. */
  leaveDungeonId: string | null;
  setLeaveDungeonId: (dungeonId: string | null) => void;
  /** The member the viewer is shopping for, or `null` until they choose. */
  buyerId: string | null;
  setBuyerId: (memberId: string | null) => void;
  /** Text to start the outfitter's search with, such as when a checklist item sends you shopping. */
  outfitterSearch: string;
  setOutfitterSearch: (search: string) => void;
  /** What each member has in the outfitter's cart: purchase lots by catalog item. */
  carts: Record<string, Record<string, number>>;
  /** Sets how many lots of an item a member's cart holds. Zero removes the line. */
  setLots: (memberId: string, itemId: string, lots: number) => void;
  /** Empties a member's cart. */
  clearCart: (memberId: string) => void;
  /** Copies a member's cart to other members, replacing theirs. */
  copyCart: (fromId: string, toIds: readonly string[]) => void;
  /** What the last rest did, for the rest page to show. */
  restReport: RestReport | null;
  setRestReport: (report: RestReport | null) => void;
  reset: () => void;
}

/** The outcome of a rest: the lines that describe what happened, or the reason it was refused. */
export interface RestReport {
  kind: string;
  /** What changed: the game time that passed and any hit points recovered. */
  changes: string[];
  lines: string[];
  error: string | null;
}

const INITIAL = {
  section: 'square',
  leaveOpen: false,
  leaveDungeonId: null,
  buyerId: null,
  outfitterSearch: '',
  restReport: null,
  carts: {},
} as const;

export const useTownUi = create<TownUiState>()((set) => ({
  ...INITIAL,
  setSection: (section) => set({ section }),
  setLeaveOpen: (leaveOpen) => set({ leaveOpen }),
  setLeaveDungeonId: (leaveDungeonId) => set({ leaveDungeonId }),
  setBuyerId: (buyerId) => set({ buyerId }),
  setOutfitterSearch: (outfitterSearch) => set({ outfitterSearch }),
  setRestReport: (restReport) => set({ restReport }),
  setLots: (memberId, itemId, lots) =>
    set((state) => {
      const { [itemId]: _removed, ...rest } = state.carts[memberId] ?? {};
      const cart = lots > 0 ? { ...rest, [itemId]: lots } : rest;
      return { carts: { ...state.carts, [memberId]: cart } };
    }),
  clearCart: (memberId) => set((state) => ({ carts: { ...state.carts, [memberId]: {} } })),
  copyCart: (fromId, toIds) =>
    set((state) => {
      const source = state.carts[fromId] ?? {};
      const carts = { ...state.carts };
      for (const id of toIds) carts[id] = { ...source };
      return { carts };
    }),
  reset: () => set({ ...INITIAL }),
}));
