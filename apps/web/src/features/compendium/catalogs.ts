import {
  getApi,
  loadCatalog,
  useClassCatalog,
  useEquipmentCatalog,
  useLanguageCatalog,
  useMagicItemCatalog,
  useMonsterCatalog,
  useSpellCatalog,
  type MonsterDetail,
} from '@/app';
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { buildSearchItems, type SearchItem } from './search';

interface CategoryStore {
  categories: Record<string, readonly string[]>;
  status: 'idle' | 'loading' | 'done';
}

const useCategoryStore = create<CategoryStore>()(() => ({ categories: {}, status: 'idle' }));

const WORKERS = 6;

/**
 * Loads every monster's detail in the background, through the shared catalog cache, so each stat block opens
 * at once later and the monster filters can offer the categories that only the detail has.
 */
function loadMonsterCategories(ids: readonly string[]): void {
  if (useCategoryStore.getState().status !== 'idle') return;
  useCategoryStore.setState({ status: 'loading' });
  const queue = [...ids];
  let pending: Record<string, readonly string[]> = {};
  let sinceFlush = 0;
  const flush = () => {
    if (sinceFlush === 0) return;
    const batch = pending;
    pending = {};
    sinceFlush = 0;
    useCategoryStore.setState((state) => ({ categories: { ...state.categories, ...batch } }));
  };
  const worker = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        const detail = await loadCatalog(`entry:monsters/${id}`, () =>
          getApi().rules<MonsterDetail>(`monsters/${id}`),
        );
        pending[id] = detail.categories;
        if (++sinceFlush >= 40) flush();
      } catch {
        // A monster that fails to load only lacks its categories.
      }
    }
  };
  void Promise.all(Array.from({ length: WORKERS }, worker)).then(() => {
    flush();
    useCategoryStore.setState({ status: 'done' });
  });
}

/** Clears the monster categories. Tests call it between cases. */
export function resetCategoryStore(): void {
  useCategoryStore.setState({ categories: {}, status: 'idle' });
}

export interface CompendiumCatalogs {
  classes: ReturnType<typeof useClassCatalog>;
  spells: ReturnType<typeof useSpellCatalog>;
  monsters: ReturnType<typeof useMonsterCatalog>;
  equipment: ReturnType<typeof useEquipmentCatalog>;
  magicItems: ReturnType<typeof useMagicItemCatalog>;
  languages: ReturnType<typeof useLanguageCatalog>;
  /** Monster categories by ID, filling in as the details load. */
  monsterCategories: Record<string, readonly string[]>;
  categoriesLoading: boolean;
  /** The search index over every catalog that has loaded. */
  items: SearchItem[];
}

/**
 * Every catalog, loaded once through the cached hooks, and the search index over them. The monster details
 * start loading in the background when `warm` is true.
 */
export function useCatalogs(warm: boolean): CompendiumCatalogs {
  const classes = useClassCatalog();
  const spells = useSpellCatalog();
  const monsters = useMonsterCatalog();
  const equipment = useEquipmentCatalog();
  const magicItems = useMagicItemCatalog();
  const languages = useLanguageCatalog();
  const categories = useCategoryStore((s) => s.categories);
  const status = useCategoryStore((s) => s.status);

  const monsterList = monsters.data;
  useEffect(() => {
    if (!warm || monsterList === null) return;
    const ids = monsterList.map((m) => m.id);
    const handle = setTimeout(() => loadMonsterCategories(ids), 600);
    return () => clearTimeout(handle);
  }, [warm, monsterList]);

  const items = useMemo(
    () =>
      buildSearchItems({
        classes: classes.data,
        spells: spells.data,
        monsters: monsterList,
        equipment: equipment.data,
        magicItems: magicItems.data,
        languages: languages.data,
        monsterCategories: categories,
      }),
    [classes.data, spells.data, monsterList, equipment.data, magicItems.data, languages.data, categories],
  );

  return {
    classes,
    spells,
    monsters,
    equipment,
    magicItems,
    languages,
    monsterCategories: categories,
    categoriesLoading: status === 'loading',
    items,
  };
}

/**
 * Loads several entries, such as every class definition, through the shared catalog cache. The result fills in
 * as each entry arrives. Pass `null` to load nothing.
 */
export function useEntries<T>(paths: readonly string[] | null): {
  data: Record<string, T>;
  loading: boolean;
} {
  const key = paths === null ? null : paths.join('|');
  const [state, setState] = useState<{ key: string | null; data: Record<string, T> }>({
    key: null,
    data: {},
  });
  useEffect(() => {
    if (key === null || key === '') return;
    let cancelled = false;
    for (const path of key.split('|')) {
      loadCatalog(`entry:${path}`, () => getApi().rules<T>(path)).then(
        (value) => {
          if (cancelled) return;
          setState((current) => ({
            key,
            data: { ...(current.key === key ? current.data : {}), [path]: value },
          }));
        },
        () => {},
      );
    }
    return () => {
      cancelled = true;
    };
  }, [key]);
  const data = state.key === key ? state.data : {};
  return { data, loading: paths !== null && Object.keys(data).length < paths.length };
}
