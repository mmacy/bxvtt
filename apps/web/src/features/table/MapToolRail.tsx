import { Fragment } from 'react';
import { formatShortcut, useMapBus, useShortcut, useTableUi, type MapToolId } from '@/app';
import { ToolRail, ToolRailButton, ToolRailDivider, type IconName } from '@/ui';

/** The map tools of the rail, with their shortcut keys. */
export const MAP_TOOLS: ReadonlyArray<{ id: MapToolId; icon: IconName; label: string; keys: string }> = [
  { id: 'select', icon: 'pointer', label: 'Select and move', keys: 'v' },
  { id: 'pan', icon: 'hand', label: 'Pan the map', keys: 'h' },
  { id: 'ruler', icon: 'ruler', label: 'Measure', keys: 'r' },
  { id: 'ping', icon: 'ping', label: 'Ping', keys: 'p' },
  { id: 'draw', icon: 'draw', label: 'Draw', keys: 'd' },
  { id: 'pin', icon: 'flag', label: 'Pin a note', keys: 'n' },
  { id: 'erase', icon: 'eraser', label: 'Erase', keys: 'e' },
];

function ToolShortcut({ id, label, keys }: { id: MapToolId; label: string; keys: string }) {
  const setTool = useMapBus((s) => s.setTool);
  useShortcut({ id: `map.tool.${id}`, keys, label, group: 'Map', run: () => setTool(id) });
  return null;
}

/**
 * The tool rail. In a dungeon it holds the map tools, which the map reads from `useMapBus`. Everywhere else it
 * keeps only its footer, so the rules reference button stays in the same place on every screen of play.
 */
export function MapToolRail({ mapTools = true }: { mapTools?: boolean }) {
  const tool = useMapBus((s) => s.tool);
  const setTool = useMapBus((s) => s.setTool);
  const openCompendium = useTableUi((s) => s.openCompendium);
  return (
    <ToolRail
      aria-label={mapTools ? 'Map tools' : 'Table tools'}
      footer={
        <ToolRailButton icon="book" label="Rules reference" shortcut="B" onClick={() => openCompendium()} />
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
              shortcut={formatShortcut(t.keys)[0]}
              active={tool === t.id}
              onClick={() => setTool(t.id)}
            />
          </Fragment>
        ))}
    </ToolRail>
  );
}
