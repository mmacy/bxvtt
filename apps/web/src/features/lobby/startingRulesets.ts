import type { StartingRuleset } from '@bxvtt/shared/protocol';
import { useEffect, useState } from 'react';
import { getApi } from '@/app';

/** The starting rulesets, once `GET /api/rulesets` answers. They never change while the server runs. */
let loaded: StartingRuleset[] | null = null;
let request: Promise<StartingRuleset[]> | null = null;

function load(): Promise<StartingRuleset[]> {
  request ??= getApi()
    .listRulesets()
    .then(
      (list) => {
        loaded = list.items;
        return list.items;
      },
      (error: unknown) => {
        // A failed request isn't kept, so the next screen that needs the list asks again.
        request = null;
        throw error;
      },
    );
  return request;
}

/** Forgets the starting rulesets, so a test starts without them. */
export function resetStartingRulesets(): void {
  loaded = null;
  request = null;
}

/** The starting rulesets a referee picks from, or whether they couldn't load. */
export interface StartingRulesetsState {
  /** The starting rulesets, or `null` until they load. */
  items: StartingRuleset[] | null;
  /** Whether `GET /api/rulesets` failed. */
  failed: boolean;
}

/** Reads the starting rulesets from `GET /api/rulesets`, once for the whole app. */
export function useStartingRulesets(): StartingRulesetsState {
  const [state, setState] = useState<StartingRulesetsState>({ items: loaded, failed: false });
  useEffect(() => {
    if (state.items !== null) return;
    let cancelled = false;
    load().then(
      (items) => {
        if (!cancelled) setState({ items, failed: false });
      },
      () => {
        if (!cancelled) setState({ items: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state.items]);
  return state;
}
