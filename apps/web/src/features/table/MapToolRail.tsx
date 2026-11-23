import { Fragment } from 'react';
import { formatShortcut, SiteInfo, useMapBus, useShortcut, useTableUi, type MapToolId } from '@/app';
import { ToolRail, ToolRailButton, ToolRailDivider, type IconName } from '@/ui';
import styles from './table.module.css';

/** The map tools of the rail, with their hover help and shortcut keys. */
export const MAP_TOOLS: ReadonlyArray<{
  id: MapToolId;
  icon: IconName;
  label: string;
  tooltip: string;
  keys: string;
}> = [
  {
    id: 'select',
    icon: 'pointer',
    label: 'Select and move',
    tooltip: 'Select and move: step the party, open doors, and use features',
    keys: 'v',
  },
  {
    id: 'pan',
    icon: 'hand',
    label: 'Pan the map',
    tooltip: 'Pan the map without moving the party',
    keys: 'h',
  },
  {
    id: 'ruler',
    icon: 'ruler',
    label: 'Measure',
    tooltip: 'Measure distance in squares and feet, on your screen only',
    keys: 'r',
  },
  { id: 'ping', icon: 'ping', label: 'Ping', tooltip: 'Ping a spot for everyone at the table', keys: 'p' },
  { id: 'draw', icon: 'draw', label: 'Draw', tooltip: 'Draw on the map for everyone to see', keys: 'd' },
  { id: 'pin', icon: 'flag', label: 'Pin a note', tooltip: 'Pin a note that everyone can read', keys: 'n' },
  { id: 'erase', icon: 'eraser', label: 'Erase', tooltip: 'Erase drawings from the map', keys: 'e' },
];

function ToolShortcut({ id, label, keys }: { id: MapToolId; label: string; keys: string }) {
  const setTool = useMapBus((s) => s.setTool);
  useShortcut({ id: `map.tool.${id}`, keys, label, group: 'Map', run: () => setTool(id) });
  return null;
}

/**
 * The tool rail. In a dungeon it holds the map tools, which the map reads from `useMapBus`. Everywhere else it
 * keeps only its footer, so the rules reference button stays in the same place on every screen of play. The link to
 * the documentation and the version sit under the rail, outside the toolbar, because they aren't tools.
 */
export function MapToolRail({ mapTools = true }: { mapTools?: boolean }) {
  const tool = useMapBus((s) => s.tool);
  const setTool = useMapBus((s) => s.setTool);
  const openCompendium = useTableUi((s) => s.openCompendium);
  return (
    <div className={styles.rail}>
      <ToolRail
        aria-label={mapTools ? 'Map tools' : 'Table tools'}
        footer={
          <ToolRailButton
            icon="book"
            label="Rules reference"
            tooltip="Rules reference: classes, spells, monsters, equipment, and tables"
            shortcut="B"
            onClick={() => openCompendium()}
          />
        }
      >
        {mapTools &&
          MAP_TOOLS.map((t, index) => (
            <Fragment key={t.id}>
              {index === 3 && <ToolRailDivider />}
              <ToolShortcut id={t.id} label={t.label} keys={t.keys} />
              <ToolRailButton
                icon={t.icon}
                label={t.label}
                tooltip={t.tooltip}
                shortcut={formatShortcut(t.keys)[0]}
                active={tool === t.id}
                onClick={() => setTool(t.id)}
              />
            </Fragment>
          ))}
      </ToolRail>
      <SiteInfo layout="stack" />
    </div>
  );
}
