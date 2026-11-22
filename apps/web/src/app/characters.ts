/**
 * The signed-in user's stored characters (bxapi `chr_` characters), shared by the home page, the lobby, and the
 * character wizard.
 */
import type { CharacterSummary, StoredCharacter } from '@bxvtt/shared/protocol';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { describeProblem, getApi, type ProblemMessage } from './api';

interface MyCharactersState {
  items: CharacterSummary[] | null;
  loading: boolean;
  error: ProblemMessage | null;
  refresh: () => Promise<void>;
}

const useMyCharactersStore = create<MyCharactersState>()((set) => ({
  items: null,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true });
    try {
      const list = await getApi().listCharacters();
      set({ items: list.items, loading: false, error: null });
    } catch (error) {
      set({ loading: false, error: describeProblem(error) });
    }
  },
}));

/**
 * The user's stored characters, newest first. The list loads on first use. Call `refresh` after creating or
 * deleting a character.
 *
 * ```tsx
 * const { items, refresh } = useMyCharacters();
 * ```
 */
export function useMyCharacters(): MyCharactersState {
  const state = useMyCharactersStore();
  const needsLoad = state.items === null && !state.loading && state.error === null;
  const refresh = state.refresh;
  useEffect(() => {
    if (needsLoad) void refresh();
  }, [needsLoad, refresh]);
  return state;
}

/** Forgets the cached list, for example after the user changes. */
export function resetMyCharacters(): void {
  useMyCharactersStore.setState({ items: null, loading: false, error: null });
}

/**
 * One stored character with its full sheet. The owner can read it, and so can a referee of a table whose
 * roster has it.
 *
 * @param characterId - The `chr_` ID, or `null` to load nothing.
 */
export function useStoredCharacter(characterId: string | null): {
  data: StoredCharacter | null;
  loading: boolean;
  error: ProblemMessage | null;
} {
  const [state, setState] = useState<{
    id: string | null;
    data: StoredCharacter | null;
    error: ProblemMessage | null;
  }>({ id: null, data: null, error: null });
  useEffect(() => {
    if (characterId === null) return;
    let cancelled = false;
    getApi()
      .getCharacter(characterId)
      .then(
        (data) => !cancelled && setState({ id: characterId, data, error: null }),
        (error: unknown) =>
          !cancelled && setState({ id: characterId, data: null, error: describeProblem(error) }),
      );
    return () => {
      cancelled = true;
    };
  }, [characterId]);
  if (characterId === null) return { data: null, loading: false, error: null };
  if (state.id !== characterId) return { data: null, loading: true, error: null };
  return { data: state.data, loading: false, error: state.error };
}
