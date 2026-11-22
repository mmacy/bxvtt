/**
 * The rules catalogs that the server proxies from bxapi, fetched once per page load and shared by every
 * component. Each hook returns `{ data, error, loading }` and starts the request on first use.
 *
 * ```tsx
 * const spells = useSpellCatalog();
 * if (spells.data) return <SpellList spells={spells.data} />;
 * ```
 */
import type {
  ClassSummary,
  CommandSummary,
  EquipmentSummary,
  Language,
  MagicItemSummary,
  MonsterSummary,
  SpellSummary,
  paths,
} from '@bxvtt/shared/bxapi';
import { useEffect } from 'react';
import { create } from 'zustand';
import { describeProblem, getApi, type ProblemMessage } from './api';

/** The response body of a bxapi rules route, such as `RulesResponse<'/v1/rules/spells/{spell_id}'>`. */
export type RulesResponse<P extends keyof paths> = paths[P] extends {
  get: { responses: { 200: { content: { 'application/json': infer T } } } };
}
  ? T
  : never;

/** A spell's full entry. */
export type SpellDetail = RulesResponse<'/v1/rules/spells/{spell_id}'>;
/** A monster's full entry. */
export type MonsterDetail = RulesResponse<'/v1/rules/monsters/{monster_id}'>;
/** A class's full entry. */
export type ClassDetail = RulesResponse<'/v1/rules/classes/{class_id}'>;
/** An equipment item's full entry. */
export type EquipmentDetail = RulesResponse<'/v1/rules/equipment/{item_id}'>;
/** A magic item's full entry. */
export type MagicItemDetail = RulesResponse<'/v1/rules/magic-items/{item_id}'>;
/** A rules table, such as `combat`. */
export type RuleTable = RulesResponse<'/v1/rules/tables/{name}'>;
/** A command's entry with its JSON schema. */
export type CommandDetail = RulesResponse<'/v1/rules/commands/{command_type}'>;
/** The license of the rules content. */
export type RulesLicense = RulesResponse<'/v1/rules/license'>;

/** The state of one cached catalog request. */
export interface CatalogResult<T> {
  data: T | null;
  error: ProblemMessage | null;
  loading: boolean;
  /** Clears a failed request so the hook tries again. */
  retry: () => void;
}

interface Entry {
  status: 'loading' | 'ready' | 'error';
  data: unknown;
  error: ProblemMessage | null;
}

interface CatalogStore {
  entries: Record<string, Entry>;
}

const useCatalogStore = create<CatalogStore>()(() => ({ entries: {} }));
const inflight = new Map<string, Promise<unknown>>();

/** The most entries bxapi returns in one page. */
const PAGE_LIMIT = 200;

interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Fetches every page of a list route. */
async function fetchAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const page = await getApi().rules<Page<T>>(path, { limit: PAGE_LIMIT, offset });
    items.push(...page.items);
    if (page.items.length === 0 || items.length >= page.total) return items;
  }
}

function setEntry(key: string, entry: Entry): void {
  useCatalogStore.setState((state) => ({ entries: { ...state.entries, [key]: entry } }));
}

/**
 * Loads a catalog into the cache, once. A failed load is retried on the next call.
 *
 * @param key - The cache key, such as `list:spells` or `entry:spells/sleep`.
 * @param load - The request.
 */
export function loadCatalog<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = useCatalogStore.getState().entries[key];
  if (existing?.status === 'ready') return Promise.resolve(existing.data as T);
  const pending = inflight.get(key);
  if (pending !== undefined) return pending as Promise<T>;
  setEntry(key, { status: 'loading', data: null, error: null });
  const promise = load().then(
    (data) => {
      inflight.delete(key);
      setEntry(key, { status: 'ready', data, error: null });
      return data;
    },
    (error: unknown) => {
      inflight.delete(key);
      setEntry(key, { status: 'error', data: null, error: describeProblem(error) });
      throw error;
    },
  );
  inflight.set(key, promise);
  return promise;
}

/** The request behind a cache key: `list:<path>` fetches every page, and `entry:<path>` fetches one entry. */
function loaderFor(key: string): () => Promise<unknown> {
  if (key.startsWith('list:')) return () => fetchAll(key.slice('list:'.length));
  return () => getApi().rules(key.slice('entry:'.length));
}

function useCatalog<T>(key: string | null): CatalogResult<T> {
  const entry = useCatalogStore((state) => (key === null ? undefined : state.entries[key]));
  const needsLoad = entry === undefined;
  useEffect(() => {
    if (key !== null && needsLoad) loadCatalog(key, loaderFor(key)).catch(() => {});
  }, [key, needsLoad]);
  return {
    data: entry?.status === 'ready' ? (entry.data as T) : null,
    error: entry?.status === 'error' ? entry.error : null,
    loading: key !== null && (entry === undefined || entry.status === 'loading'),
    retry: () => {
      if (key === null) return;
      useCatalogStore.setState((state) => {
        const { [key]: _removed, ...rest } = state.entries;
        return { entries: rest };
      });
    },
  };
}

/**
 * Every entry of a catalog list route, across pages.
 *
 * @param path - A list route under `/api/rules/`, such as `spells`.
 */
export function useCatalogList<T>(path: string): CatalogResult<T[]> {
  return useCatalog<T[]>(`list:${path}`);
}

/**
 * One catalog entry, such as `spells/sleep` or `commands/move_party`.
 *
 * @param path - The route under `/api/rules/`, or `null` to load nothing.
 */
export function useRulesEntry<T>(path: string | null): CatalogResult<T> {
  return useCatalog<T>(path === null ? null : `entry:${path}`);
}

/** The character classes. */
export const useClassCatalog = () => useCatalogList<ClassSummary>('classes');
/** The equipment catalog, with costs. */
export const useEquipmentCatalog = () => useCatalogList<EquipmentSummary>('equipment');
/** Every spell. */
export const useSpellCatalog = () => useCatalogList<SpellSummary>('spells');
/** Every monster. */
export const useMonsterCatalog = () => useCatalogList<MonsterSummary>('monsters');
/** Every magic item. */
export const useMagicItemCatalog = () => useCatalogList<MagicItemSummary>('magic-items');
/** Every language. */
export const useLanguageCatalog = () => useCatalogList<Language>('languages');
/** Every command, with its kind and modes. */
export const useCommandCatalog = () => useCatalogList<CommandSummary>('commands');
/** The names of the rules tables, such as `combat`. */
export const useRuleTableNames = () => useCatalogList<string>('tables');
/** One rules table by name. */
export const useRuleTable = (name: string | null) =>
  useRulesEntry<RuleTable>(name === null ? null : `tables/${name}`);
/** One command's entry with its JSON schema, which a form builds its fields from. */
export const useCommandSchema = (commandType: string | null) =>
  useRulesEntry<CommandDetail>(commandType === null ? null : `commands/${commandType}`);
/** The license of the rules content. */
export const useRulesLicense = () => useRulesEntry<RulesLicense>('license');

/**
 * The catalog lists that have loaded so far, without starting any request. `useTextContext` reads it to name
 * things from the catalogs a feature already loaded.
 */
export function useLoadedCatalogNames(): {
  equipment: EquipmentSummary[] | null;
  magicItems: MagicItemSummary[] | null;
  spells: SpellSummary[] | null;
  monsters: MonsterSummary[] | null;
} {
  const equipment = useCatalogStore((s) => s.entries['list:equipment']);
  const magicItems = useCatalogStore((s) => s.entries['list:magic-items']);
  const spells = useCatalogStore((s) => s.entries['list:spells']);
  const monsters = useCatalogStore((s) => s.entries['list:monsters']);
  const ready = <T>(entry: Entry | undefined): T | null =>
    entry?.status === 'ready' ? (entry.data as T) : null;
  return {
    equipment: ready(equipment),
    magicItems: ready(magicItems),
    spells: ready(spells),
    monsters: ready(monsters),
  };
}

/** Clears the cache. Tests call it between cases. */
export function resetCatalogCache(): void {
  inflight.clear();
  useCatalogStore.setState({ entries: {} });
}
