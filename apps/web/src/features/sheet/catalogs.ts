/**
 * Whole rules catalogs from `GET /api/catalogs/{catalog}`, one cached response per catalog, so a list of classes,
 * spells, or items shows every detail without one request per entry.
 */
import type { FullCatalogEntries, FullCatalogName } from '@bxvtt/shared/protocol';
import { useEffect, useMemo, useState } from 'react';
import { getApi, loadCatalog } from '@/app';

/** One whole catalog, keyed by entry ID. */
export interface FullCatalogResult<C extends FullCatalogName> {
  items: FullCatalogEntries[C][] | null;
  byId: ReadonlyMap<string, FullCatalogEntries[C]>;
  loading: boolean;
  failed: boolean;
}

const EMPTY = new Map<string, never>();

/**
 * Every full entry of a catalog. The app's catalog cache shares the response with every component.
 *
 * @param catalog - `classes`, `equipment`, `monsters`, `spells`, or `magic-items`.
 */
export function useFullCatalog<C extends FullCatalogName>(catalog: C): FullCatalogResult<C> {
  const [state, setState] = useState<{ items: FullCatalogEntries[C][] | null; failed: boolean }>({
    items: null,
    failed: false,
  });
  useEffect(() => {
    let cancelled = false;
    loadCatalog(`full:${catalog}`, () => getApi().fullCatalog(catalog)).then(
      (result) => {
        if (!cancelled) setState({ items: result.items, failed: false });
      },
      () => {
        if (!cancelled) setState({ items: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [catalog]);
  const byId = useMemo(() => {
    if (!state.items) return EMPTY as ReadonlyMap<string, FullCatalogEntries[C]>;
    return new Map(state.items.map((item) => [(item as { id: string }).id, item]));
  }, [state.items]);
  return { items: state.items, byId, loading: state.items === null && !state.failed, failed: state.failed };
}

/** One entry of a whole catalog, with the `{ data, loading }` shape of `useRulesEntry`. */
function useFullEntry<C extends FullCatalogName>(catalog: C, id: string | null) {
  const full = useFullCatalog(catalog);
  return { data: id === null ? null : (full.byId.get(id) ?? null), loading: id !== null && full.loading };
}

/** A class's full entry, or `null` for no ID. */
export const useClassDetail = (id: string | null) => useFullEntry('classes', id);
/**
 * A spell's details, from the rules catalog or, for a spell the adventure bundles, from the game. The hook lives in
 * the app layer so the battle composer shares it.
 */
export { useSpellDetail } from '@/app';
/** A magic item's full entry, or `null` for no ID. */
export const useMagicItemDetail = (id: string | null) => useFullEntry('magic-items', id);
