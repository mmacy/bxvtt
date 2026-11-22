/**
 * The table page's parts that load on demand: the table page itself, the lobby, the play screen, and the map.
 * `preloadTableScreens()` starts all four at once, so the browser fetches them in parallel instead of learning of
 * each only after the one before it runs. The app calls it before its first render when the address is a table's,
 * and the table page calls it when it opens, for a visitor who arrives from another page.
 */
import { lazyPart } from '@/app';

export const TablePagePart = lazyPart(() => import('./TablePage').then((module) => module.TablePage));
export const LobbyPagePart = lazyPart(() => import('@/features/lobby').then((module) => module.LobbyPage));
export const PlayShellPart = lazyPart(() => import('./PlayShell').then((module) => module.PlayShell));
export const MapStagePart = lazyPart(() =>
  import('@/features/explore/MapStage').then((module) => module.MapStage),
);

/** Starts loading every part of the table page, and resolves when the table page itself has loaded. */
export function preloadTableScreens(): Promise<unknown> {
  const ignore = () => undefined;
  // A part that fails here fails again where it renders, inside an error boundary.
  void LobbyPagePart.preload().catch(ignore);
  void PlayShellPart.preload().catch(ignore);
  void MapStagePart.preload().catch(ignore);
  return TablePagePart.preload().catch(ignore);
}

/** Whether a path is a table's page, `/tables/:tableId`. */
export function isTablePath(pathname: string): boolean {
  return /^\/tables\/[^/]+\/?$/.test(pathname);
}
