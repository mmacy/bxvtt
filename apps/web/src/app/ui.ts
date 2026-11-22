/**
 * Which shell overlays are open on the play screen: the character sheet, the rules reference, the saves dialog,
 * the table settings, the seats dialog, and the keyboard help. Any feature opens one with an action here, and
 * the shell renders it, so features never render each other's dialogs.
 *
 * ```tsx
 * const openSheet = useTableUi((s) => s.openCharacterSheet);
 * <Button onClick={() => openSheet(member.id)}>Open sheet</Button>
 * ```
 */
import { create } from 'zustand';

/** A rules entry to open the compendium at, such as `{ kind: 'spells', id: 'sleep' }`. */
export interface CompendiumEntry {
  kind: 'classes' | 'equipment' | 'spells' | 'monsters' | 'magic-items' | 'languages' | 'tables' | 'commands';
  id?: string;
}

export interface TableUiState {
  /** The party member whose sheet is open, or `null`. */
  sheetMemberId: string | null;
  openCharacterSheet: (memberId: string) => void;
  closeCharacterSheet: () => void;

  compendiumOpen: boolean;
  /** Where the compendium opens, or `null` for its first page. */
  compendiumEntry: CompendiumEntry | null;
  openCompendium: (entry?: CompendiumEntry) => void;
  setCompendiumOpen: (open: boolean) => void;

  savesOpen: boolean;
  setSavesOpen: (open: boolean) => void;

  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;

  seatsOpen: boolean;
  setSeatsOpen: (open: boolean) => void;

  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  /** Closes everything, when the user leaves a table. */
  reset: () => void;
}

const CLOSED = {
  sheetMemberId: null,
  compendiumOpen: false,
  compendiumEntry: null,
  savesOpen: false,
  settingsOpen: false,
  seatsOpen: false,
  shortcutsOpen: false,
  paletteOpen: false,
} as const;

export const useTableUi = create<TableUiState>()((set) => ({
  ...CLOSED,
  openCharacterSheet: (memberId) => set({ sheetMemberId: memberId }),
  closeCharacterSheet: () => set({ sheetMemberId: null }),
  openCompendium: (entry) => set({ compendiumOpen: true, compendiumEntry: entry ?? null }),
  setCompendiumOpen: (open) =>
    set(open ? { compendiumOpen: true } : { compendiumOpen: false, compendiumEntry: null }),
  setSavesOpen: (open) => set({ savesOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSeatsOpen: (open) => set({ seatsOpen: open }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  reset: () => set({ ...CLOSED }),
}));
