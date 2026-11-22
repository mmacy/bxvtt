/**
 * Sends exploration commands through `useSendCommand`, and adds what exploration needs on top:
 *
 * - The session lore learns from each refusal and from each accepted command's events.
 * - A refused move shows as a bump and a short line on the map instead of a toast, so holding an arrow key
 *   against a wall stays calm.
 * - An accepted command that produced nothing the players can see, such as a failed lock pick, says so.
 */
import { describeEvents, isPlayerVisible, type TextContext } from '@bxvtt/shared/text';
import { useCallback, useEffect, useRef } from 'react';
import { useSendCommand, useTableStoreApi, useTextContext, type GameCommand, type SendResult } from '@/app';
import { toast } from '@/ui';
import { useMapFeedback } from './feedback';
import { learnFromEvents, learnFromRefusal, useLoreStore } from './lore';

export interface ExploreSendOptions {
  /**
   * Where a refusal shows: `map` puts it beside the party (for moves and turns), `inline` leaves it to the caller
   * (for a form), and `toast` (the default) uses the app's refusal toast.
   */
  feedback?: 'map' | 'inline' | 'toast';
  /** What to say when bxapi accepts the command and nothing visible happens. */
  nothingText?: string;
}

/** Commands whose result the map already shows, so no line appears beside the party. */
const QUIET_COMMANDS: ReadonlySet<string> = new Set([
  'move_party',
  'turn_party',
  'use_stairs',
  'travel_to_town',
]);

/** The categories of lines that say what the action itself did, rather than the time it took. */
const OUTCOME_SKIPS: ReadonlySet<string> = new Set(['time', 'journal', 'quest']);

/**
 * The line that says what an accepted command did, for the short note beside the party: the first player-visible
 * line that isn't about time passing.
 */
export function outcomeLine(
  events: Parameters<typeof describeEvents>[0],
  messages: readonly string[],
  ctx: TextContext,
): string | null {
  const lines = describeEvents(events, ctx, { only: 'player', messages: [...messages] });
  return (lines.find((line) => !OUTCOME_SKIPS.has(line.category)) ?? lines[0])?.text ?? null;
}

/** The first sentence of a refusal, which is enough beside the party: `A wall blocks the way west.` */
export function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text);
  return match ? match[0] : text;
}

/** The sentence for an accepted command with no visible result. */
export const NOTHING_HAPPENS = 'Nothing seems to happen.';

/**
 * A `send` for exploration commands, with the lore and the map feedback wired in.
 *
 * @returns `send`, whether a command is in flight, and its type.
 */
export function useExploreSend(): {
  send: (command: GameCommand, options?: ExploreSendOptions) => Promise<SendResult>;
  pending: boolean;
  pendingType: string | null;
} {
  const inner = useSendCommand();
  const innerSend = inner.send;
  const store = useTableStoreApi();
  const updateLore = useLoreStore((s) => s.update);
  const say = useMapFeedback((s) => s.say);
  const bumpInto = useMapFeedback((s) => s.bumpInto);
  const ctx = useTextContext();
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  const send = useCallback(
    async (command: GameCommand, options: ExploreSendOptions = {}): Promise<SendResult> => {
      const before = store.getState().game;
      const onMap = options.feedback === 'map';
      const result = await innerSend(command, {
        display: onMap || options.feedback === 'inline' ? 'inline' : 'toast',
      });
      if (before === null) return result;
      const { tableId } = store.getState();
      const sessionId = before.session_id;
      const location = before.view.location;
      if (result.status === 'refused') {
        updateLore(tableId, sessionId, (lore) =>
          learnFromRefusal(lore, command, result.rejections, location),
        );
        if (onMap) {
          say(firstSentence(result.sentences[0] ?? result.message));
          const direction = command['direction'] ?? command['facing'];
          if (
            command.command_type === 'move_party' &&
            (direction === 'north' || direction === 'east' || direction === 'south' || direction === 'west')
          ) {
            bumpInto(direction);
          }
        }
      } else if (result.status === 'accepted') {
        updateLore(tableId, sessionId, (lore) =>
          learnFromEvents(lore, result.result.events, location, command),
        );
        if (!result.result.events.some((event) => isPlayerVisible(event))) {
          toast.info(options.nothingText ?? NOTHING_HAPPENS, { id: 'explore-nothing' });
        } else if (!QUIET_COMMANDS.has(command.command_type)) {
          const line = outcomeLine(result.result.events, result.result.messages, ctxRef.current);
          if (line) say(line, 'info');
        }
      } else if (result.status === 'error' && onMap) {
        toast.error(result.problem.title, {
          description: result.problem.detail,
          id: `problem-${result.problem.code}`,
        });
      }
      return result;
    },
    [innerSend, store, updateLore, say, bumpInto, ctxRef],
  );

  return { send, pending: inner.pending, pendingType: inner.pendingType };
}
