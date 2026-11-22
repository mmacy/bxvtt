/**
 * Mounts a component as if it were inside an open table, with a table store filled from a fixture snapshot and
 * a fake API. Use it in every feature test.
 *
 * ```tsx
 * const { store, api, user } = renderWithTable(<FeedPanel />, { snapshot: fixtureSnapshot('battle', 'player') });
 * api.postFeed.mockResolvedValue(entry);
 * await user.type(screen.getByRole('textbox'), 'Hello{Enter}');
 * expect(api.postFeed).toHaveBeenCalledWith(store.getState().tableId, { text: 'Hello' });
 * ```
 */
import { BxvttClient } from '@bxvtt/shared/client';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi, type MockInstance } from 'vitest';
import { KitProvider, toast } from '@/ui';
import { setApi } from '../api';
import { useMapBus } from '../mapBus';
import { DEFAULT_PREFERENCES, usePreferences, type Preferences } from '../preferences';
import { resetCatalogCache } from '../rules';
import { TableProvider } from '../table/context';
import { createTableStore, dataFromSnapshot, type TableData, type TableStore } from '../table/store';
import { useTableUi } from '../ui';
import { fixtureSnapshot, type Snapshot } from './fixtures';

/** The methods of the API client. */
type ApiMethod = {
  [K in keyof BxvttClient]: BxvttClient[K] extends (...args: never[]) => unknown ? K : never;
}[keyof BxvttClient];

/** A real {@link BxvttClient} whose methods are spies. Stub one with `api.sendCommand.mockResolvedValue(...)`. */
export type FakeApi = BxvttClient & {
  [K in ApiMethod]: MockInstance<BxvttClient[K]> & BxvttClient[K];
};

const METHODS = Object.getOwnPropertyNames(BxvttClient.prototype).filter(
  (name) => name !== 'constructor',
) as ApiMethod[];

/**
 * Creates an API client for tests. Every method is a spy, and a method that the test didn't stub rejects with an
 * error that names it, so a test never reaches a real server.
 */
export function createFakeApi(): FakeApi {
  const client = new BxvttClient({
    token: 'test-token',
    fetch: (input) => Promise.reject(new Error(`The test didn't stub a request to ${String(input)}.`)),
  });
  for (const name of METHODS) {
    if (name === 'setToken' || name === 'getToken' || name === 'request') continue;
    vi.spyOn(client, name);
  }
  return client as FakeApi;
}

export interface RenderWithTableOptions {
  /** The snapshot to fill the store with. Defaults to the player's exploring snapshot. */
  snapshot?: Snapshot;
  /** Fields to set on top of the snapshot, such as `{ status: 'reconnecting' }`. */
  data?: Partial<TableData>;
  /** Preferences to set, such as `{ refereeLens: false }`. */
  preferences?: Partial<Preferences>;
  /** The route the component renders at. Defaults to `/tables/<table id>`. */
  route?: string;
  /** An API client. Defaults to a new {@link createFakeApi}. */
  api?: FakeApi;
}

export interface RenderWithTableResult extends RenderResult {
  store: TableStore;
  api: FakeApi;
  user: UserEvent;
  /** The snapshot the store started from. */
  snapshot: Snapshot;
}

/** Resets every app-wide store, so one test never sees another's state. */
export function resetAppState(): void {
  toast.clear();
  usePreferences.setState({ ...DEFAULT_PREFERENCES });
  useMapBus.getState().reset();
  useTableUi.getState().reset();
  resetCatalogCache();
}

/**
 * Renders a component inside a fake open table.
 *
 * @param ui - The component.
 * @param options - The snapshot, extra state, preferences, route, and API client.
 */
export function renderWithTable(
  ui: ReactElement,
  options: RenderWithTableOptions = {},
): RenderWithTableResult {
  resetAppState();
  const snapshot = options.snapshot ?? fixtureSnapshot('exploring', 'player');
  const api = options.api ?? createFakeApi();
  setApi(api);
  if (options.preferences) usePreferences.setState(options.preferences);
  const store = createTableStore(snapshot.table.id, {
    initial: { ...dataFromSnapshot(snapshot), ...options.data },
  });
  const route = options.route ?? `/tables/${snapshot.table.id}`;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[route]}>
      <KitProvider>
        <TableProvider store={store}>{children}</TableProvider>
      </KitProvider>
    </MemoryRouter>
  );
  const user = userEvent.setup();
  return Object.assign(render(ui, { wrapper }), { store, api, user, snapshot });
}
