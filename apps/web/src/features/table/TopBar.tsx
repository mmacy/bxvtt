import { formatGameClock } from '@bxvtt/shared/text';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  formatShortcut,
  getApi,
  useApiAction,
  useBattleRound,
  useCombatStage,
  useIsReferee,
  useShownMode,
  useMembers,
  usePlayerView,
  usePreferences,
  useTableDetail,
  useTableUi,
} from '@/app';
import {
  AvatarStack,
  ConfirmDialog,
  DropdownMenu,
  GameClock,
  IconButton,
  Switch,
  TableTopBar,
  Tooltip,
  type GameMode,
  type MenuEntry,
} from '@/ui';
import { copyInviteLink, useTableExit } from '@/features/lobby';
import { RETURN_TO_LOBBY_CONFIRM } from './returnToLobby';
import styles from './table.module.css';

const GAME_MODES: readonly string[] = ['town', 'exploring', 'encounter', 'battle', 'game_over', 'victory'];

/** Whether a bxapi mode is one the kit's mode badge knows. */
export function isGameMode(mode: string | null): mode is GameMode {
  return mode !== null && GAME_MODES.includes(mode);
}

/** The play screen's top bar: table name, mode, clock, referee lens, presence, and the table menu. */
export function ShellTopBar() {
  const table = useTableDetail();
  const mode = useShownMode();
  const view = usePlayerView();
  const battleRoundNow = useBattleRound();
  const playing = useCombatStage((s) => s.playing);
  const moment = useCombatStage((s) => s.moment);
  const members = useMembers();
  const referee = useIsReferee();
  const lens = usePreferences((s) => s.refereeLens);
  const setPreference = usePreferences((s) => s.set);
  const ui = useTableUi();
  const navigate = useNavigate();
  const { run } = useApiAction();
  const [confirm, setConfirm] = useState<'end' | null>(null);
  const exit = useTableExit();
  if (table === null) return null;
  const inviteCode = table.invite_code;

  const save = () =>
    void run(() => getApi().createSave(table.id), {
      success: 'Game saved',
      errorTitle: "Couldn't save the game",
    });

  const items: MenuEntry[] = [
    { label: 'Save game', icon: 'save', shortcut: formatShortcut('mod+s'), onSelect: save },
    { label: 'Saves', icon: 'download', onSelect: () => ui.setSavesOpen(true) },
    { type: 'separator' },
    referee
      ? { label: 'Table settings', icon: 'settings', onSelect: () => ui.setSettingsOpen(true) }
      : { label: 'Table rules', icon: 'scroll', onSelect: () => ui.setSettingsOpen(true) },
    ...(referee
      ? [{ label: 'Seats and caller', icon: 'users' as const, onSelect: () => ui.setSeatsOpen(true) }]
      : []),
    // The server sends the invite code to referees only.
    ...(referee && inviteCode !== undefined
      ? [
          {
            label: 'Copy invite link',
            icon: 'link' as const,
            onSelect: () => void copyInviteLink(inviteCode),
          },
        ]
      : []),
    { type: 'separator' },
    {
      label: 'Rules reference',
      icon: 'book',
      shortcut: formatShortcut('b'),
      onSelect: () => ui.openCompendium(),
    },
    {
      label: 'Keyboard shortcuts',
      icon: 'command',
      shortcut: formatShortcut('?'),
      onSelect: () => ui.setShortcutsOpen(true),
    },
    {
      label: 'Command palette',
      icon: 'search',
      shortcut: formatShortcut('mod+k'),
      onSelect: () => ui.setPaletteOpen(true),
    },
    { type: 'separator' },
    { label: 'Your tables', icon: 'home', onSelect: () => navigate('/') },
    ...(referee
      ? [
          {
            label: 'Return to lobby',
            icon: 'undo' as const,
            danger: true,
            onSelect: () => setConfirm('end'),
          },
        ]
      : []),
    ...exit.items,
  ];

  const end = async () => {
    await run(() => getApi().endGame(table.id), {
      success: 'Returned to lobby',
      errorTitle: "Couldn't end the game",
    });
  };

  // While combat plays back, the round and the clock follow the playback, so they never run ahead of the board.
  // Otherwise the round is the one the party is declaring for, as the battle board shows it.
  const round = playing && moment !== null ? moment.round : battleRoundNow;
  const clockRounds = playing && moment !== null ? moment.clockRounds : view?.clock_rounds;
  return (
    <>
      <TableTopBar
        tableName={table.name}
        mode={isGameMode(mode) ? mode : undefined}
        clock={
          view ? (
            <Tooltip content="Elapsed game time since the adventure began (1 turn = 10 minutes, 1 round = 10 seconds).">
              <span className={styles.clockWrap} tabIndex={0}>
                <GameClock
                  time={formatGameClock(clockRounds ?? view.clock_rounds)}
                  round={mode === 'battle' && round !== null ? round : undefined}
                />
              </span>
            </Tooltip>
          ) : undefined
        }
        actions={
          referee ? (
            <Tooltip
              content="Show the full map, hidden monsters, and referee tools instead of the player view"
              shortcut={formatShortcut('shift+l')}
            >
              <span className={styles.lens}>
                <Switch
                  label="Referee lens"
                  checked={lens}
                  labelPosition="start"
                  onCheckedChange={(checked) => setPreference('refereeLens', checked)}
                />
              </span>
            </Tooltip>
          ) : undefined
        }
        presence={
          <AvatarStack
            max={6}
            users={members.map((m) => ({
              id: m.user_id,
              name: m.name,
              color: m.color,
              presence: m.online ? 'online' : 'offline',
              referee: m.role === 'referee',
            }))}
          />
        }
        menu={
          <DropdownMenu align="end" trigger={<IconButton icon="menu" label="Table menu" />} items={items} />
        }
      />
      {exit.dialogs}
      <ConfirmDialog
        open={confirm === 'end'}
        onOpenChange={(open) => !open && setConfirm(null)}
        {...RETURN_TO_LOBBY_CONFIRM}
        tone="danger"
        onConfirm={end}
      />
    </>
  );
}
