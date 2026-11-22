import { formatGameClock, sessionModeLabel } from '@bxvtt/shared/text';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useAction, usePreferences, useMapBus } from '@/app';
import {
  Badge,
  EmptyState,
  IconButton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type IconName,
} from '@/ui';
import { DetailsProvider, IdMark, useDetails } from './details';
import styles from './RefereePanel.module.css';
import { AreaKey } from './sections/AreaKey';
import { CommandConsole } from './sections/CommandConsole';
import { Generators } from './sections/Generators';
import { HereNow } from './sections/HereNow';
import { QuickActions } from './sections/QuickActions';
import { RefereeLog } from './sections/RefereeLog';
import { RefereeNotes } from './sections/RefereeNotes';
import { StoryState } from './sections/StoryState';
import { useRefereeData, type RefereeData } from './useReferee';

/** The sections of the referee panel. */
export type RefereeSection = 'now' | 'actions' | 'story' | 'key' | 'tables' | 'commands' | 'log' | 'notes';

const SECTIONS: ReadonlyArray<{ value: RefereeSection; label: string; title: string; icon: IconName }> = [
  { value: 'now', label: 'Now', title: 'Here and now', icon: 'eye' },
  { value: 'actions', label: 'Act', title: 'Quick actions', icon: 'hand' },
  { value: 'story', label: 'Story', title: 'Quests, flags, and triggers', icon: 'flag' },
  { value: 'key', label: 'Key', title: 'The adventure key', icon: 'book' },
  { value: 'tables', label: 'Roll', title: 'Generators', icon: 'dice' },
  { value: 'log', label: 'Log', title: 'The log behind the screen', icon: 'feed' },
  { value: 'notes', label: 'Notes', title: 'Private notes', icon: 'edit' },
  { value: 'commands', label: 'All', title: 'Every referee command', icon: 'command' },
];

/** Below this width the section tabs show icons only, with the section's name under them. */
const LABELS_FROM_PX = 560;

function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** Where the party is and what time it is, always in view. */
function StatusStrip({ data }: { data: RefereeData }) {
  const requestFocus = useMapBus((s) => s.requestFocus);
  const { state, here, place, ctx } = data;
  const { showIds, setShowIds } = useDetails();
  if (!state) return null;
  const encounter = state.encounter;
  const where =
    place?.kind === 'town'
      ? (ctx.townName ?? 'Town')
      : here
        ? (here.area?.name ?? 'Corridor')
        : 'In the dungeon';
  const detail =
    place?.kind === 'dungeon' && here
      ? `${here.dungeon.name}, level ${here.level.number}`
      : 'The party is in town';
  const coords = place?.kind === 'dungeon' ? `cell ${place.x}, ${place.y}` : null;
  const monsters = encounter?.groups.reduce((sum, g) => sum + g.monster_ids.length, 0) ?? 0;
  return (
    <div className={styles.strip}>
      <div className={styles.stripMain}>
        <div className={styles.where}>
          <span className={styles.whereName}>{where}</span>
          <span className={styles.whereDetail}>
            {detail}
            {coords && (
              <IdMark className={styles.coords}>
                {' · '}
                {coords}
              </IdMark>
            )}
          </span>
        </div>
        {place?.kind === 'dungeon' && (
          <IconButton
            icon="target"
            label="Center the map on the party"
            size="sm"
            variant="ghost"
            onClick={() => requestFocus({ kind: 'party' })}
          />
        )}
      </div>
      <div className={styles.stripMeta}>
        <Badge tone={state.battle ? 'danger' : encounter ? 'warning' : 'neutral'}>
          {sessionModeLabel(state.mode)}
        </Badge>
        <span className={styles.clock} title="Game clock">
          {formatGameClock(state.clock_rounds)}
        </span>
        {encounter && (
          <span className={styles.alert}>
            {monsters === 1 ? '1 monster' : `${monsters} monsters`}
            {encounter.groups[0] ? `, ${encounter.groups[0].distance_feet} ft` : ''}
          </span>
        )}
        <Switch className={styles.idSwitch} label="Show IDs" checked={showIds} onCheckedChange={setShowIds} />
      </div>
    </div>
  );
}

/** Palette actions that open a section of the panel. */
function SectionActions({ onOpen }: { onOpen: (section: RefereeSection) => void }) {
  const setPreference = usePreferences((s) => s.set);
  const open = (section: RefereeSection) => {
    setPreference('dockTab', 'referee');
    setPreference('dockCollapsed', false);
    onOpen(section);
  };
  useAction({
    id: 'referee.now',
    label: 'Referee: here and now',
    group: 'Referee',
    icon: 'eye',
    run: () => open('now'),
  });
  useAction({
    id: 'referee.actions',
    label: 'Referee: quick actions',
    group: 'Referee',
    icon: 'hand',
    run: () => open('actions'),
  });
  useAction({
    id: 'referee.story',
    label: 'Referee: quests, flags, and triggers',
    group: 'Referee',
    icon: 'flag',
    run: () => open('story'),
  });
  useAction({
    id: 'referee.key',
    label: 'Referee: the adventure key',
    group: 'Referee',
    icon: 'book',
    run: () => open('key'),
  });
  useAction({
    id: 'referee.tables',
    label: 'Referee: generators',
    group: 'Referee',
    icon: 'dice',
    run: () => open('tables'),
  });
  useAction({
    id: 'referee.log',
    label: 'Referee: the log behind the screen',
    group: 'Referee',
    icon: 'feed',
    run: () => open('log'),
  });
  useAction({
    id: 'referee.notes',
    label: 'Referee: private notes',
    group: 'Referee',
    icon: 'edit',
    run: () => open('notes'),
  });
  useAction({
    id: 'referee.commands',
    label: 'Referee: every referee command',
    group: 'Referee',
    icon: 'command',
    run: () => open('commands'),
  });
  return null;
}

/**
 * The referee tab of the dock, shown only to a referee with the lens on: the key for where the party stands,
 * quick actions, the story state, the whole adventure key, the generators, the referee's log, private notes,
 * and a form for every referee command.
 */
export function RefereePanel() {
  const data = useRefereeData();
  const [section, setSection] = useState<RefereeSection>('now');
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const showLabels = width >= LABELS_FROM_PX;
  const current = SECTIONS.find((s) => s.value === section) ?? SECTIONS[0];

  if (!data.state) {
    return (
      <div className={styles.root}>
        <EmptyState
          icon="referee"
          size="compact"
          title="Referee tools"
          description="The referee's key, actions, and log show here while a game is running."
        />
      </div>
    );
  }

  return (
    <DetailsProvider>
      <div className={styles.root} ref={rootRef}>
        <SectionActions onOpen={setSection} />
        <StatusStrip data={data} />
        <Tabs
          value={section}
          onValueChange={(value) => setSection(value as RefereeSection)}
          variant="enclosed"
          className={styles.tabs}
        >
          <div className={styles.tabBar}>
            <TabsList aria-label="Referee tools" stretch className={styles.tabList}>
              {SECTIONS.map((s) => (
                <TabsTrigger
                  key={s.value}
                  value={s.value}
                  icon={s.icon}
                  iconOnly={!showLabels}
                  className={showLabels ? undefined : styles.iconTab}
                >
                  {showLabels ? s.label : s.title}
                </TabsTrigger>
              ))}
            </TabsList>
            <h2 className={styles.sectionName}>{current?.title}</h2>
          </div>
          <TabsContent value="now" className={styles.content}>
            <HereNow data={data} />
          </TabsContent>
          <TabsContent value="actions" className={styles.content}>
            <QuickActions data={data} />
          </TabsContent>
          <TabsContent value="story" className={styles.content}>
            <StoryState data={data} />
          </TabsContent>
          <TabsContent value="key" className={styles.content} keepMounted>
            <AreaKey data={data} />
          </TabsContent>
          <TabsContent value="tables" className={styles.content} keepMounted>
            <Generators data={data} />
          </TabsContent>
          <TabsContent value="log" className={styles.content}>
            <RefereeLog />
          </TabsContent>
          <TabsContent value="notes" className={styles.content} keepMounted>
            <RefereeNotes />
          </TabsContent>
          <TabsContent value="commands" className={styles.content}>
            <CommandConsole />
          </TabsContent>
        </Tabs>
      </div>
    </DetailsProvider>
  );
}
