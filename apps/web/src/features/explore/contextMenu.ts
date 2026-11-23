/**
 * The entries of the map's context menu: what the party can do with the thing under the pointer, the shared
 * table tools (ping, pin, measure), and, with the referee lens on, the referee's own actions on the map.
 */
import { directionLabel } from '@bxvtt/shared/text';
import type { GameCommand } from '@/app';
import type { Direction, LevelMap, MapTarget, Point } from '@/map';
import type { MenuEntry } from '@/ui';
import {
  DIRECTIONS,
  doorEntries,
  entryLabel,
  doorsHere,
  joinGroups,
  lightEntries,
  partyEdge,
  restEntries,
  searchEntries,
  stairsEntries,
  treasureEntries,
  turnEntries,
  type ActionContext,
} from './actions';
import { doorLoreKey } from './levels';
import type { DoorLore } from './lore';

export interface MenuTools {
  ping: (point: Point) => void;
  pin: (point: Point) => void;
  measureFrom: (cell: { x: number; y: number }) => void;
  move: (direction: Direction) => void;
}

export interface RefereeMenu {
  /** Whether the referee's map actions apply: a referee with the lens on, looking at the referee map. */
  enabled: boolean;
  can: (commandType: string) => boolean;
  send: (command: GameCommand) => void;
}

export interface MapMenuInput {
  target: MapTarget | null;
  world: Point;
  map: LevelMap;
  actions: ActionContext;
  doors: Readonly<Record<string, DoorLore>>;
  tools: MenuTools;
  referee: RefereeMenu;
}

/** The side of a cell nearest a world point, when the point lies close to that side. */
export function sideNear(world: Point, threshold = 0.22): { x: number; y: number; side: Direction } | null {
  const x = Math.floor(world.x);
  const y = Math.floor(world.y);
  const fx = world.x - x;
  const fy = world.y - y;
  const sides: [Direction, number][] = [
    ['north', fy],
    ['south', 1 - fy],
    ['west', fx],
    ['east', 1 - fx],
  ];
  sides.sort((a, b) => a[1] - b[1]);
  const [nearest] = sides;
  if (!nearest || nearest[1] > threshold) return null;
  return { x, y, side: nearest[0] };
}

const STEP: Record<Direction, [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

const OPPOSITE: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };

/**
 * The side of the party's cell that a cell side is, when the two are the same edge: the party's own side, or
 * the matching side of a neighbouring cell.
 */
export function partySideOf(
  party: { x: number; y: number },
  cell: { x: number; y: number; side: Direction },
): Direction | null {
  if (cell.x === party.x && cell.y === party.y) return cell.side;
  const [dx, dy] = STEP[cell.side];
  if (cell.x + dx === party.x && cell.y + dy === party.y) return OPPOSITE[cell.side];
  return null;
}

function partyCellActions(ctx: ActionContext, map: LevelMap, doors: MapMenuInput['doors']): MenuEntry[] {
  const party = map.party;
  const doorGroups: MenuEntry[] = [];
  if (party) {
    for (const door of doorsHere(ctx.view)) {
      const items = doorEntries(
        ctx,
        door.direction,
        door,
        doors[doorLoreKey(map.key, party.x, party.y, door.direction)],
      );
      const actionable = items.filter((entry) => entry.type !== 'label');
      if (actionable.length === 0) continue;
      doorGroups.push({
        type: 'submenu',
        label: `Door to the ${directionLabel(door.direction).toLowerCase()}`,
        icon: door.open ? 'door-open' : 'door',
        items: items.slice(1),
      });
    }
  }
  const rest = restEntries(ctx);
  return joinGroups(stairsEntries(ctx), treasureEntries(ctx), doorGroups, searchEntries(ctx), [
    ...lightEntries(ctx),
    ...(rest.length > 0
      ? [{ type: 'submenu' as const, label: 'Rest', icon: 'rest' as const, items: rest }]
      : []),
    ...turnEntries(ctx),
  ]);
}

/** Builds the context menu for a right-click (or a long press) on the map. */
export function mapMenuEntries(input: MapMenuInput): MenuEntry[] {
  const { target, world, map, actions: ctx, doors, tools, referee } = input;
  const party = map.party;
  const cell = { x: Math.floor(world.x), y: Math.floor(world.y) };
  const groups: MenuEntry[][] = [];

  // The thing under the pointer.
  const onPartyCell = party !== null && cell.x === party.x && cell.y === party.y;
  if (target?.kind === 'edge' && target.edge.kind === 'door' && target.edge.door) {
    if (target.direction && party) {
      const door = { open: target.edge.door.open, wedged: target.edge.door.wedged };
      groups.push(
        doorEntries(
          ctx,
          target.direction,
          door,
          doors[doorLoreKey(map.key, party.x, party.y, target.direction)],
        ),
      );
    } else {
      groups.push([{ type: 'label', label: 'Walk up to this door to use it.' }]);
    }
  } else if (party && (onPartyCell || target?.kind === 'party')) {
    const near = sideNear(world);
    const wall = near ? partySideOf(party, near) : null;
    if (wall && partyEdge(ctx.view, wall)?.kind === 'wall') {
      groups.push([{ type: 'label', label: `Wall to the ${directionLabel(wall).toLowerCase()}` }]);
    }
    groups.push(partyCellActions(ctx, map, doors));
  } else if (party) {
    const near = sideNear(world);
    const wall = near ? partySideOf(party, near) : null;
    if (wall && partyEdge(ctx.view, wall)?.kind === 'wall') {
      groups.push([
        { type: 'label', label: `Wall to the ${directionLabel(wall).toLowerCase()}` },
        ...searchEntries(ctx).filter((entry) => entryLabel(entry).toLowerCase().includes('secret')),
      ]);
    }
    const direction = DIRECTIONS.find(
      (d) => cell.x === party.x + STEP[d][0] && cell.y === party.y + STEP[d][1],
    );
    if (direction && ctx.can('move_party')) {
      groups.push([
        {
          label: `Step ${directionLabel(direction).toLowerCase()}`,
          icon: 'footprints',
          onSelect: () => tools.move(direction),
        },
      ]);
    }
  }

  // The table's tools.
  groups.push([
    { label: 'Ping here', icon: 'ping', onSelect: () => tools.ping(world) },
    { label: 'Add pin here', icon: 'flag', onSelect: () => tools.pin(world) },
    { label: 'Measure from here', icon: 'ruler', onSelect: () => tools.measureFrom(cell) },
  ]);

  // The referee's map actions.
  if (referee.enabled) {
    const items: MenuEntry[] = [];
    const floor = map.cells.some((c) => c.x === cell.x && c.y === cell.y);
    if (floor && referee.can('place_party')) {
      items.push({
        label: 'Place party here',
        icon: 'users',
        onSelect: () =>
          referee.send({
            command_type: 'place_party',
            location: {
              kind: 'dungeon',
              dungeon_id: map.dungeonId,
              level_number: map.levelNumber,
              position: [cell.x, cell.y],
              facing: party?.facing ?? 'north',
            },
          }),
      });
    }
    if (
      target?.kind === 'edge' &&
      target.edge.kind === 'door' &&
      target.edge.door &&
      referee.can('set_door_state')
    ) {
      const door = target.edge.door;
      const base = {
        command_type: 'set_door_state',
        dungeon_id: map.dungeonId,
        level_number: map.levelNumber,
        x: target.cell.x,
        y: target.cell.y,
        direction: target.side,
      };
      const toggles: MenuEntry[] = [
        {
          type: 'checkbox',
          label: 'Open',
          checked: door.open,
          onCheckedChange: (checked) => referee.send({ ...base, open: checked }),
        },
        {
          type: 'checkbox',
          label: 'Wedged',
          checked: door.wedged,
          onCheckedChange: (checked) => referee.send({ ...base, wedged: checked }),
        },
      ];
      if (door.locked === true || door.unlocked === true) {
        toggles.push({
          type: 'checkbox',
          label: 'Unlocked',
          checked: door.unlocked === true,
          onCheckedChange: (checked) => referee.send({ ...base, unlocked: checked }),
        });
      }
      if (door.secret) {
        toggles.push({
          type: 'checkbox',
          label: 'Found by the party',
          checked: door.discovered === true,
          onCheckedChange: (checked) => referee.send({ ...base, discovered: checked }),
        });
      }
      items.push({ type: 'submenu', label: 'Set door state', icon: 'referee', items: toggles });
    }
    if (items.length > 0) groups.push([{ type: 'label', label: 'Referee' }, ...items]);
  }

  return joinGroups(...groups);
}
