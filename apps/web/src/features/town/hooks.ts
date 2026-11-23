/**
 * Hooks that only the town needs: the dungeons the party can travel to, who may lead the party out, and the
 * members the viewer can shop for.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { useEffect, useMemo, useState } from 'react';
import {
  getApi,
  useCanSend,
  useCaller,
  useControllableMembers,
  useGame,
  useLegalCommands,
  useParty,
  usePlayerView,
  useTableId,
  useTableSettings,
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
 * Whether the viewer may send a party command, and a calm sentence for everyone who may not. The caller sends
 * party commands, and so does the referee.
 *
 * @param commandType - A party command such as `enter_dungeon` or `sell_treasure`.
 * @returns `allowed`, and `explanation` (empty when allowed).
 */
export function usePartyAccess(commandType: string): { allowed: boolean; explanation: string } {
  const permission = useCanSend(commandType);
  const { member, isMe } = useCaller();
  const settings = useTableSettings();
  if (permission.allowed) return { allowed: true, explanation: '' };
  if (settings?.party_control !== 'anyone' && member !== null && !isMe) {
    return {
      allowed: false,
      explanation: `${member.name} is the caller and speaks for the party here. Ask ${member.name} or the referee.`,
    };
  }
  return { allowed: false, explanation: permission.reason };
}

/** Whether the viewer may lead the party out of town. See {@link usePartyAccess}. */
export function useLeaveAccess(): { allowed: boolean; explanation: string } {
  const access = usePartyAccess('enter_dungeon');
  const { member, isMe } = useCaller();
  const settings = useTableSettings();
  if (!access.allowed && settings?.party_control !== 'anyone' && member !== null && !isMe) {
    return {
      allowed: false,
      explanation: `${member.name} is the caller and leads the party out. Ask ${member.name} or the referee.`,
    };
  }
  return access;
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
}

/**
 * Reads which services the town offers the viewer. A service shows only when its command is legal now and the
 * viewer's role may send it, and the temple also needs prices from the town.
 */
export function useTownServices(): TownServices {
  const commands = useLegalCommands();
  const view = usePlayerView();
  const prices = view?.town_healing_prices ?? {};
  const lines = view?.town_services ?? [];
  const has = (type: string) => commands.some((command) => command.command_type === type);
  return {
    outfitter: has('purchase_equipment') && townListsService('outfitter', lines),
    temple: has('purchase_healing') && Object.keys(prices).length > 0 && townListsService('temple', lines),
    treasure: has('sell_treasure') && townListsService('treasure', lines),
    rest: has('rest'),
    leave: has('enter_dungeon'),
  };
}
