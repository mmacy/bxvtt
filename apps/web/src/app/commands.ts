/**
 * Sending intent to the server: bxapi commands, battle declarations, referee commands, and any other request
 * that needs a pending state and an error message.
 *
 * Every path shows bxapi's refusal in the game's terms with `describeRejection`, as a toast by default or
 * returned to the caller for inline display, and handles a revision conflict with a calm "the table changed"
 * notice. A client sends one command at a time per table. A deliberate action that arrives while another is in
 * flight waits its turn, and a repeatable input such as a held key is dropped instead.
 */
import { isProblem } from '@bxvtt/shared/client';
import type {
  CommandResult,
  DeclarationBody,
  DeclarationsState,
  Rejection,
  ResolveRoundResult,
} from '@bxvtt/shared/protocol';
import { commandInfo, describeRejection, describeRejections, type TextContext } from '@bxvtt/shared/text';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/ui';
import { describeProblem, getApi, type ProblemMessage } from './api';
import { toParamMap } from './params';
import { canSendCommand } from './permissions';
import { useTableStore, useTableStoreApi } from './table/context';
import { usePermissionContext } from './table/hooks';
import { announceNotice } from './table/session';
import type { TableStore } from './table/store';
import { useTextContext } from './text';

/** A bxapi command: `command_type` and its fields, which bxapi checks against the command's schema. */
export type GameCommand = { command_type: string } & Record<string, unknown>;

/**
 * How a refusal or error reaches the player:
 *
 * - `toast` (default): the hook shows a toast, and the result still has the message.
 * - `inline`: the hook shows nothing, and the caller shows `result.message`, such as in a `Banner` next to a form.
 */
export type RefusalDisplay = 'toast' | 'inline';

export interface SendOptions {
  display?: RefusalDisplay;
  /**
   * Marks a repeatable input, such as a held or repeated movement key. While another command is in flight, or
   * while the client paces rapid commands, a repeatable send is dropped without a word, so a held key never stacks
   * up steps. Leave it out for a deliberate action (a click, a menu choice, a form, a shortcut): the client
   * queues it and sends it as soon as it can.
   */
  repeatable?: boolean;
}

/** Why the client didn't send a command. */
export type SkipReason = 'busy' | 'throttled' | 'no_game' | 'not_allowed' | 'stale' | 'expired';

/**
 * The most commands one client sends in a second. The server allows each user 100 requests that change
 * something every 20 seconds, so 4 a second leaves room for chat, declarations, and annotations while a player
 * holds an arrow key to walk the party.
 */
export const COMMANDS_PER_SECOND = 4;

/** The most deliberate actions that wait behind the command in flight. */
export const MAX_QUEUED_COMMANDS = 3;

/** How long a deliberate action may wait to send, in milliseconds. After that the client drops it and says so. */
export const QUEUED_COMMAND_MAX_WAIT_MS = 5000;

const recentSends = new WeakMap<TableStore, number[]>();

/**
 * Records a send unless the table already had {@link COMMANDS_PER_SECOND} sends in the last second.
 *
 * @returns Whether the command may go now.
 */
export function takeSendSlot(store: TableStore, now: number = Date.now()): boolean {
  const recent = (recentSends.get(store) ?? []).filter((time) => now - time < 1000);
  if (recent.length >= COMMANDS_PER_SECOND) {
    recentSends.set(store, recent);
    return false;
  }
  recent.push(now);
  recentSends.set(store, recent);
  return true;
}

/** Milliseconds until {@link takeSendSlot} allows another send. */
function slotWait(store: TableStore, now: number): number {
  const recent = (recentSends.get(store) ?? []).filter((time) => now - time < 1000);
  if (recent.length < COMMANDS_PER_SECOND) return 0;
  return Math.max(1, (recent[0] ?? now) + 1000 - now);
}

/** What happened to a command. */
export type SendResult =
  /** bxapi accepted it. The store already holds the new game state. */
  | { status: 'accepted'; result: CommandResult }
  /** bxapi refused it. `message` explains why in the game's terms, one sentence per rejection. */
  | {
      status: 'refused';
      message: string;
      sentences: string[];
      rejections: Rejection[];
      result: CommandResult;
    }
  /** The game moved on before the command arrived. The store has the new state. Let the user choose again. */
  | { status: 'conflict' }
  /**
   * The client didn't send it. `reason` says why: another command is in flight (`busy`), the client is pacing
   * rapid commands (`throttled`), no game is running (`no_game`), the user may not send it (`not_allowed`), the
   * game changed while the action waited, so it no longer fits (`stale`), or it waited too long (`expired`).
   * Only a repeatable send is skipped as `busy` or `throttled` without a word.
   */
  | { status: 'skipped'; reason: SkipReason; message: string }
  /** The request failed. */
  | ErrorResult;

function refusalToast(sentences: string[]): void {
  const [first = "You can't do that right now.", ...rest] = sentences;
  toast.warning(first, { description: rest.length > 0 ? rest.join(' ') : undefined, id: 'command-refused' });
}

async function refreshGame(store: TableStore): Promise<void> {
  try {
    const game = await getApi().getGame(store.getState().tableId);
    store.getState().receiveGame(game);
  } catch {
    // The server pushes the new state too, so a failed read here loses nothing.
  }
}

/** A failed request, in every result type below. */
export type ErrorResult = { status: 'error'; message: string; problem: ProblemMessage };

function errorResult(error: unknown, display: RefusalDisplay): ErrorResult {
  const problem = describeProblem(error);
  if (display === 'toast')
    toast.error(problem.title, { description: problem.detail, id: `problem-${problem.code}` });
  return { status: 'error', message: `${problem.title}. ${problem.detail}`, problem };
}

/** Keeps the latest value in a ref, for callbacks that must not change identity. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

// The send lane ---------------------------------------------------------------------------------------------

/** Fields that name a place relative to the party, so the command means something else once the party moves. */
const PLACE_FIELDS = ['direction', 'x', 'y', 'feature_id'] as const;

/** What the player saw when they chose an action, to tell whether it still fits when it would send. */
interface Situation {
  mode: string | null;
  /** The party's cell, or `null` in town. */
  cell: string | null;
  /** Whether bxapi listed the command as legal. */
  legal: boolean;
}

function situationOf(store: TableStore, commandType: string): Situation {
  const game = store.getState().game;
  const location = game?.view.location;
  return {
    mode: game?.mode ?? null,
    cell:
      location?.kind === 'dungeon'
        ? `${location.dungeon_id}:${location.level_number}:${location.position?.join(',') ?? ''}`
        : null,
    legal: game?.commands.some((command) => command.command_type === commandType) ?? false,
  };
}

const MODE_CHANGES: Record<string, string> = {
  encounter: 'monsters appeared',
  battle: 'a battle began',
  exploring: 'the fight ended',
  town: 'the party returned to town',
  game_over: 'the game ended',
  victory: 'the game ended',
};

/** Why a waiting action no longer fits, or `null` when it still does. */
function staleReason(command: GameCommand, then: Situation, now: Situation): string | null {
  if (now.mode !== then.mode) return MODE_CHANGES[now.mode ?? ''] ?? 'the situation changed';
  if (then.legal && !now.legal) return "it's no longer available";
  if (now.cell !== then.cell && PLACE_FIELDS.some((field) => field in command))
    return 'the party moved first';
  return null;
}

function droppedMessage(command: GameCommand, reason: string): string {
  return `Couldn't ${commandInfo(command.command_type).phrase} because ${reason}. Choose it again if you still want to.`;
}

interface Waiting {
  key: string;
  command: GameCommand;
  display: RefusalDisplay;
  situation: Situation;
  queuedAt: number;
  ctx: { current: TextContext };
  promise: Promise<SendResult>;
  resolve: (result: SendResult) => void;
}

interface Lane {
  inFlight: { key: string; promise: Promise<SendResult> } | null;
  queue: Waiting[];
  timer: ReturnType<typeof setTimeout> | null;
}

const lanes = new WeakMap<TableStore, Lane>();

function laneOf(store: TableStore): Lane {
  let lane = lanes.get(store);
  if (!lane) {
    lane = { inFlight: null, queue: [], timer: null };
    lanes.set(store, lane);
  }
  return lane;
}

function publishQueue(store: TableStore, lane: Lane): void {
  store.setState({ queuedCommands: lane.queue.map((waiting) => waiting.command.command_type) });
}

/** The same command with the same fields, so a double click on one control queues once. */
function commandKey(command: GameCommand): string {
  return JSON.stringify(
    Object.keys(command)
      .sort()
      .map((field) => [field, command[field]]),
  );
}

/** Sends one command now and records it as the lane's command in flight. */
function transmit(
  store: TableStore,
  lane: Lane,
  key: string,
  command: GameCommand,
  display: RefusalDisplay,
  ctx: { current: TextContext },
): Promise<SendResult> {
  const state = store.getState();
  const game = state.game;
  if (game === null) {
    pump(store, lane);
    return Promise.resolve({ status: 'skipped', reason: 'no_game', message: 'No game is running.' });
  }
  const run = async (): Promise<SendResult> => {
    store.setState({ pendingCommand: command.command_type });
    try {
      const result = await getApi().sendCommand(state.tableId, command, game.revision);
      store.getState().receiveGame(result.game);
      if (!result.accepted) {
        const sentences = describeRejections(result.rejections, ctx.current);
        if (display === 'toast') refusalToast(sentences);
        return {
          status: 'refused',
          message: sentences.join(' '),
          sentences,
          rejections: result.rejections,
          result,
        };
      }
      return { status: 'accepted', result };
    } catch (error) {
      if (isProblem(error, 'revision_conflict')) {
        announceNotice('table_changed');
        await refreshGame(store);
        return { status: 'conflict' };
      }
      return errorResult(error, display);
    } finally {
      lane.inFlight = null;
      store.setState({ pendingCommand: null });
      pump(store, lane);
    }
  };
  const promise = run();
  lane.inFlight = { key, promise };
  return promise;
}

/**
 * Sends the next waiting action when nothing is in flight and the pacing allows. An action that waited too long,
 * or whose situation changed, is dropped with one calm line instead.
 */
function pump(store: TableStore, lane: Lane): void {
  if (lane.timer !== null) {
    clearTimeout(lane.timer);
    lane.timer = null;
  }
  const now = Date.now();
  while (lane.queue.length > 0) {
    const head = lane.queue[0];
    if (!head) break;
    let message: string | null = null;
    let reason: SkipReason = 'stale';
    if (now - head.queuedAt >= QUEUED_COMMAND_MAX_WAIT_MS) {
      message = droppedMessage(head.command, 'the action before it took too long');
      reason = 'expired';
    } else if (lane.inFlight === null) {
      const stale = staleReason(head.command, head.situation, situationOf(store, head.command.command_type));
      if (stale !== null) message = droppedMessage(head.command, stale);
    }
    if (message !== null) {
      lane.queue.shift();
      if (head.display === 'toast') toast.info(message, { id: 'command-dropped' });
      head.resolve({ status: 'skipped', reason, message });
      continue;
    }
    if (lane.inFlight !== null) {
      // Wake up to drop the head if the command in flight takes too long.
      lane.timer = setTimeout(() => pump(store, lane), head.queuedAt + QUEUED_COMMAND_MAX_WAIT_MS - now);
      break;
    }
    const wait = slotWait(store, now);
    if (wait > 0) {
      lane.timer = setTimeout(() => pump(store, lane), wait);
      break;
    }
    lane.queue.shift();
    takeSendSlot(store, now);
    const sent = transmit(store, lane, head.key, head.command, head.display, head.ctx);
    void sent.then(head.resolve);
    break;
  }
  publishQueue(store, lane);
}

/**
 * Sends bxapi commands for the open table.
 *
 * `send` attaches the current revision as `expected_revision`, applies the new game state, and explains a
 * refusal with `describeRejection`. One command is in flight at a time, and the client sends at most
 * {@link COMMANDS_PER_SECOND} a second:
 *
 * - A deliberate action (the default) never drops silently. While another command is in flight or the client
 *   paces commands, it waits in a short queue and sends in order with the revision of that moment. The same
 *   command twice, such as a double click, waits once. A waiting action that no longer fits when its turn comes
 *   (the mode changed, bxapi no longer lists it, or the party moved to another cell and the command names a
 *   direction, cell, or feature), or that waited longer than {@link QUEUED_COMMAND_MAX_WAIT_MS}, is dropped
 *   with one calm line.
 * - A repeatable input (`{ repeatable: true }`), such as a held movement key, is dropped without a word while
 *   another command is in flight, while actions wait, or while the client paces commands.
 *
 * `pendingType` names the action the player asked for most recently that hasn't finished: a waiting action,
 * or the command in flight. So `loading={pendingType === 'rest'}` shows a spinner on Rest while it waits.
 *
 * ```tsx
 * const { send, pendingType } = useSendCommand();
 * <Button loading={pendingType === 'search'} onClick={() => send({ command_type: 'search', kind: 'secret_doors' })}>Search</Button>
 *
 * // A held movement key: drop the extra presses.
 * send({ command_type: 'move_party', direction: 'north' }, { repeatable: true });
 *
 * // Inline display: show the refusal next to the form instead of a toast.
 * const result = await send(command, { display: 'inline' });
 * if (result.status === 'refused') setError(result.message);
 * ```
 *
 * @returns `send`; whether a command is in flight or waiting; the latest such command type; and every one of
 *   them, the command in flight first.
 */
export function useSendCommand(): {
  send: (command: GameCommand, options?: SendOptions) => Promise<SendResult>;
  pending: boolean;
  pendingType: string | null;
  pendingTypes: readonly string[];
} {
  const store = useTableStoreApi();
  const inFlightType = useTableStore((s) => s.pendingCommand);
  const queued = useTableStore((s) => s.queuedCommands);
  const ctxRef = useLatest<TextContext>(useTextContext());

  const send = useCallback(
    async (command: GameCommand, options: SendOptions = {}): Promise<SendResult> => {
      const display = options.display ?? 'toast';
      const lane = laneOf(store);
      if (store.getState().game === null) {
        const message = 'No game is running.';
        if (display === 'toast') toast.warning(message);
        return { status: 'skipped', reason: 'no_game', message };
      }
      const busy = lane.inFlight !== null || lane.queue.length > 0;

      if (options.repeatable) {
        // Pacing is silent: a held key drops the extra presses instead of stacking notices or steps.
        if (busy)
          return { status: 'skipped', reason: 'busy', message: 'Another action is still on its way.' };
        if (!takeSendSlot(store))
          return {
            status: 'skipped',
            reason: 'throttled',
            message: 'Wait a moment before sending another action.',
          };
        return transmit(store, lane, commandKey(command), command, display, ctxRef);
      }

      const key = commandKey(command);
      if (lane.inFlight?.key === key) return lane.inFlight.promise;
      const twin = lane.queue.find((waiting) => waiting.key === key);
      if (twin) return twin.promise;
      if (!busy && takeSendSlot(store)) return transmit(store, lane, key, command, display, ctxRef);
      if (lane.queue.length >= MAX_QUEUED_COMMANDS) {
        const message = 'Several actions are still on their way. Wait a moment and try again.';
        if (display === 'toast') toast.info(message, { id: 'command-queue-full' });
        return { status: 'skipped', reason: 'busy', message };
      }
      let resolve: (result: SendResult) => void = () => {};
      const promise = new Promise<SendResult>((done) => {
        resolve = done;
      });
      lane.queue.push({
        key,
        command,
        display,
        situation: situationOf(store, command.command_type),
        queuedAt: Date.now(),
        ctx: ctxRef,
        promise,
        resolve,
      });
      pump(store, lane);
      return promise;
    },
    [store, ctxRef],
  );

  const pendingTypes = useMemo(
    () => (inFlightType === null ? queued : [inFlightType, ...queued]),
    [inFlightType, queued],
  );
  return {
    send,
    pending: pendingTypes.length > 0,
    pendingType: queued.at(-1) ?? inFlightType,
    pendingTypes,
  };
}

/**
 * Sends referee commands. It is `useSendCommand` with a check first: the user is a referee, the lens is on,
 * and the command is a legal referee command now.
 *
 * ```tsx
 * const { send } = useSendRefereeCommand();
 * await send({ command_type: 'advance_time', amount: 1, unit: 'turn' });
 * ```
 */
export function useSendRefereeCommand(): ReturnType<typeof useSendCommand> {
  const inner = useSendCommand();
  const permissionRef = useLatest(usePermissionContext());
  const innerSend = inner.send;
  const send = useCallback(
    async (command: GameCommand, options: SendOptions = {}): Promise<SendResult> => {
      const permission = canSendCommand(permissionRef.current, command.command_type);
      if (!permission.allowed) {
        if ((options.display ?? 'toast') === 'toast') toast.warning(permission.reason);
        return { status: 'skipped', reason: 'not_allowed', message: permission.reason };
      }
      return innerSend(command, options);
    },
    [innerSend, permissionRef],
  );
  return { ...inner, send };
}

/** What happened to a declaration request. */
export type DeclarationResult =
  | { status: 'saved'; declarations: DeclarationsState }
  | { status: 'skipped'; reason: 'busy'; message: string }
  | ErrorResult;

/** What happened to a request to resolve a round. */
export type ResolveResult =
  /** The round resolved. The store holds the new game and declarations. */
  | { status: 'resolved'; result: ResolveRoundResult }
  /** bxapi refused the round. `refusals` explains each refused declaration, with its member. */
  | {
      status: 'refused';
      message: string;
      refusals: Array<{ memberId: string | null; text: string }>;
      result: ResolveRoundResult;
    }
  | { status: 'skipped'; reason: 'busy'; message: string }
  | ErrorResult;

/**
 * Saves and clears battle declarations, and resolves the round.
 *
 * ```tsx
 * const { declare, resolve, pending } = useSendDeclaration();
 * await declare('character-0001', { action: 'attack', target_group_id: 'group-0001' });
 * await resolve(); // or resolve({ fillWithHold: true }) for a referee resolving early
 * ```
 */
export function useSendDeclaration(): {
  declare: (
    memberId: string,
    declaration: DeclarationBody,
    options?: SendOptions,
  ) => Promise<DeclarationResult>;
  clear: (memberId: string, options?: SendOptions) => Promise<DeclarationResult>;
  resolve: (options?: SendOptions & { fillWithHold?: boolean }) => Promise<ResolveResult>;
  pending: boolean;
} {
  const store = useTableStoreApi();
  const pending = useTableStore((s) => s.pendingDeclaration);
  const ctxRef = useLatest<TextContext>(useTextContext());

  const run = useCallback(
    async <T>(
      work: (tableId: string) => Promise<T>,
    ): Promise<{ ok: true; value: T } | { ok: false; error: unknown } | null> => {
      if (store.getState().pendingDeclaration) return null;
      store.setState({ pendingDeclaration: true });
      try {
        return { ok: true, value: await work(store.getState().tableId) };
      } catch (error) {
        return { ok: false, error };
      } finally {
        store.setState({ pendingDeclaration: false });
      }
    },
    [store],
  );

  const save = useCallback(
    async (
      work: (tableId: string) => Promise<DeclarationsState>,
      options: SendOptions,
    ): Promise<DeclarationResult> => {
      const outcome = await run(work);
      if (outcome === null)
        return { status: 'skipped', reason: 'busy', message: 'Wait for your previous declaration to save.' };
      if (!outcome.ok) return errorResult(outcome.error, options.display ?? 'toast');
      store.getState().receiveDeclarations(outcome.value);
      return { status: 'saved', declarations: outcome.value };
    },
    [run, store],
  );

  const declare = useCallback(
    (memberId: string, declaration: DeclarationBody, options: SendOptions = {}) =>
      save((tableId) => getApi().declare(tableId, memberId, declaration), options),
    [save],
  );

  const clear = useCallback(
    (memberId: string, options: SendOptions = {}) =>
      save((tableId) => getApi().clearDeclaration(tableId, memberId), options),
    [save],
  );

  const resolve = useCallback(
    async (options: SendOptions & { fillWithHold?: boolean } = {}): Promise<ResolveResult> => {
      const display = options.display ?? 'toast';
      const outcome = await run((tableId) => getApi().resolveRound(tableId, options.fillWithHold ?? false));
      if (outcome === null)
        return { status: 'skipped', reason: 'busy', message: 'The round is already resolving.' };
      if (!outcome.ok) return errorResult(outcome.error, display);
      const result = outcome.value;
      store.getState().receiveGame(result.game);
      store.getState().receiveDeclarations(result.declarations);
      if (result.accepted) return { status: 'resolved', result };
      const refusals = result.declarations.refusals.map((refusal) => ({
        memberId: refusal.member_id,
        text: describeRejection({ code: refusal.code, params: toParamMap(refusal.params) }, ctxRef.current),
      }));
      const message = refusals.map((r) => r.text).join(' ');
      if (display === 'toast') refusalToast(refusals.map((r) => r.text));
      return { status: 'refused', message, refusals, result };
    },
    [run, store, ctxRef],
  );

  return { declare, clear, resolve, pending };
}

/**
 * Runs any other API request with a pending state, an error toast, and an optional success toast. Use it for
 * saves, seats, notes, annotations, and the referee's HTTP tools.
 *
 * ```tsx
 * const { run, pending } = useApiAction();
 * await run(() => getApi().createSave(tableId, label), { success: 'Game saved' });
 * ```
 *
 * @returns `run`, which resolves to the response or `null` after a failure, and whether a request is running.
 */
export function useApiAction(): {
  run: <T>(
    work: () => Promise<T>,
    options?: { success?: string; errorTitle?: string; display?: RefusalDisplay },
  ) => Promise<{ ok: true; value: T } | { ok: false; problem: ProblemMessage }>;
  pending: boolean;
} {
  const [count, setCount] = useState(0);
  const run = useCallback(
    async <T>(
      work: () => Promise<T>,
      options: { success?: string; errorTitle?: string; display?: RefusalDisplay } = {},
    ): Promise<{ ok: true; value: T } | { ok: false; problem: ProblemMessage }> => {
      setCount((n) => n + 1);
      try {
        const value = await work();
        if (options.success) toast.success(options.success);
        return { ok: true, value };
      } catch (error) {
        const problem = describeProblem(error);
        if ((options.display ?? 'toast') === 'toast') {
          toast.error(options.errorTitle ?? problem.title, {
            description: options.errorTitle ? `${problem.title}. ${problem.detail}` : problem.detail,
            id: `problem-${problem.code}`,
          });
        }
        return { ok: false, problem };
      } finally {
        setCount((n) => n - 1);
      }
    },
    [],
  );
  return { run, pending: count > 0 };
}
