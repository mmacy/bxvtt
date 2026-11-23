import { Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import {
  getApi,
  useAction,
  useApiAction,
  ShownModeProvider,
  useFeed,
  useHeldMode,
  useIsReferee,
  usePartyLocation,
  usePreferences,
  useRefereeLens,
  useShortcut,
  useTableId,
  useTableUi,
  useTableUser,
  type DockTabId,
} from '@/app';
import { Dock, ErrorBoundary, TableLayout, type DockTab } from '@/ui';
import { FeedPanel } from '@/features/feed';
import { JournalPanel } from '@/features/journal';
import { SavesDialog } from '@/features/referee';
import { CharacterSheet, PartyPanel } from '@/features/sheet';
import { LoadingScreen } from './LoadingScreen';
import { MapToolRail } from './MapToolRail';
import { SeatsDialog } from './SeatsDialog';
import { ShellActionBar } from './ShellActionBar';
import { Stage } from './Stage';
import { TableSettingsDialog } from './TableSettingsDialog';
import { ShellTopBar } from './TopBar';

// The compendium loads in the background once the play screen shows, apart from the play screen's own code.
const Compendium = lazy(() =>
  import('@/features/compendium').then((module) => ({ default: module.Compendium })),
);
// The referee tools load only for a referee with the lens on.
const RefereePanel = lazy(() =>
  import('@/features/referee/RefereePanel').then((module) => ({ default: module.RefereePanel })),
);

/** How many feed entries arrived from others since the user last looked at the feed tab. */
function useUnreadFeed(active: boolean): number {
  const feed = useFeed();
  const me = useTableUser();
  const lastSeq = feed.at(-1)?.seq ?? 0;
  const [seenSeq, setSeenSeq] = useState(lastSeq);
  // Marking the feed read while the user looks at it adjusts state during render, as React recommends.
  if (active && seenSeq !== lastSeq) setSeenSeq(lastSeq);
  return useMemo(
    () => (active ? 0 : feed.filter((entry) => entry.seq > seenSeq && entry.user_id !== me?.id).length),
    [active, feed, seenSeq, me?.id],
  );
}

const TAB_KEYS: Record<DockTabId, string> = {
  party: 'alt+1',
  feed: 'alt+2',
  journal: 'alt+3',
  referee: 'alt+4',
};
const TAB_LABELS: Record<DockTabId, string> = {
  party: 'Party',
  feed: 'Feed',
  journal: 'Journal',
  referee: 'Referee',
};

function DockTabShortcut({ tab, onSelect }: { tab: DockTabId; onSelect: (tab: DockTabId) => void }) {
  useShortcut({
    id: `table.dock.${tab}`,
    keys: TAB_KEYS[tab],
    label: `Show the ${TAB_LABELS[tab].toLowerCase()} tab`,
    group: 'Panels',
    run: () => onSelect(tab),
  });
  return null;
}

/** The shortcuts and palette actions that the shell owns. */
function ShellShortcuts() {
  const tableId = useTableId();
  const referee = useIsReferee();
  const lens = usePreferences((s) => s.refereeLens);
  const setPreference = usePreferences((s) => s.set);
  const openCompendium = useTableUi((s) => s.openCompendium);
  const toggleCompendium = useTableUi((s) => s.toggleCompendium);
  const setSavesOpen = useTableUi((s) => s.setSavesOpen);
  const setSettingsOpen = useTableUi((s) => s.setSettingsOpen);
  const setSeatsOpen = useTableUi((s) => s.setSeatsOpen);
  const { run } = useApiAction();
  const save = () =>
    void run(() => getApi().createSave(tableId), {
      success: 'Game saved',
      errorTitle: "Couldn't save the game",
    });

  useShortcut({
    id: 'table.compendium',
    keys: 'b',
    label: 'Open or close rules reference',
    run: () => toggleCompendium(),
  });
  useShortcut({ id: 'table.save', keys: 'mod+s', label: 'Save game', allowInInputs: true, run: save });
  useShortcut({
    id: 'table.lens',
    keys: 'shift+l',
    label: 'Toggle referee lens',
    group: 'Referee',
    enabled: referee,
    run: () => setPreference('refereeLens', !lens),
  });
  useAction({
    id: 'table.compendium',
    label: 'Open rules reference',
    icon: 'book',
    shortcut: 'b',
    run: () => openCompendium(),
  });
  useAction({ id: 'table.save', label: 'Save game', icon: 'save', shortcut: 'mod+s', run: save });
  useAction({ id: 'table.saves', label: 'Saves', icon: 'download', run: () => setSavesOpen(true) });
  useAction({
    id: 'table.settings',
    label: 'Table settings',
    icon: 'settings',
    run: () => setSettingsOpen(true),
  });
  useAction({
    id: 'table.seats',
    label: 'Seats and caller',
    group: 'Referee',
    icon: 'users',
    disabled: !referee,
    run: () => setSeatsOpen(true),
  });
  useAction({
    id: 'table.lens',
    label: lens ? 'Turn off referee lens' : 'Turn on referee lens',
    group: 'Referee',
    icon: lens ? 'eye-off' : 'eye',
    shortcut: 'shift+l',
    disabled: !referee,
    run: () => setPreference('refereeLens', !lens),
  });
  return null;
}

/** The overlays the shell renders for every feature: the sheet, the rules reference, and the dialogs. */
function ShellOverlays() {
  const sheetMemberId = useTableUi((s) => s.sheetMemberId);
  const sheetTab = useTableUi((s) => s.sheetTab);
  const closeSheet = useTableUi((s) => s.closeCharacterSheet);
  const compendiumOpen = useTableUi((s) => s.compendiumOpen);
  const compendiumEntry = useTableUi((s) => s.compendiumEntry);
  const setCompendiumOpen = useTableUi((s) => s.setCompendiumOpen);
  const savesOpen = useTableUi((s) => s.savesOpen);
  const setSavesOpen = useTableUi((s) => s.setSavesOpen);
  return (
    <>
      <CharacterSheet memberId={sheetMemberId} tab={sheetTab ?? undefined} onClose={closeSheet} />
      <Suspense fallback={null}>
        <Compendium open={compendiumOpen} onOpenChange={setCompendiumOpen} entry={compendiumEntry} />
      </Suspense>
      <SavesDialog open={savesOpen} onOpenChange={setSavesOpen} />
      <TableSettingsDialog />
      <SeatsDialog />
    </>
  );
}

function panel(area: string, content: ReactNode) {
  return (
    <ErrorBoundary area={area} size="compact">
      {content}
    </ErrorBoundary>
  );
}

/**
 * The play screen: the top bar, the map tool rail in a dungeon, the stage for the mode, the dock with the party,
 * feed, journal, and referee tabs, and the action bar. Each feature fills its slot.
 */
export function PlayShell() {
  const mode = useHeldMode();
  const location = usePartyLocation();
  const lens = useRefereeLens();
  const dockWidth = usePreferences((s) => s.dockWidth);
  const dockCollapsed = usePreferences((s) => s.dockCollapsed);
  const storedTab = usePreferences((s) => s.dockTab);
  const setPreference = usePreferences((s) => s.set);
  const tab: DockTabId = storedTab === 'referee' && !lens ? 'party' : storedTab;
  const unread = useUnreadFeed(tab === 'feed' && !dockCollapsed);
  const ended = mode === 'game_over' || mode === 'victory';
  const inDungeon = location?.kind === 'dungeon';
  const selectTab = (next: string) => {
    if (next === 'party' || next === 'feed' || next === 'journal' || next === 'referee') {
      setPreference('dockTab', next);
      if (dockCollapsed) setPreference('dockCollapsed', false);
    }
  };

  const tabs: DockTab[] = [
    { value: 'party', label: 'Party', icon: 'users', content: panel('The party panel', <PartyPanel />) },
    {
      value: 'feed',
      label: 'Feed',
      icon: 'feed',
      count: unread > 0 ? unread : undefined,
      content: panel('The feed', <FeedPanel />),
      // The feed keeps its scroll position and its loaded history across a tab switch.
      keepMounted: true,
    },
    { value: 'journal', label: 'Journal', icon: 'journal', content: panel('The journal', <JournalPanel />) },
    ...(lens
      ? [
          {
            value: 'referee',
            label: 'Referee',
            icon: 'referee' as const,
            content: panel(
              'The referee tools',
              <Suspense fallback={<LoadingScreen label="Opening the referee tools" compact />}>
                <RefereePanel />
              </Suspense>,
            ),
          },
        ]
      : []),
  ];

  return (
    <ShownModeProvider mode={mode}>
      <TableLayout
        topBar={<ShellTopBar />}
        toolRail={<MapToolRail mapTools={inDungeon && !ended} />}
        stage={panel('The stage', <Stage />)}
        dock={<Dock aria-label="Table panels" tabs={tabs} value={tab} onValueChange={selectTab} />}
        dockLabel="Table panels"
        actionBar={ended ? undefined : <ShellActionBar />}
        dockWidth={dockWidth}
        onDockWidthChange={(width) => setPreference('dockWidth', width)}
        dockCollapsed={dockCollapsed}
        onDockCollapsedChange={(collapsed) => setPreference('dockCollapsed', collapsed)}
      />
      {(['party', 'feed', 'journal', ...(lens ? ['referee'] : [])] as DockTabId[]).map((id) => (
        <DockTabShortcut key={id} tab={id} onSelect={selectTab} />
      ))}
      <ShellShortcuts />
      <ShellOverlays />
    </ShownModeProvider>
  );
}
