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
import type { FullCatalog, SpellTemplate } from '@bxvtt/shared/protocol';
import { useEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { describeProblem, getApi, type ProblemMessage } from './api';
import { useTableStore } from './table/context';

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

/** The cache key of the whole spell catalog, which `useFullCatalog('spells')` shares. */
const FULL_SPELLS = 'full:spells';

/** The cache key of one spell from a game's own catalog. The session ID starts a new cache for a new game. */
function sessionSpellKey(tableId: string, sessionId: string, spellId: string): string {
  return `session-spell:${[tableId, sessionId, spellId].map(encodeURIComponent).join('/')}`;
}

/**
 * The request behind a cache key: `list:<path>` fetches every page, `full:spells` fetches the whole spell catalog,
 * `session-spell:<table>/<session>/<spell>` fetches one spell from the game's own catalog, and `entry:<path>`
 * fetches one entry.
 */
function loaderFor(key: string): () => Promise<unknown> {
  if (key.startsWith('list:')) return () => fetchAll(key.slice('list:'.length));
  if (key === FULL_SPELLS) return () => getApi().fullCatalog('spells');
  if (key.startsWith('session-spell:')) {
    const [tableId = '', , spellId = ''] = key
      .slice('session-spell:'.length)
      .split('/')
      .map(decodeURIComponent);
    return () => getApi().getSessionSpell(tableId, spellId);
  }
  return () => getApi().rules(key.slice('entry:'.length));
}

function clearEntry(key: string): void {
  useCatalogStore.setState((state) => {
    const { [key]: _removed, ...rest } = state.entries;
    return { entries: rest };
  });
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
      if (key !== null) clearEntry(key);
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

/** A spell's details, from the rules catalog or from the game's own catalog. */
export interface SpellDetailResult {
  /** The spell's template, or `null` while it loads, after a failed load, or for no ID. */
  data: SpellTemplate | null;
  loading: boolean;
  /** Whether the details failed to load. */
  failed: boolean;
  /** Whether the rules catalog has the spell, so a link to its compendium entry opens something. */
  inCatalog: boolean;
}

const spellIndexes = new WeakMap<FullCatalog<'spells'>, ReadonlyMap<string, SpellTemplate>>();

function spellIndex(catalog: FullCatalog<'spells'>): ReadonlyMap<string, SpellTemplate> {
  let index = spellIndexes.get(catalog);
  if (index === undefined) {
    index = new Map(catalog.items.map((spell) => [spell.id, spell]));
    spellIndexes.set(catalog, index);
  }
  return index;
}

/**
 * The details of any spell the player view names: the rules catalog's entry when the catalog has the spell, and
 * otherwise the game's own entry from `GET /api/tables/{table_id}/game/rules/spells/{spell_id}`, which has the
 * spells an adventure bundles. Outside a game, a spell the catalog lacks fails to load.
 *
 * ```tsx
 * const detail = useSpellDetail('ember_dart');
 * if (detail.loading) return <Skeleton lines={4} />;
 * ```
 *
 * @param spellId - The spell ID, or `null` to load nothing.
 */
export function useSpellDetail(spellId: string | null): SpellDetailResult {
  const catalog = useCatalog<FullCatalog<'spells'>>(spellId === null ? null : FULL_SPELLS);
  const tableId = useTableStore((s) => s.tableId);
  const sessionId = useTableStore((s) => s.game?.session_id ?? null);
  const fromCatalog = useMemo(
    () => (spellId === null || catalog.data === null ? undefined : spellIndex(catalog.data).get(spellId)),
    [catalog.data, spellId],
  );
  // The game's route answers only once the catalog has answered without the spell, or failed.
  const catalogSettled = catalog.data !== null || catalog.error !== null;
  const sessionKey =
    spellId !== null && fromCatalog === undefined && catalogSettled && sessionId !== null
      ? sessionSpellKey(tableId, sessionId, spellId)
      : null;
  const session = useCatalog<SpellTemplate>(sessionKey);
  // A component that mounts after a failed load tries again, so "try again in a moment" works by reopening. That
  // covers the whole spell catalog, which outside a game is the only source.
  const triedCatalog = useRef(false);
  useEffect(() => {
    if (spellId === null || triedCatalog.current) return;
    triedCatalog.current = true;
    if (useCatalogStore.getState().entries[FULL_SPELLS]?.status === 'error') clearEntry(FULL_SPELLS);
  }, [spellId]);
  const triedKey = useRef<string | null>(null);
  useEffect(() => {
    if (sessionKey === null || triedKey.current === sessionKey) return;
    triedKey.current = sessionKey;
    if (useCatalogStore.getState().entries[sessionKey]?.status === 'error') clearEntry(sessionKey);
  }, [sessionKey]);
  if (spellId === null) return { data: null, loading: false, failed: false, inCatalog: false };
  if (fromCatalog !== undefined) return { data: fromCatalog, loading: false, failed: false, inCatalog: true };
  if (!catalogSettled) return { data: null, loading: true, failed: false, inCatalog: false };
  if (sessionKey === null) return { data: null, loading: false, failed: true, inCatalog: false };
  return { data: session.data, loading: session.loading, failed: session.error !== null, inCatalog: false };
}

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
