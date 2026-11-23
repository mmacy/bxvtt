/**
 * Once the game is over (the party has fallen, or the adventure is won), bxapi still accepts most referee
 * commands, but a command that changes the story, such as completing the quest that ends the adventure, only
 * rewrites the record of a game that won't continue. The panel asks before it sends one, and points the
 * referee at restoring a save to play on.
 */
import { commandInfo } from '@bxvtt/shared/text';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useGameMode, useTableUi, type GameCommand } from '@/app';
import { ConfirmDialog, LinkButton } from '@/ui';
import styles from './referee.module.css';

/** Commands that still make sense after the game ends: the clock, dice, the log, and the journal. */
const AFTER_THE_END = new Set(['advance_time', 'roll_dice', 'record_note', 'add_journal_entry']);

/** Whether a command changes the story of a game that has ended. */
export function changesEndedStory(commandType: string): boolean {
  return !AFTER_THE_END.has(commandType);
}

/** Whether the game is over, and how it ended. */
export function useGameEnded(): 'fallen' | 'won' | null {
  const mode = useGameMode();
  if (mode === 'game_over') return 'fallen';
  if (mode === 'victory') return 'won';
  return null;
}

export function endedSentence(ended: 'fallen' | 'won'): string {
  return ended === 'fallen'
    ? 'The party has fallen, so the game is over.'
    : 'The adventure is won, so the game is over.';
}

type Confirm = (commands: readonly GameCommand[]) => Promise<boolean>;

const GuardContext = createContext<Confirm>(() => Promise.resolve(true));

/** Asks before a command changes the story of an ended game. Wrap the referee panel in it. */
export function EndedGuardProvider({ children }: { children: ReactNode }) {
  const ended = useGameEnded();
  const setSavesOpen = useTableUi((s) => s.setSavesOpen);
  const [asking, setAsking] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (commands) => {
      const story = commands.find((c) => changesEndedStory(c.command_type));
      if (!ended || !story) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setAsking(commandInfo(story.command_type).label);
      });
    },
    [ended],
  );

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setAsking(null);
  };

  return (
    <GuardContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open && resolver.current) settle(false);
        }}
        title="The game is over"
        description={`${ended ? endedSentence(ended) : ''} Running “${asking ?? ''}” will alter the record of a finished game.`}
        confirmLabel="Run anyway"
        onConfirm={() => settle(true)}
      >
        <p className={styles.guardNote}>
          Restore a save to continue playing.{' '}
          <LinkButton
            onClick={() => {
              settle(false);
              setSavesOpen(true);
            }}
          >
            View saves
          </LinkButton>
        </p>
      </ConfirmDialog>
    </GuardContext.Provider>
  );
}

/** Asks the referee before sending commands that change an ended game's story. Resolves to whether to send. */
export function useEndedGuard(): Confirm {
  return useContext(GuardContext);
}
