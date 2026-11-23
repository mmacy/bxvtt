import { Toolbar } from 'radix-ui';
import { useId, useState, type ReactNode } from 'react';
import { IconButton } from '../components/Button';
import { Drawer } from '../components/Dialog';
import type { ControlHelpProps } from '../components/ControlHelp';
import { Splitter } from '../components/ResizablePanels';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/Tabs';
import { Badge } from '../components/Badge';
import { Icon, type IconName } from '../icons/Icon';
import { cx } from '../lib/cx';
import { useControllableState, useMediaQuery } from '../lib/hooks';
import { breakpoints, layout } from '../tokens';
import { Wordmark } from './Wordmark';
import styles from './TableLayout.module.css';

export { ActionBar, ActionBarDivider, ActionBarItem, ActionBarMenu } from './ActionBar';
export type { ActionBarMenuProps, ActionBarProps } from './ActionBar';

export interface TableLayoutProps {
  /** Content of the top bar. Use TableTopBar. */
  topBar: ReactNode;
  /** Vertical tools on the left. Use ToolRail. */
  toolRail?: ReactNode;
  /** The map or scene. It fills the center and should handle its own overflow. */
  stage: ReactNode;
  /** Right-hand panels. Use Dock. */
  dock?: ReactNode;
  /** Name of the dock for its toggle button and the tablet drawer. Defaults to "Table panels". */
  dockLabel?: string;
  /** Contextual actions under the stage. Use ActionBar. */
  actionBar?: ReactNode;
  dockWidth?: number;
  defaultDockWidth?: number;
  onDockWidthChange?: (width: number) => void;
  dockCollapsed?: boolean;
  defaultDockCollapsed?: boolean;
  onDockCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
}

/**
 * The play screen frame: top bar, tool rail, stage, resizable dock, and action bar. Below
 * the tablet breakpoint the dock moves into a drawer that the top bar button opens.
 */
export function TableLayout({
  topBar,
  toolRail,
  stage,
  dock,
  dockLabel = 'Table panels',
  actionBar,
  dockWidth,
  defaultDockWidth = layout.dockDefault,
  onDockWidthChange,
  dockCollapsed,
  defaultDockCollapsed = false,
  onDockCollapsedChange,
  className,
}: TableLayoutProps) {
  const compact = useMediaQuery(`(max-width: ${breakpoints.tablet - 1}px)`);
  const [width, setWidth] = useControllableState(dockWidth, defaultDockWidth, onDockWidthChange);
  const [collapsed, setCollapsed] = useControllableState(
    dockCollapsed,
    defaultDockCollapsed,
    onDockCollapsedChange,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dockId = useId();
  const hasDock = dock !== undefined;
  const dockVisible = hasDock && !compact && !collapsed;

  const toggleLabel = compact
    ? `Open ${dockLabel.toLowerCase()}`
    : collapsed
      ? `Show ${dockLabel.toLowerCase()}`
      : `Hide ${dockLabel.toLowerCase()}`;
  const toggle = (
    <IconButton
      icon={compact || collapsed ? 'dock-open' : 'dock-close'}
      label={toggleLabel}
      tooltipSide="bottom"
      aria-expanded={compact ? drawerOpen : !collapsed}
      aria-controls={compact ? undefined : dockId}
      onClick={() => (compact ? setDrawerOpen(true) : setCollapsed(!collapsed))}
    />
  );

  return (
    <div
      data-table-layout=""
      className={cx(styles.table, !toolRail && styles.noRail, className)}
      style={{
        gridTemplateColumns: `${toolRail ? 'var(--rail-width) ' : ''}minmax(0, 1fr) ${dockVisible ? `1px ${width}px` : '0 0'}`,
      }}
    >
      <header className={styles.top}>
        <div className={styles.topContent}>{topBar}</div>
        {hasDock && <div className={styles.topEnd}>{toggle}</div>}
      </header>
      {toolRail && <div className={styles.rail}>{toolRail}</div>}
      <main className={styles.stage}>{stage}</main>
      {actionBar && <div className={styles.action}>{actionBar}</div>}
      {dockVisible && (
        <>
          <Splitter
            orientation="vertical"
            size={width}
            min={layout.dockMin}
            max={layout.dockMax}
            onSizeChange={setWidth}
            paneSide="end"
            label={`Resize ${dockLabel.toLowerCase()}`}
            controls={dockId}
            onToggle={() => setCollapsed(true)}
            className={styles.splitter}
          />
          <aside id={dockId} className={styles.dock} aria-label={dockLabel}>
            {dock}
          </aside>
        </>
      )}
      {hasDock && compact && (
        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title={dockLabel}
          flush
          width="min(440px, 94vw)"
        >
          <div className={styles.drawerDock}>{dock}</div>
        </Drawer>
      )}
    </div>
  );
}

export type GameMode = 'town' | 'exploring' | 'encounter' | 'battle' | 'game_over' | 'victory';

const modeInfo: Record<
  GameMode,
  { label: string; icon: IconName; tone: 'neutral' | 'info' | 'warning' | 'danger' | 'gold' }
> = {
  town: { label: 'In town', icon: 'town', tone: 'neutral' },
  exploring: { label: 'Exploring', icon: 'compass', tone: 'info' },
  encounter: { label: 'Encounter', icon: 'eye', tone: 'warning' },
  battle: { label: 'Battle', icon: 'battle', tone: 'danger' },
  game_over: { label: 'Game over', icon: 'skull', tone: 'neutral' },
  victory: { label: 'Victory', icon: 'referee', tone: 'gold' },
};

/** The session mode as a badge, with the label B/X players expect. */
export function ModeBadge({ mode }: { mode: GameMode }) {
  const info = modeInfo[mode];
  return (
    <Badge tone={info.tone} icon={info.icon}>
      {info.label}
    </Badge>
  );
}

export interface GameClockProps {
  /** The game time as text, such as `Day 2, 10:40` from `formatGameClock`. */
  time?: string;
  /** Turns of 10 minutes since the party entered the dungeon. */
  turn?: number;
  /** Rounds of 10 seconds in the current battle. */
  round?: number;
  className?: string;
}

/** Game time as a clock reading, in turns, and, during battle, in rounds. */
export function GameClock({ time, turn, round, className }: GameClockProps) {
  return (
    <span className={cx(styles.clock, className)}>
      <Icon name="hourglass" size={14} className={styles.clockIcon} />
      {time !== undefined && (
        <span className={styles.clockPart}>
          <span className={styles.clockValue}>{time}</span>
        </span>
      )}
      {turn !== undefined && (
        <span className={styles.clockPart}>
          <span className={styles.clockLabel}>Turn</span>
          <span className={styles.clockValue}>{turn}</span>
        </span>
      )}
      {round !== undefined && (
        <span className={styles.clockPart}>
          <span className={styles.clockLabel}>Round</span>
          <span className={styles.clockValue}>{round}</span>
        </span>
      )}
    </span>
  );
}

export interface TableTopBarProps {
  tableName: string;
  mode?: GameMode;
  clock?: ReactNode;
  /** People at the table, usually an AvatarStack. */
  presence?: ReactNode;
  /** The table menu, usually a DropdownMenu on an IconButton. */
  menu?: ReactNode;
  /** Extra controls before the presence avatars, such as the referee lens switch. */
  actions?: ReactNode;
}

/** The slim bar across the top of the table screen. */
export function TableTopBar({ tableName, mode, clock, presence, menu, actions }: TableTopBarProps) {
  return (
    <div className={styles.topBar}>
      <Wordmark size="sm" markOnly className={styles.topMark} />
      <h1 className={styles.tableName}>{tableName}</h1>
      {mode && <ModeBadge mode={mode} />}
      {clock}
      <span className={styles.spacer} />
      {actions}
      {presence}
      {menu}
    </div>
  );
}

export interface ToolRailProps {
  /** Accessible name, such as "Map tools". */
  'aria-label': string;
  children: ReactNode;
  /** Items pinned to the bottom of the rail. */
  footer?: ReactNode;
}

/** The vertical tool strip on the left of the table screen. Arrow keys move between tools. */
export function ToolRail({ children, footer, 'aria-label': ariaLabel }: ToolRailProps) {
  return (
    <Toolbar.Root orientation="vertical" aria-label={ariaLabel} className={styles.toolRail}>
      <div className={styles.toolGroup}>{children}</div>
      {footer && <div className={cx(styles.toolGroup, styles.toolFooter)}>{footer}</div>}
    </Toolbar.Root>
  );
}

export interface ToolRailButtonProps extends Pick<ControlHelpProps, 'tooltip' | 'disabledReason'> {
  icon: IconName;
  /** The tool's name. The tooltip shows it with the shortcut, unless you pass a `tooltip` that says more. */
  label: string;
  shortcut?: string;
  /** Marks the active tool. */
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

/** A tool in the ToolRail, with a tooltip that names it and its shortcut. */
export function ToolRailButton({
  icon,
  label,
  shortcut,
  tooltip,
  disabledReason,
  active = false,
  disabled,
  onClick,
}: ToolRailButtonProps) {
  return (
    <Toolbar.Button asChild>
      <IconButton
        icon={icon}
        label={label}
        tooltip={tooltip}
        shortcut={shortcut}
        tooltipSide="right"
        pressed={active}
        disabled={disabled}
        disabledReason={disabledReason}
        onClick={onClick}
        size="lg"
      />
    </Toolbar.Button>
  );
}

export function ToolRailDivider() {
  return <Toolbar.Separator className={styles.toolDivider} />;
}

export interface DockTab {
  value: string;
  label: string;
  icon: IconName;
  /** Unread count, such as new feed entries. */
  count?: number;
  content: ReactNode;
  /**
   * Keeps the tab's panel mounted while another tab is active, so its scroll position and state survive a tab
   * switch. Use it for a panel that is costly to rebuild or that the reader scrolls, such as the feed.
   */
  keepMounted?: boolean;
}

export interface DockProps {
  tabs: DockTab[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  'aria-label'?: string;
}

/** Tabbed panels for the right side of the table screen: party, feed, journal, and so on. */
export function Dock({
  tabs,
  value,
  defaultValue,
  onValueChange,
  'aria-label': ariaLabel = 'Panels',
}: DockProps) {
  return (
    <Tabs
      value={value}
      defaultValue={defaultValue ?? tabs[0]?.value}
      onValueChange={onValueChange}
      className={styles.dockTabs}
    >
      <TabsList aria-label={ariaLabel} stretch className={styles.dockList}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} icon={tab.icon} count={tab.count}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          keepMounted={tab.keepMounted}
          className={styles.dockContent}
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
