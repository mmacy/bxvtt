/**
 * Hooks that read the open table. Each one reads the store of the surrounding `TableProvider`.
 *
 * Referee-only hooks (`useRefereeState`, `useRefereeNotes`, and the referee part of `useTextContext`) return
 * `null` when the user isn't a referee or the referee lens is off, so referee interface disappears with them.
 */
import type {
  DeclarationsState,
  FeedEntry,
  GameState,
  LegalCommand,
  LevelAnnotations,
  LevelRef,
  Member,
  Notes,
  PlayerView,
  RefereeState,
  Role,
  Seat,
  TableDetail,
  TableSettings,
  User,
} from '@bxvtt/shared/protocol';
import type { EncounterView, MemberView } from '@bxvtt/shared/bxapi';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApi, reportError } from '../api';
import { partyHere, type Here } from '../here';
import {
  canActForParty,
  canControlMember,
  canDeclare,
  canResolveRound,
  canSendCommand,
  seatedMemberIds,
  type Permission,
  type PermissionContext,
} from '../permissions';
import { usePreferences } from '../preferences';
import { useCommandCatalog } from '../rules';
import { useTableStore, useTableStoreApi } from './context';
import { levelKey, type TableNotice, type TablePing } from './store';
import type { TableConnectionStatus } from './store';

// Connection and table ----------------------------------------------------------------------------------------

/** The open table's ID. */
export function useTableId(): string {
  return useTableStore((s) => s.tableId);
}

/** The connection's state: `connecting`, `authenticating`, `open`, `reconnecting`, or `closed`. */
export function useConnectionStatus(): TableConnectionStatus {
  return useTableStore((s) => s.status);
}

/**
 * The last error the server sent on the socket, such as `rate_limited` with "You have too many connections to
 * this table." `ConnectionBanner` shows it. The next snapshot clears it.
 */
export function useConnectionError(): { code: string; detail: string } | null {
  return useTableStore((s) => s.connectionError);
}

/** The table: name, invite code, phase, settings, members, roster, and game summary. `null` before the snapshot. */
export function useTableDetail(): TableDetail | null {
  return useTableStore((s) => s.table);
}

/** The table's settings, or `null` before the snapshot. */
export function useTableSettings(): TableSettings | null {
  return useTableStore((s) => s.table?.settings ?? null);
}

/** The signed-in user as the table's snapshot reports them. */
export function useTableUser(): User | null {
  return useTableStore((s) => s.user);
}

/** The user's membership: their member entry with role and color, or `null`. */
export function useMyMembership(): Member | null {
  const members = useTableStore((s) => s.table?.members);
  const userId = useTableStore((s) => s.user?.id);
  return useMemo(() => members?.find((m) => m.user_id === userId) ?? null, [members, userId]);
}

/** The user's role at the table, or `null` before the snapshot. */
export function useMyRole(): Role | null {
  return useTableStore((s) => s.role);
}

/** Whether the user is a referee of the table, whatever the lens says. Use it for permissions. */
export function useIsReferee(): boolean {
  return useTableStore((s) => s.role === 'referee');
}

/**
 * Whether referee interface shows: the user is a referee and the referee lens is on. Use it to decide whether
 * to render a referee control.
 */
export function useRefereeLens(): boolean {
  const referee = useIsReferee();
  const lens = usePreferences((s) => s.refereeLens);
  return referee && lens;
}

/** The members with whether each is online, in the order the table lists them. */
export function useMembers(): Array<Member & { online: boolean }> {
  const members = useTableStore((s) => s.table?.members);
  const online = useTableStore((s) => s.online);
  return useMemo(() => {
    const set = new Set(online);
    return (members ?? []).map((member) => ({ ...member, online: set.has(member.user_id) }));
  }, [members, online]);
}

/** The IDs of the users connected to the table now. */
export function usePresence(): ReadonlySet<string> {
  const online = useTableStore((s) => s.online);
  return useMemo(() => new Set(online), [online]);
}

/**
 * A member by user ID, for showing who did something.
 *
 * @param userId - The user ID, or `null`.
 */
export function useMember(userId: string | null | undefined): Member | null {
  const members = useTableStore((s) => s.table?.members);
  return useMemo(() => members?.find((m) => m.user_id === userId) ?? null, [members, userId]);
}

// Game ---------------------------------------------------------------------------------------------------------

/** The whole game state, or `null` in the lobby. Prefer a narrower hook below. */
export function useGame(): GameState | null {
  return useTableStore((s) => s.game);
}

/** The session mode: `town`, `exploring`, `encounter`, `battle`, `game_over`, or `victory`. `null` in the lobby. */
export function useGameMode(): string | null {
  return useTableStore((s) => s.game?.mode ?? null);
}

/** The game's revision. `useSendCommand` sends it as `expected_revision` for you. */
export function useRevision(): number | null {
  return useTableStore((s) => s.game?.revision ?? null);
}

/** bxapi's player view, or `null` in the lobby. */
export function usePlayerView(): PlayerView | null {
  return useTableStore((s) => s.game?.view ?? null);
}

/** What the party perceives where it stands, from the player view, or `null` in town. */
export function useHere(): Here | null {
  const view = useTableStore((s) => s.game?.view ?? null);
  return useMemo(() => (view === null ? null : partyHere(view)), [view]);
}

/** Where the party is: `{ kind: 'town' }` or a dungeon cell with its facing. */
export function usePartyLocation(): PlayerView['location'] | null {
  return useTableStore((s) => s.game?.view.location ?? null);
}

/** The commands that are legal now and that the user's role may send. */
export function useLegalCommands(): readonly LegalCommand[] {
  const commands = useTableStore((s) => s.game?.commands);
  return commands ?? EMPTY_COMMANDS;
}
const EMPTY_COMMANDS: readonly LegalCommand[] = [];

/** One legal command, or `null` when it isn't legal now. */
export function useLegalCommand(commandType: string): LegalCommand | null {
  const commands = useLegalCommands();
  return useMemo(() => commands.find((c) => c.command_type === commandType) ?? null, [commands, commandType]);
}

/** The party's character sheets in marching order, the dead included. */
export function useParty(): readonly MemberView[] {
  const party = useTableStore((s) => s.game?.view.party);
  return party ?? EMPTY_PARTY;
}
const EMPTY_PARTY: readonly MemberView[] = [];

/** One party member's sheet, or `null`. */
export function usePartyMember(memberId: string | null | undefined): MemberView | null {
  const party = useParty();
  return useMemo(() => party.find((m) => m.id === memberId) ?? null, [party, memberId]);
}

/** Every seat: which user controls which party member. `user_id: null` is an empty seat. */
export function useSeats(): readonly Seat[] {
  const seats = useTableStore((s) => s.game?.seats);
  return seats ?? EMPTY_SEATS;
}
const EMPTY_SEATS: readonly Seat[] = [];

/** The party member IDs in the user's seats. */
export function useMySeats(): readonly string[] {
  const seats = useSeats();
  const userId = useTableStore((s) => s.user?.id ?? null);
  return useMemo(() => seats.filter((s) => s.user_id === userId).map((s) => s.member_id), [seats, userId]);
}

/** The caller: the member who speaks for the party, and whether it is this user. */
export function useCaller(): { member: Member | null; isMe: boolean } {
  const callerId = useTableStore((s) =>
    s.table !== null ? s.table.settings.caller_user_id : (s.game?.caller_user_id ?? null),
  );
  const userId = useTableStore((s) => s.user?.id ?? null);
  const member = useMember(callerId);
  return useMemo(
    () => ({ member, isMe: callerId !== null && callerId === userId }),
    [member, callerId, userId],
  );
}

/** The open encounter or battle, or `null`. */
export function useEncounter(): EncounterView | null {
  return useTableStore((s) => s.game?.view.encounter ?? null);
}

/** The current battle round's declarations, or `null` outside a battle. */
export function useDeclarations(): DeclarationsState | null {
  return useTableStore((s) => s.declarations);
}

/**
 * The dynamic referee state, or `null` for a player and for a referee with the lens off.
 */
export function useRefereeState(): RefereeState | null {
  const lens = useRefereeLens();
  const referee = useTableStore((s) => s.game?.referee ?? null);
  return lens ? referee : null;
}

// Permissions ------------------------------------------------------------------------------------------------

/** The data the permission checks read. */
export function usePermissionContext(): PermissionContext {
  const userId = useTableStore((s) => s.user?.id ?? null);
  const role = useTableStore((s) => s.role);
  const game = useTableStore((s) => s.game);
  const settings = useTableStore((s) => s.table?.settings ?? null);
  const members = useTableStore((s) => s.table?.members);
  const lens = usePreferences((s) => s.refereeLens);
  // The catalog says in which modes a command works, for the reason on a command that isn't legal now.
  const catalog = useCommandCatalog().data;
  return useMemo(
    () => ({ userId, role, game, settings, lens, members, catalog }),
    [userId, role, game, settings, lens, members, catalog],
  );
}

/**
 * Whether the user may send a command now, with a reason to show on a disabled control.
 *
 * ```tsx
 * const permission = useCanSend('cast_spell', member.id);
 * <Button disabled={!permission.allowed} disabledReason={permission.reason}>Cast</Button>
 * ```
 *
 * @param commandType - The command type.
 * @param memberId - The acting member, for a member command.
 */
export function useCanSend(commandType: string, memberId?: string): Permission {
  const ctx = usePermissionContext();
  return useMemo(() => canSendCommand(ctx, commandType, memberId), [ctx, commandType, memberId]);
}

/** Whether the user may act for a party member: their seat, or a referee. */
export function useCanControlMember(memberId: string): Permission {
  const ctx = usePermissionContext();
  return useMemo(() => canControlMember(ctx, memberId), [ctx, memberId]);
}

/** Whether the user may act for the whole party: the caller, a referee, or a seated member when anyone may. */
export function useCanActForParty(): Permission {
  const ctx = usePermissionContext();
  return useMemo(() => canActForParty(ctx), [ctx]);
}

/** Whether the user may save a declaration for a member this round. */
export function useCanDeclare(memberId: string): Permission {
  const ctx = usePermissionContext();
  return useMemo(() => canDeclare(ctx, memberId), [ctx, memberId]);
}

/** Whether the user may resolve the round, or with `early`, resolve it before everyone declares. */
export function useCanResolveRound(options: { early?: boolean } = {}): Permission {
  const ctx = usePermissionContext();
  const early = options.early ?? false;
  return useMemo(() => canResolveRound(ctx, { early }), [ctx, early]);
}

/** The member IDs the user can act for: their seats, and every member for a referee. */
export function useControllableMembers(): readonly string[] {
  const ctx = usePermissionContext();
  return useMemo(() => {
    if (ctx.role === 'referee') return ctx.game?.view.party.map((m) => m.id) ?? [];
    return seatedMemberIds(ctx);
  }, [ctx]);
}

// Feed, notes, annotations, pings, notices -------------------------------------------------------------------

/** The feed entries this client has, oldest first. Every entry is one the user may read. */
export function useFeed(): readonly FeedEntry[] {
  return useTableStore((s) => s.feed);
}

/**
 * Loads the page of feed entries before the oldest one here.
 *
 * @returns `loadOlder`, whether older entries exist, and whether a page is loading.
 */
export function useOlderFeed(): { loadOlder: () => Promise<void>; hasOlder: boolean; loading: boolean } {
  const store = useTableStoreApi();
  const hasOlder = useTableStore((s) => s.feedHasOlder);
  const [loading, setLoading] = useState(false);
  const loadOlder = useCallback(async () => {
    const state = store.getState();
    const first = state.feed[0];
    if (first === undefined || !state.feedHasOlder) return;
    setLoading(true);
    try {
      const page = await getApi().getFeed(state.tableId, { before: first.seq, limit: 100 });
      store.getState().receiveFeedPage(page, 'older');
    } catch (error) {
      reportError(error, { title: "Couldn't load older messages" });
    } finally {
      setLoading(false);
    }
  }, [store]);
  return { loadOlder, hasOlder, loading };
}

/** The party notes, which every member can read and edit. */
export function usePartyNotes(): Notes | null {
  return useTableStore((s) => s.notes.party);
}

/** The referee notes, or `null` for a player and for a referee with the lens off. */
export function useRefereeNotes(): Notes | null {
  const lens = useRefereeLens();
  const notes = useTableStore((s) => s.notes.referee);
  return lens ? notes : null;
}

/**
 * The annotations of one level. The snapshot holds the party's level; another level loads on first use, and
 * `annotations` messages keep every loaded level current.
 *
 * @param level - The level, or `null` for none.
 * @returns The annotations, or `null` while they load.
 */
export function useAnnotations(level: LevelRef | null): LevelAnnotations | null {
  const store = useTableStoreApi();
  const key = level === null ? null : levelKey(level);
  const annotations = useTableStore((s) => (key === null ? null : (s.annotations[key] ?? null)));
  const dungeonId = level?.dungeon_id;
  const levelNumber = level?.level_number;
  useEffect(() => {
    if (dungeonId === undefined || levelNumber === undefined || annotations !== null) return;
    let cancelled = false;
    const tableId = store.getState().tableId;
    getApi()
      .getAnnotations(tableId, { dungeon_id: dungeonId, level_number: levelNumber })
      .then((result) => {
        if (!cancelled) store.getState().receiveAnnotations(result);
      })
      .catch(() => {
        // The map shows no annotations for the level, and the next `annotations` message fills them in.
      });
    return () => {
      cancelled = true;
    };
  }, [store, dungeonId, levelNumber, annotations]);
  return annotations;
}

/** The map pings of the last few seconds. Each expires by itself. */
export function usePings(): readonly TablePing[] {
  return useTableStore((s) => s.pings);
}

/** A function that pings the map for everyone at the table. */
export function useSendPing(): (ping: {
  dungeon_id: string;
  level_number: number;
  x: number;
  y: number;
}) => void {
  return useTableStore((s) => s.sendPing);
}

/** Recent notices, such as `game_restored`. The shell already shows each one as a toast. */
export function useNotices(): readonly TableNotice[] {
  return useTableStore((s) => s.notices);
}
