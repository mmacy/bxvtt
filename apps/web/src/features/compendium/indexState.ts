import { create } from 'zustand';

/** The filters of each section index. They live outside the pages, so Back returns to the same filtered list. */
export interface IndexState {
  spells: { list: string; level: string; query: string };
  monsters: { query: string; alignment: string; category: string; hitDice: string };
  equipment: { type: string; query: string };
  magicItems: { category: string; query: string };
  languages: { query: string };
  set: (patch: Partial<Omit<IndexState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const INITIAL = {
  spells: { list: 'all', level: 'all', query: '' },
  monsters: { query: '', alignment: 'all', category: 'all', hitDice: 'all' },
  equipment: { type: 'all', query: '' },
  magicItems: { category: 'all', query: '' },
  languages: { query: '' },
};

export const useIndexState = create<IndexState>()((set) => ({
  ...INITIAL,
  set: (patch) => set(patch),
  reset: () => set({ ...INITIAL }),
}));
