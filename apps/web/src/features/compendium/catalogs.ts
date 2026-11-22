import {
  getApi,
  loadCatalog,
  useClassCatalog,
  useCommandCatalog,
  useEquipmentCatalog,
  useLanguageCatalog,
  useMagicItemCatalog,
  useMonsterCatalog,
  useRulesEntry,
  useSpellCatalog,
  type CatalogResult,
} from '@/app';
import type { FullCatalogEntries, FullCatalogName } from '@bxvtt/shared/protocol';
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { buildSearchItems, type SearchItem } from './search';

type FullItems = { [K in FullCatalogName]?: FullCatalogEntries[K][] };

interface FullStore {
  items: FullItems;
  failed: Partial<Record<FullCatalogName, boolean>>;
}

const useFullStore = create<FullStore>()(() => ({ items: {}, failed: {} }));

/**
 * Loads one catalog whole, in one request. The server caches it, and so does `loadCatalog`. Every full entry is
 * what the entry route returns, so a stat block or a class page needs no second request.
 */
function ensureFull(name: FullCatalogName): void {
  if (useFullStore.getState().items[name] !== undefined) return;
  useFullStore.setState((state) => ({ failed: { ...state.failed, [name]: false } }));
  loadCatalog(`full:${name}`, () => getApi().fullCatalog(name)).then(
    (catalog) => useFullStore.setState((state) => ({ items: { ...state.items, [name]: catalog.items } })),
    () => useFullStore.setState((state) => ({ failed: { ...state.failed, [name]: true } })),
  );
}

/** Clears the full catalogs. Tests call it between cases. */
export function resetFullCatalogs(): void {
  useFullStore.setState({ items: {}, failed: {} });
}

/** A catalog's full entries, or `null` until they load. Pass `load: false` to read without starting a request. */
export function useFullCatalog<K extends FullCatalogName>(
  name: K,
  load = true,
): { data: FullCatalogEntries[K][] | null; failed: boolean; retry: () => void } {
  const data = useFullStore((s) => s.items[name]) as FullCatalogEntries[K][] | undefined;
  const failed = useFullStore((s) => s.failed[name] === true);
  useEffect(() => {
    if (load && data === undefined && !failed) ensureFull(name);
  }, [load, data, failed, name]);
  return { data: data ?? null, failed, retry: () => ensureFull(name) };
}

/**
 * One entry of a catalog. It comes from the full catalog when that has loaded, and from a request for the one
 * entry until then.
 */
export function useEntry<K extends FullCatalogName>(
  catalog: K,
  id: string,
): CatalogResult<FullCatalogEntries[K]> {
  const full = useFullStore((s) => s.items[catalog]) as FullCatalogEntries[K][] | undefined;
  const hit = full?.find((entry) => (entry as { id: string }).id === id);
  const fetched = useRulesEntry<FullCatalogEntries[K]>(hit === undefined ? `${catalog}/${id}` : null);
  if (hit !== undefined) return { data: hit, error: null, loading: false, retry: () => {} };
  return fetched;
}

export interface CompendiumCatalogs {
  classes: ReturnType<typeof useClassCatalog>;
  spells: ReturnType<typeof useSpellCatalog>;
  monsters: ReturnType<typeof useMonsterCatalog>;
  equipment: ReturnType<typeof useEquipmentCatalog>;
  magicItems: ReturnType<typeof useMagicItemCatalog>;
  languages: ReturnType<typeof useLanguageCatalog>;
  commands: ReturnType<typeof useCommandCatalog>;
  fullMonsters: FullCatalogEntries['monsters'][] | null;
  /** Monster categories by ID, once the full monster catalog has loaded. */
  monsterCategories: Record<string, readonly string[]>;
  /** The search index over every catalog that has loaded. */
  items: SearchItem[];
}

/**
 * Every catalog, loaded once through the cached hooks, and the search index over them. The lists load at once.
 * The full classes, equipment, monsters, and spells load too when `warm` is true, so search can read their text.
 * Magic items stay out of the full load, so a player's search never reads what an item does.
 */
export function useCatalogs(warm: boolean): CompendiumCatalogs {
  const classes = useClassCatalog();
  const spells = useSpellCatalog();
  const monsters = useMonsterCatalog();
  const equipment = useEquipmentCatalog();
  const magicItems = useMagicItemCatalog();
  const languages = useLanguageCatalog();
  const commands = useCommandCatalog();
  const fullClasses = useFullCatalog('classes', warm).data;
  const fullSpells = useFullCatalog('spells', warm).data;
  const fullMonsters = useFullCatalog('monsters', warm).data;
  const fullEquipment = useFullCatalog('equipment', warm).data;

  const monsterCategories = useMemo(() => {
    const byId: Record<string, readonly string[]> = {};
    for (const monster of fullMonsters ?? []) byId[monster.id] = monster.categories;
    return byId;
  }, [fullMonsters]);

  const items = useMemo(
    () =>
      buildSearchItems({
        classes: classes.data,
        spells: spells.data,
        monsters: monsters.data,
        equipment: equipment.data,
        magicItems: magicItems.data,
        languages: languages.data,
        commands: commands.data,
        fullClasses,
        fullSpells,
        fullMonsters,
        fullEquipment,
      }),
    [
      classes.data,
      spells.data,
      monsters.data,
      equipment.data,
      magicItems.data,
      languages.data,
      commands.data,
      fullClasses,
      fullSpells,
      fullMonsters,
      fullEquipment,
    ],
  );

  return {
    classes,
    spells,
    monsters,
    equipment,
    magicItems,
    languages,
    commands,
    fullMonsters,
    monsterCategories,
    items,
  };
}
