/**
 * Sending intent to the server: bxapi commands, battle declarations, referee commands, and any other request
 * that needs a pending state and an error message.
 *
 * Every path shows bxapi's refusal in the game's terms with `describeRejection`, as a toast by default or
 * returned to the caller for inline display, and handles a revision conflict with a calm "the table changed"
 * notice. A client sends one command at a time per table, so a double click never sends twice.
 */
import { isProblem } from '@bxvtt/shared/client';
import type {
  CommandResult,
  DeclarationBody,
  DeclarationsState,
  Rejection,
  ResolveRoundResult,
} from '@bxvtt/shared/protocol';
import { describeRejection, describeRejections, type TextContext } from '@bxvtt/shared/text';
import { useCallback, useEffect, useRef, useState } from 'react';
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
}

/** Why the client didn't send a command. */
export type SkipReason = 'busy' | 'throttled' | 'no_game' | 'not_allowed';

/**
 * The most commands one client sends in a second. The server allows each user 100 requests that change
 * something every 20 seconds, so 4 a second leaves room for chat, declarations, and annotations while a player
 * holds an arrow key to walk the party.
 */
export const COMMANDS_PER_SECOND = 4;

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
   * rapid commands (`throttled`), no game is running (`no_game`), or the user may not send it (`not_allowed`).
   */
  | { status: 'skipped'; reason: SkipReason; message: string }
  /** The request failed. */
  | ErrorResult;

function refusalToast(sentences: string[]): void {
  const [first = "That wasn't allowed.", ...rest] = sentences;
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

/**
 * Sends bxapi commands for the open table.
 *
 * `send` attaches the current revision as `expected_revision`, refuses to start while another command is in
 * flight (so a double click sends once), applies the new game state, and explains a refusal with
 * `describeRejection`.
 *
 * ```tsx
 * const { send, pending } = useSendCommand();
 * <Button loading={pending} onClick={() => send({ command_type: 'search', kind: 'secret_doors' })}>Search</Button>
 *
 * // Inline display: show the refusal next to the form instead of a toast.
 * const result = await send(command, { display: 'inline' });
 * if (result.status === 'refused') setError(result.message);
 * ```
 *
 * @returns `send`, whether any command of this client is in flight, and its type.
 */
export function useSendCommand(): {
  send: (command: GameCommand, options?: SendOptions) => Promise<SendResult>;
  pending: boolean;
  pendingType: string | null;
} {
  const store = useTableStoreApi();
  const pendingType = useTableStore((s) => s.pendingCommand);
  const ctxRef = useLatest<TextContext>(useTextContext());

  const send = useCallback(
    async (command: GameCommand, options: SendOptions = {}): Promise<SendResult> => {
      const display = options.display ?? 'toast';
      const state = store.getState();
      if (state.pendingCommand !== null) {
        return { status: 'skipped', reason: 'busy', message: 'Another action is still on its way.' };
      }
      if (state.game === null) {
        const message = 'No game is running.';
        if (display === 'toast') toast.warning(message);
        return { status: 'skipped', reason: 'no_game', message };
      }
      // Pacing is silent: a held key drops the extra presses instead of stacking notices.
      if (!takeSendSlot(store)) {
        return {
          status: 'skipped',
          reason: 'throttled',
          message: 'Slow down a little. The table is catching up.',
        };
      }
      store.setState({ pendingCommand: command.command_type });
      try {
        const result = await getApi().sendCommand(state.tableId, command, state.game.revision);
        store.getState().receiveGame(result.game);
        if (!result.accepted) {
          const sentences = describeRejections(result.rejections, ctxRef.current);
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
        store.setState({ pendingCommand: null });
      }
    },
    [store, ctxRef],
  );

  return { send, pending: pendingType !== null, pendingType };
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
        return { status: 'skipped', reason: 'busy', message: 'Another declaration is still on its way.' };
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
