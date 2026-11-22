/**
 * Hooks the exploration components share: the action context, the session lore, the lore tracker, and the
 * names of the adventure's dungeons.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  canSendCommand,
  getApi,
  useAdventureDocument,
  usePermissionContext,
  usePlayerView,
  useScene,
  useTableId,
  useTableStore,
  useTableStoreApi,
  useTextContext,
} from '@/app';
import type { ActionContext } from './actions';
import { adventureDungeons, type LevelOption } from './levels';
import { learnFromFeed, observeLocation, useLorePart, useLoreStore, type Lore } from './lore';
import { useExploreSend } from './useExploreSend';

/**
 * The context the action builders read: the view, the scene, the permission check, and a `run` that sends
 * through {@link useExploreSend}. `null` before the game loads.
 */
export function useActionContext(): ActionContext | null {
  const view = usePlayerView();
  const scene = useScene();
  const permissions = usePermissionContext();
  const { send } = useExploreSend();
  const text = useTextContext();
  const can = useCallback(
    (commandType: string, memberId?: string) => canSendCommand(permissions, commandType, memberId).allowed,
    [permissions],
  );
  return useMemo(
    () =>
      view === null
        ? null
        : {
            view,
            scene,
            can,
            text,
            run: (command, options) => {
              void send(command, options);
            },
          },
    [view, scene, can, send, text],
  );
}

/** What the table learned about doors this session, by `{dungeon}:{level}:{edge key}`. */
export function useSessionDoors(): Lore['doors'] {
  const tableId = useTableId();
  const sessionId = useTableStore((s) => s.game?.session_id ?? null);
  return useLorePart(tableId, sessionId, 'doors');
}

/** The source of each member's burning light this session, such as `torch`. */
export function useSessionLights(): Lore['lights'] {
  const tableId = useTableId();
  const sessionId = useTableStore((s) => s.game?.session_id ?? null);
  return useLorePart(tableId, sessionId, 'lights');
}

/**
 * Keeps the session lore current: it records the party's location at each revision and reads each new feed
 * entry once. Mount it once, in the map stage.
 */
export function useLoreTracker(): void {
  const store = useTableStoreApi();
  const update = useLoreStore((s) => s.update);
  useEffect(() => {
    const apply = () => {
      const state = store.getState();
      const game = state.game;
      if (game === null) return;
      update(state.tableId, game.session_id, (lore) =>
        learnFromFeed(
          observeLocation(lore, game.revision, game.view.location),
          state.feed,
          game.session_id,
          game.revision,
        ),
      );
    };
    apply();
    return store.subscribe((state, previous) => {
      if (state.game !== previous.game || state.feed !== previous.feed) apply();
    });
  }, [store, update]);
}

const listings = new Map<string, Promise<Record<string, string>>>();

/**
 * The names of the dungeons of the table's adventure, by dungeon ID. A referee with the lens on reads them from
 * the adventure document. Everyone else reads them from the table's adventure list, which holds only what a
 * player may know before play.
 */
export function useDungeonNames(): Record<string, string> {
  const tableId = useTableId();
  const adventureId = useTableStore((s) => s.game?.adventure_id ?? null);
  const adventureName = useTableStore((s) => s.game?.adventure_name ?? null);
  const document = useAdventureDocument().data;
  const [listed, setListed] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const key = `${tableId}:${adventureId ?? adventureName ?? ''}`;
    let request = listings.get(key);
    if (request === undefined) {
      request = getApi()
        .listAdventures(tableId)
        .then((list) => {
          const listing =
            list.items.find((item) => item.id === adventureId) ??
            list.items.find((item) => item.info.name === adventureName);
          const names: Record<string, string> = {};
          for (const dungeon of listing?.info.dungeons ?? []) names[dungeon.id] = dungeon.name;
          return names;
        });
      listings.set(key, request);
      request.catch(() => listings.delete(key));
    }
    request.then(
      (names) => {
        if (!cancelled) setListed(names);
      },
      () => {
        // Without names, the switcher says "Level 2", which is still clear.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tableId, adventureId, adventureName]);

  return useMemo(() => {
    const names = { ...listed };
    for (const dungeon of adventureDungeons(document)?.dungeons ?? []) names[dungeon.id] = dungeon.name;
    return names;
  }, [listed, document]);
}

/**
 * The name of a level for the switcher: `Level 2`, or with the dungeon's name when the adventure has more than
 * one dungeon.
 */
export function levelLabel(
  option: LevelOption,
  levels: readonly LevelOption[],
  names: Record<string, string>,
): string {
  const dungeons = new Set(levels.map((level) => level.dungeonId));
  const name = names[option.dungeonId];
  return dungeons.size > 1 && name ? `${name}, level ${option.levelNumber}` : `Level ${option.levelNumber}`;
}

/**
 * Whether the party can go back to town from where it stands, as the scene states it: it is exploring and stands
 * on the level's entrance.
 */
export function useCanTravelToTown(): boolean {
  const scene = useScene();
  return scene?.can_travel_to_town ?? scene?.here?.at_entrance ?? false;
}
