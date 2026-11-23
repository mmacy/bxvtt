/**
 * Hooks that only the town needs: the dungeons the party can travel to, who may lead the party out, and the
 * members the viewer can shop for.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { useEffect, useMemo, useState } from 'react';
import {
  getApi,
  useCanSend,
  useControllableMembers,
  useGame,
  useLegalCommands,
  useParty,
  usePlayerView,
  useTableId,
} from '@/app';
import { townListsService } from './services';

/** A dungeon the party can set out for. */
export interface Dungeon {
  id: string;
  name: string;
}

const dungeonCache = new Map<string, Promise<Dungeon[]>>();

/** Forgets the dungeon lists that were read, so a test starts clean. */
export function resetDungeonCache(): void {
  dungeonCache.clear();
}

function loadDungeons(tableId: string, adventureId: string | null): Promise<Dungeon[]> {
  const key = `${tableId}:${adventureId ?? ''}`;
  const known = dungeonCache.get(key);
  if (known !== undefined) return known;
  const request = getApi()
    .listAdventures(tableId)
    .then((list) => {
      const listing = list.items.find((item) => item.id === adventureId);
      return (listing?.info.dungeons ?? []).map((dungeon) => ({ id: dungeon.id, name: dungeon.name }));
    });
  dungeonCache.set(key, request);
  request.catch(() => dungeonCache.delete(key));
  return request;
}

/**
 * The dungeons of the adventure being played. The server lists the table's adventures with what a player may
 * know before play, including each dungeon's name, so every member can read them.
 *
 * @returns The dungeons, or `null` while they load or when the list is unavailable.
 */
export function useDungeons(): { dungeons: Dungeon[] | null; failed: boolean; retry: () => void } {
  const tableId = useTableId();
  const adventureId = useGame()?.adventure_id ?? null;
  const [state, setState] = useState<{ key: string; dungeons: Dungeon[] | null; failed: boolean }>({
    key: '',
    dungeons: null,
    failed: false,
  });
  const [attempt, setAttempt] = useState(0);
  const key = `${tableId}:${adventureId ?? ''}`;

  useEffect(() => {
    let cancelled = false;
    loadDungeons(tableId, adventureId).then(
      (dungeons) => {
        if (!cancelled) setState({ key, dungeons, failed: false });
      },
      () => {
        if (!cancelled) setState({ key, dungeons: null, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tableId, adventureId, key, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  return state.key === key
    ? { dungeons: state.dungeons, failed: state.failed, retry }
    : { dungeons: null, failed: false, retry };
}

/**
 * Whether the viewer may send a party command, and the reason to show when they may not. The reason comes from
 * `useCanSend`, so it names the action and the caller, or says when the command works.
 *
 * @param commandType - A party command such as `enter_dungeon` or `sell_treasure`.
 * @returns `allowed`, and `explanation` (empty when allowed).
 */
export function usePartyAccess(commandType: string): { allowed: boolean; explanation: string } {
  const permission = useCanSend(commandType);
  return { allowed: permission.allowed, explanation: permission.reason ?? '' };
}

/** Whether the viewer may lead the party out of town. See {@link usePartyAccess}. */
export function useLeaveAccess(): { allowed: boolean; explanation: string } {
  return usePartyAccess('enter_dungeon');
}

/**
 * The party members the viewer can shop for, in marching order: their seats, or everyone for a referee.
 */
export function useShoppers(): MemberView[] {
  const party = useParty();
  const controllable = useControllableMembers();
  return useMemo(() => party.filter((member) => controllable.includes(member.id)), [party, controllable]);
}

/** Which parts of the town the viewer can use now: a command that is legal and permitted for them. */
export interface TownServices {
  outfitter: boolean;
  temple: boolean;
  treasure: boolean;
  rest: boolean;
  leave: boolean;
  /** Why each service is unavailable, or `null` while it is available. */
  reasons: Record<'outfitter' | 'temple' | 'treasure' | 'rest' | 'leave', string | null>;
}

/**
 * Picks the reason a service is unavailable. A command that isn't legal gets the permission reason, which says
 * when the command works. A legal command that the town doesn't offer gets the sentence about the town.
 *
 * @param legal - Whether the command is in the viewer's legal commands.
 * @param offered - Whether the town offers the service.
 * @param permissionReason - The reason from `useCanSend` for the command.
 * @param townSentence - What to say when the town doesn't offer the service.
 * @returns The reason, or `null` when the service is available.
 */
export function serviceReason(
  legal: boolean,
  offered: boolean,
  permissionReason: string | null,
  townSentence: string,
): string | null {
  if (!legal) return permissionReason ?? townSentence;
  return offered ? null : townSentence;
}

/**
 * Reads which services the town offers the viewer. A service shows only when its command is legal now and the
 * viewer's role may send it, and the temple also needs prices from the town.
 */
export function useTownServices(): TownServices {
  const commands = useLegalCommands();
  const view = usePlayerView();
  const equipment = useCanSend('purchase_equipment');
  const healing = useCanSend('purchase_healing');
  const treasure = useCanSend('sell_treasure');
  const rest = useCanSend('rest');
  const leave = useCanSend('enter_dungeon');
  const prices = view?.town_healing_prices ?? {};
  const lines = view?.town_services ?? [];
  const town = view?.town_name || 'town';
  const has = (type: string) => commands.some((command) => command.command_type === type);
  const offersOutfitter = townListsService('outfitter', lines);
  const offersTemple = Object.keys(prices).length > 0 && townListsService('temple', lines);
  const offersTreasure = townListsService('treasure', lines);
  return {
    outfitter: has('purchase_equipment') && offersOutfitter,
    temple: has('purchase_healing') && offersTemple,
    treasure: has('sell_treasure') && offersTreasure,
    rest: has('rest'),
    leave: has('enter_dungeon'),
    reasons: {
      outfitter: serviceReason(
        has('purchase_equipment'),
        offersOutfitter,
        equipment.reason,
        `Nobody in ${town} sells equipment.`,
      ),
      temple: serviceReason(
        has('purchase_healing'),
        offersTemple,
        healing.reason,
        `${town} has no temple that offers healing.`,
      ),
      treasure: serviceReason(
        has('sell_treasure'),
        offersTreasure,
        treasure.reason,
        `Nobody in ${town} buys treasure.`,
      ),
      rest: has('rest') ? null : rest.reason,
      leave: has('enter_dungeon') ? null : leave.reason,
    },
  };
}
