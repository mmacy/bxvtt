/**
 * The quiet controls around the map: the level switcher, the theme, the referee layer badge, the zoom and
 * camera buttons, the compass, the scale note, and the minimap.
 */
import { directionLabel } from '@bxvtt/shared/text';
import type { RefObject } from 'react';
import type { MapThemeName } from '@/app';
import { Minimap, type Direction, type DungeonMapHandle, type LevelMap } from '@/map';
import {
  Badge,
  Button,
  DropdownMenu,
  Icon,
  IconButton,
  SegmentedControl,
  Tooltip,
  cx,
  type MenuEntry,
} from '@/ui';
import type { LevelOption } from './levels';
import styles from './explore.module.css';

const THEME_OPTIONS = [
  { value: 'blueprint', label: 'Blueprint map', icon: 'map' as const, iconOnly: true },
  { value: 'torchlit', label: 'Torchlit map', icon: 'torch' as const, iconOnly: true },
  { value: 'parchment', label: 'Parchment map', icon: 'scroll' as const, iconOnly: true },
];

function isTheme(value: string): value is MapThemeName {
  return value === 'blueprint' || value === 'torchlit' || value === 'parchment';
}

export interface LevelSwitcherProps {
  levels: readonly LevelOption[];
  viewedKey: string | null;
  /** The name of a level for the switcher, such as "Level 2" or "The priory, level 2". */
  levelName: (option: LevelOption) => string;
  onSelect: (option: LevelOption) => void;
}

/** Picks the level the map shows, from every level the viewer may see. */
export function LevelSwitcher({ levels, viewedKey, levelName, onSelect }: LevelSwitcherProps) {
  const current = levels.find((level) => level.key === viewedKey) ?? levels[0];
  if (!current) return null;
  const items: MenuEntry[] = [
    { type: 'label', label: 'Dungeon level' },
    ...levels.map((level): MenuEntry => ({
      type: 'checkbox',
      label: level.partyHere ? `${levelName(level)} (party)` : levelName(level),
      checked: level.key === current.key,
      onCheckedChange: () => onSelect(level),
    })),
  ];
  return (
    <DropdownMenu
      align="end"
      items={items}
      trigger={
        <Button
          size="sm"
          variant="ghost"
          icon="stairs"
          iconEnd="chevron-down"
          aria-label={`Level shown: ${levelName(current)}. Choose another level.`}
        >
          {levelName(current)}
        </Button>
      }
    />
  );
}

export interface ThemeSwitcherProps {
  theme: MapThemeName;
  onChange: (theme: MapThemeName) => void;
}

/** Switches the map's look. */
export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  return (
    <SegmentedControl
      size="sm"
      aria-label="Map style"
      options={THEME_OPTIONS}
      value={theme}
      onValueChange={(value) => {
        if (isTheme(value)) onChange(value);
      }}
      className={styles.themeSwitch}
    />
  );
}

export interface CameraControlsProps {
  map: RefObject<DungeonMapHandle | null>;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  /** Whether the party stands on the level shown. */
  partyShown: boolean;
}

/** Zoom, fit, center on the party, and follow. */
export function CameraControls({ map, follow, onFollowChange, partyShown }: CameraControlsProps) {
  return (
    <div className={styles.cameraControls} role="group" aria-label="Map view">
      <Tooltip content="Zoom in" shortcut="+" side="left">
        <IconButton icon="zoom-in" label="Zoom in" size="sm" onClick={() => map.current?.zoomIn()} />
      </Tooltip>
      <Tooltip content="Zoom out" shortcut="−" side="left">
        <IconButton icon="zoom-out" label="Zoom out" size="sm" onClick={() => map.current?.zoomOut()} />
      </Tooltip>
      <Tooltip content="Fit map" shortcut="0" side="left">
        <IconButton
          icon="maximize"
          label="Fit map"
          size="sm"
          onClick={() => {
            onFollowChange(false);
            map.current?.fitToExplored();
          }}
        />
      </Tooltip>
      <span className={styles.controlDivider} aria-hidden="true" />
      <Tooltip content="Center on the party" shortcut="C" side="left">
        <IconButton
          icon="target"
          label="Center on the party"
          size="sm"
          disabled={!partyShown}
          onClick={() => map.current?.centerOnParty()}
        />
      </Tooltip>
      <Tooltip content={follow ? 'Stop following the party' : 'Follow the party'} shortcut="F" side="left">
        <IconButton
          icon="footprints"
          label="Follow the party"
          size="sm"
          pressed={follow}
          disabled={!partyShown}
          onClick={() => onFollowChange(!follow)}
        />
      </Tooltip>
    </div>
  );
}

export interface CompassProps {
  /** The party's facing, when it stands on the level shown. */
  facing: Direction | null;
}

/** North is always up. The needle's notch shows the way the party faces. */
export function Compass({ facing }: CompassProps) {
  const angle = { north: 0, east: 90, south: 180, west: 270 }[facing ?? 'north'];
  return (
    <div className={styles.compass}>
      <svg viewBox="-20 -20 40 40" width="36" height="36" aria-hidden="true">
        <circle r="17" className={styles.compassRing} />
        <path d="M0 -13 L4 0 L0 13 L-4 0 Z" className={styles.compassBody} />
        <path d="M0 -13 L4 0 L-4 0 Z" className={styles.compassNorth} />
        {facing && (
          <path d="M0 -19 L3 -15 L-3 -15 Z" transform={`rotate(${angle})`} className={styles.compassFacing} />
        )}
      </svg>
      <span className={styles.compassText}>
        <span className={styles.compassN}>N</span>
        {facing ? <span>Facing {directionLabel(facing).toLowerCase()}</span> : null}
      </span>
    </div>
  );
}

export interface MinimapCardProps {
  map: LevelMap | null;
  target: RefObject<DungeonMapHandle | null>;
  theme: MapThemeName;
  facing: Direction | null;
  onHide: () => void;
}

/** The minimap with the compass and the scale, and a button that folds it away. */
export function MinimapCard({ map, target, theme, facing, onHide }: MinimapCardProps) {
  return (
    <div className={styles.minimapCard}>
      <div className={styles.minimapFrame}>
        <Minimap
          map={map}
          target={target}
          theme={theme}
          width={184}
          height={128}
          ariaLabel="Minimap. Click or drag to move the map."
          className={styles.minimap}
        />
        <IconButton
          icon="minimize"
          label="Hide minimap"
          size="sm"
          className={styles.minimapHide}
          onClick={onHide}
        />
      </div>
      <div className={styles.minimapFooter}>
        <Compass facing={facing} />
        <span className={styles.scaleNote}>
          <span className={styles.scaleBar} aria-hidden="true" />1 square is 10 feet
        </span>
      </div>
    </div>
  );
}

export interface LightIndicatorProps {
  /** The full sentence: "The party has no light." or "Brenna's torch, about 6 turns left". */
  text: string;
  /** The short form on the button: "6 turns", "Lit", or "No light". */
  short: string;
  lit: boolean;
  /** The light actions the viewer may take. */
  menu: MenuEntry[];
}

/**
 * The party's light as a compact indicator in the map's toolbar: a torch with the time left, or a clear "no light"
 * state, with the light actions on click. The full sentence is a status for screen readers.
 */
export function LightIndicator({ text, short, lit, menu }: LightIndicatorProps) {
  const look = cx(styles.lightIndicator, !lit && styles.lightOut);
  return (
    <>
      {menu.length > 0 ? (
        <DropdownMenu
          align="end"
          items={menu}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              icon={lit ? 'torch' : 'moon'}
              className={look}
              aria-label={`Light: ${text}`}
            >
              {short}
            </Button>
          }
        />
      ) : (
        <span className={cx(look, styles.lightStatic)} title={text}>
          <Icon name={lit ? 'torch' : 'moon'} size={14} />
          {short}
        </span>
      )}
      <span className={styles.srOnly} role="status">
        {text}
      </span>
    </>
  );
}

export interface LayerBadgeProps {
  layer: 'referee' | 'player';
}

/** Tells a referee which map they see: the whole keyed map, or what the players see. */
export function LayerBadge({ layer }: LayerBadgeProps) {
  return layer === 'referee' ? (
    <Badge tone="referee" icon="referee">
      Referee map
    </Badge>
  ) : (
    <Badge tone="neutral" icon="eye">
      Player view
    </Badge>
  );
}
