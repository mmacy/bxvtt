import { formatGameClock } from '@bxvtt/shared/text';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  formatShortcut,
  getApi,
  useApiAction,
  useEncounter,
  useIsReferee,
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
import { copyInviteLink } from '@/features/lobby';
import { useShownMode } from './shownMode';
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
  const encounter = useEncounter();
  const members = useMembers();
  const referee = useIsReferee();
  const lens = usePreferences((s) => s.refereeLens);
  const setPreference = usePreferences((s) => s.set);
  const ui = useTableUi();
  const navigate = useNavigate();
  const { run } = useApiAction();
  const [confirm, setConfirm] = useState<'leave' | 'end' | null>(null);
  if (table === null) return null;

  const save = () =>
    void run(() => getApi().createSave(table.id), {
      success: 'Game saved',
      errorTitle: "Couldn't save the game",
    });

  const items: MenuEntry[] = [
    { label: 'Save the game', icon: 'save', shortcut: formatShortcut('mod+s'), onSelect: save },
    { label: 'Saves', icon: 'download', onSelect: () => ui.setSavesOpen(true) },
    { type: 'separator' },
    { label: 'Table settings', icon: 'settings', onSelect: () => ui.setSettingsOpen(true) },
    ...(referee
      ? [{ label: 'Seats and caller', icon: 'users' as const, onSelect: () => ui.setSeatsOpen(true) }]
      : []),
    { label: 'Copy invite link', icon: 'link', onSelect: () => void copyInviteLink(table.invite_code) },
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
            label: 'Return to the lobby',
            icon: 'undo' as const,
            danger: true,
            onSelect: () => setConfirm('end'),
          },
        ]
      : []),
    { label: 'Leave the table', icon: 'log-out', danger: true, onSelect: () => setConfirm('leave') },
  ];

  const leave = async () => {
    const result = await run(() => getApi().leaveTable(table.id), { errorTitle: "Couldn't leave the table" });
    if (result.ok) navigate('/');
  };
  const end = async () => {
    await run(() => getApi().endGame(table.id), {
      success: 'The table is back in its lobby',
      errorTitle: "Couldn't end the game",
    });
  };

  const round = encounter?.battle_round ?? undefined;
  return (
    <>
      <TableTopBar
        tableName={table.name}
        mode={isGameMode(mode) ? mode : undefined}
        clock={
          view ? (
            <Tooltip content="Game time since the adventure began. A turn is 10 minutes, a round is 10 seconds.">
              <span className={styles.clockWrap} tabIndex={0}>
                <GameClock
                  time={formatGameClock(view.clock_rounds)}
                  round={mode === 'battle' && round !== undefined && round > 0 ? round : undefined}
                />
              </span>
            </Tooltip>
          ) : undefined
        }
        actions={
          referee ? (
            <Tooltip content="Shows referee data: the full map, monsters, and the referee tools. Turn it off to see only what players see.">
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
      <ConfirmDialog
        open={confirm === 'leave'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Leave this table?"
        description="You leave the table and its party. To come back, you need a new invite link from the referee."
        confirmLabel="Leave the table"
        tone="danger"
        onConfirm={leave}
      />
      <ConfirmDialog
        open={confirm === 'end'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Return the table to its lobby?"
        description="The game ends for everyone. Its saves stay, so you can restore one later."
        confirmLabel="Return to the lobby"
        tone="danger"
        onConfirm={end}
      />
    </>
  );
}
