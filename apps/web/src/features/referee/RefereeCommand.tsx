/**
 * Sends referee commands and shows what each one did, in place: a confirmation built from the events bxapi
 * reported, or bxapi's refusal next to the form that sent it.
 */
import type { GameEvent } from '@bxvtt/shared/protocol';
import { commandInfo, describeEvents, type EventLine } from '@bxvtt/shared/text';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSendRefereeCommand, useTextContext, type GameCommand } from '@/app';
import { Banner, Icon, IconButton } from '@/ui';
import { useEndedGuard } from './endedGuard';
import styles from './referee.module.css';

/** What the last command of one form did. */
export type CommandOutcomeState =
  | { status: 'accepted'; commandType: string; lines: EventLine[]; events: GameEvent[]; id: number }
  | {
      status: 'refused' | 'error' | 'conflict' | 'skipped';
      commandType: string;
      message: string;
      id: number;
    };

let nextOutcomeId = 1;

/**
 * Sends referee commands for one form and remembers the outcome of the last one.
 *
 * @returns `run`, which resolves to whether bxapi accepted the command; `busy` while this form's command is on
 *   its way; the last `outcome`; and `clear`.
 */
export function useRefereeCommand(): {
  run: (command: GameCommand) => Promise<boolean>;
  runAll: (commands: readonly GameCommand[]) => Promise<boolean>;
  busy: boolean;
  outcome: CommandOutcomeState | null;
  clear: () => void;
} {
  const { send } = useSendRefereeCommand();
  const guard = useEndedGuard();
  const ctx = useTextContext();
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CommandOutcomeState | null>(null);

  const sendOne = useCallback(
    async (
      command: GameCommand,
    ): Promise<{ ok: boolean; lines: EventLine[]; events: GameEvent[]; failure?: CommandOutcomeState }> => {
      // Describe the outcome with the names known before the command, so a removed item or a slain monster
      // still reads by name.
      const before = ctxRef.current;
      const result = await send(command, { display: 'inline' });
      const id = nextOutcomeId++;
      const commandType = command.command_type;
      switch (result.status) {
        case 'accepted':
          return {
            ok: true,
            events: result.result.events,
            lines: describeEvents(result.result.events, before, { messages: result.result.messages }),
          };
        case 'refused':
          return {
            ok: false,
            lines: [],
            events: [],
            failure: { status: 'refused', commandType, message: result.message, id },
          };
        case 'conflict':
          return {
            ok: false,
            lines: [],
            events: [],
            failure: {
              status: 'conflict',
              commandType,
              message:
                'The game state changed before your command arrived. Review the current state and try again.',
              id,
            },
          };
        case 'skipped':
          return {
            ok: false,
            lines: [],
            events: [],
            failure: { status: 'skipped', commandType, message: result.message, id },
          };
        case 'error':
          return {
            ok: false,
            lines: [],
            events: [],
            failure: { status: 'error', commandType, message: result.message, id },
          };
      }
    },
    [send],
  );

  const runAll = useCallback(
    async (commands: readonly GameCommand[]): Promise<boolean> => {
      if (commands.length === 0) return false;
      if (!(await guard(commands))) return false;
      setBusy(true);
      try {
        const lines: EventLine[] = [];
        const events: GameEvent[] = [];
        for (const command of commands) {
          let attempt = await sendOne(command);
          // Commands in a batch can arrive faster than the table's pacing allows. Wait a moment and retry once.
          if (attempt.failure?.status === 'skipped') {
            await new Promise((resolve) => setTimeout(resolve, 300));
            attempt = await sendOne(command);
          }
          if (attempt.failure) {
            setOutcome(attempt.failure);
            return false;
          }
          lines.push(...attempt.lines);
          events.push(...attempt.events);
        }
        const last = commands[commands.length - 1];
        setOutcome({
          status: 'accepted',
          commandType: last?.command_type ?? '',
          lines,
          events,
          id: nextOutcomeId++,
        });
        return true;
      } finally {
        setBusy(false);
      }
    },
    [sendOne, guard],
  );

  const run = useCallback((command: GameCommand) => runAll([command]), [runAll]);
  const clear = useCallback(() => setOutcome(null), []);
  return { run, runAll, busy, outcome, clear };
}

/** The most event lines a confirmation shows before it summarizes the rest. */
const MAX_LINES = 4;

/** Shows the outcome of a form's last command: a confirmation, or the reason bxapi refused it. */
export function CommandOutcome({
  outcome,
  onDismiss,
}: {
  outcome: CommandOutcomeState | null;
  onDismiss?: () => void;
}) {
  if (outcome === null) return null;
  if (outcome.status === 'accepted') {
    const shown = outcome.lines.slice(0, MAX_LINES);
    const more = outcome.lines.length - shown.length;
    return (
      <div className={styles.confirm} role="status" key={outcome.id}>
        <Icon name="success" size={16} className={styles.confirmIcon} />
        <div className={styles.confirmBody}>
          {shown.length === 0 ? (
            <p>{commandInfo(outcome.commandType).label}: done.</p>
          ) : (
            shown.map((line, index) => (
              <p key={index}>
                {line.text}
                {line.visibility === 'referee' && <span className={styles.secretMark}> Referee only.</span>}
              </p>
            ))
          )}
          {more > 0 && (
            <p className={styles.muted}>{more === 1 ? 'And 1 more event.' : `And ${more} more events.`}</p>
          )}
        </div>
        {onDismiss && (
          <IconButton icon="close" label="Dismiss" size="sm" variant="ghost" onClick={onDismiss} />
        )}
      </div>
    );
  }
  const title =
    outcome.status === 'refused'
      ? 'Action not allowed'
      : outcome.status === 'conflict'
        ? 'Game state changed'
        : outcome.status === 'skipped'
          ? 'Command skipped'
          : "Couldn't send command";
  return (
    <Banner
      tone={outcome.status === 'refused' ? 'warning' : 'danger'}
      title={title}
      onDismiss={onDismiss}
      key={outcome.id}
    >
      {outcome.message}
    </Banner>
  );
}
