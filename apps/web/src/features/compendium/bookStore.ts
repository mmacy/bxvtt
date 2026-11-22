/**
 * What the compendium remembers in this browser: the entries a person opened lately, and whether a player has
 * accepted the spoiler notice for magic items.
 */
import { scopedStorage } from '@/app';
import { create } from 'zustand';
import type { Route } from './model';

const storage = scopedStorage('compendium');
const MAX_RECENTS = 12;

export interface RecentEntry {
  kind: 'entry' | 'license';
  entryKind?: string;
  id?: string;
  anchor?: string;
}

interface StoredBook {
  recents: RecentEntry[];
  spoilersAccepted: boolean;
}

function read(): StoredBook {
  const raw = storage.read('book');
  if (typeof raw === 'object' && raw !== null) {
    const record = raw as Partial<StoredBook>;
    const recents = Array.isArray(record.recents)
      ? record.recents.filter(
          (entry): entry is RecentEntry =>
            typeof entry === 'object' &&
            entry !== null &&
            (entry.kind === 'license' || (entry.kind === 'entry' && typeof entry.id === 'string')),
        )
      : [];
    return { recents: recents.slice(0, MAX_RECENTS), spoilersAccepted: record.spoilersAccepted === true };
  }
  return { recents: [], spoilersAccepted: false };
}

function write(book: StoredBook): void {
  storage.write('book', book);
}

interface BookState extends StoredBook {
  /** Remembers a page as recently opened. Only entries count: the home page and section indexes don't. */
  remember: (route: Route) => void;
  acceptSpoilers: () => void;
  forgetRecents: () => void;
}

export const useBookStore = create<BookState>()((set, get) => ({
  ...read(),
  remember: (route) => {
    let entry: RecentEntry | null = null;
    if (route.page === 'license') entry = { kind: 'license' };
    else if (route.page === 'entry')
      entry = {
        kind: 'entry',
        entryKind: route.kind,
        id: route.id,
        ...(route.anchor ? { anchor: route.anchor } : {}),
      };
    if (entry === null) return;
    const same = (other: RecentEntry) =>
      other.kind === entry.kind &&
      other.entryKind === entry.entryKind &&
      other.id === entry.id &&
      other.anchor === entry.anchor;
    const recents = [entry, ...get().recents.filter((other) => !same(other))].slice(0, MAX_RECENTS);
    set({ recents });
    write({ recents, spoilersAccepted: get().spoilersAccepted });
  },
  acceptSpoilers: () => {
    set({ spoilersAccepted: true });
    write({ recents: get().recents, spoilersAccepted: true });
  },
  forgetRecents: () => {
    set({ recents: [] });
    write({ recents: [], spoilersAccepted: get().spoilersAccepted });
  },
}));

/** Resets the store to what storage holds. Tests call it between cases. */
export function resetBookStore(): void {
  useBookStore.setState({ ...read() });
}
