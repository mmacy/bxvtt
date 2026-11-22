/**
 * Plain-language descriptions of map targets, for the hover tooltip and for screen readers. They
 * describe what the map data says. They never say whether an action would succeed.
 */
import type { MapTarget } from './hit';
import type { LevelMap, MapDoor, MapFeature, MapTransition, MapTrap } from './model';

export interface TargetDescription {
  title: string;
  lines: string[];
}

const TRANSITION_NAMES: Record<MapTransition['kind'], string> = {
  stairs_up: 'Stairs up',
  stairs_down: 'Stairs down',
  trapdoor: 'Trapdoor',
  chute: 'Chute',
  passage: 'Passage',
};

function humanize(text: string): string {
  const spaced = text.replaceAll('_', ' ').replaceAll('-', ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function doorSummary(door: MapDoor): string {
  const parts: string[] = [door.open ? 'open' : 'closed'];
  if (door.wedged) parts.push('wedged with a spike');
  if (door.locked) parts.push('locked');
  if (door.unlocked) parts.push('unlocked');
  if (door.stuck) parts.push('stuck');
  if (door.gated) parts.push('guarded by a condition');
  return parts.join(', ');
}

function trapLine(trap: MapTrap): string {
  const state =
    trap.state === 'hidden'
      ? 'not found'
      : trap.state === 'found'
        ? 'found by the party'
        : trap.state === 'sprung'
          ? 'sprung'
          : 'removed';
  const trigger = trap.trigger === 'enter' ? 'springs on entry' : 'springs on opening';
  return `Trap (${state}): ${trap.summary}, ${trigger}`;
}

function featureTitle(feature: MapFeature): string {
  switch (feature.kind) {
    case 'cache':
      return feature.emptied ? 'Emptied treasure cache' : 'Treasure cache';
    case 'generated_cache':
      return 'Rolled treasure';
    case 'pile':
      return 'Dropped goods';
    case 'trick':
      return feature.found === false ? 'Construction trick, not found' : 'Construction trick';
    case 'custom':
      return 'Feature';
  }
}

/** Describes a target, or returns `null` when it isn't worth a tooltip. */
export function describeTarget(target: MapTarget, map: LevelMap): TargetDescription | null {
  const referee = map.layer === 'referee';
  switch (target.kind) {
    case 'pin': {
      const lines = target.pin.note ? [target.pin.note] : [];
      if (target.pin.refereeOnly) lines.push('Only referees see this pin.');
      return { title: `Pin ${target.pin.label}`, lines };
    }
    case 'party': {
      return { title: 'The party', lines: [`Facing ${target.party.facing}.`] };
    }
    case 'edge': {
      const { edge } = target;
      const lines: string[] = [];
      let title = 'Wall';
      if (edge.kind === 'door' && edge.door) {
        const hidden = edge.door.secret && edge.door.discovered === false;
        title = edge.door.secret ? (hidden ? 'Secret door, not found' : 'Secret door, found') : 'Door';
        lines.push(hidden ? 'Players see a wall here.' : humanize(doorSummary(edge.door)) + '.');
      } else if (edge.kind === 'passage') {
        title = 'Passage';
        lines.push('A way through the wall.');
      } else if (edge.kind === 'open') {
        title = 'Opening';
      }
      if (target.direction) lines.push(`On the party's ${target.direction} side.`);
      return { title, lines };
    }
    case 'feature': {
      const f = target.feature;
      const lines: string[] = [];
      if (f.description) lines.push(f.description);
      if (f.contents.length > 0) lines.push(f.contents.join(', '));
      if (f.trap) lines.push(trapLine(f.trap));
      if (referee && !f.known) lines.push('The party hasn’t seen it.');
      return { title: featureTitle(f), lines };
    }
    case 'transition': {
      const t = target.transition;
      const lines: string[] = [];
      if (t.to) {
        const sameLevel = t.to.dungeonId === map.dungeonId && t.to.levelNumber === map.levelNumber;
        lines.push(sameLevel ? 'Leads elsewhere on this level.' : `Leads to level ${t.to.levelNumber}.`);
      }
      if (t.gated) lines.push('Guarded by a condition.');
      return { title: TRANSITION_NAMES[t.kind], lines };
    }
    case 'cell': {
      const lines: string[] = [];
      const area = target.areaId ? map.areas.find((a) => a.id === target.areaId) : undefined;
      if (area) {
        if (area.encounter) {
          lines.push(`${area.encounter.resolved ? 'Cleared' : 'Encounter'}: ${area.encounter.summary}`);
        }
        if (area.treasure) lines.push(`${area.treasure.summary}${area.treasure.rolled ? ' (rolled)' : ''}`);
        if (area.trap) lines.push(trapLine(area.trap));
        if (!area.known) lines.push('The party hasn’t seen this area.');
      }
      if (!area) {
        if (target.direction) return { title: `Step ${target.direction}`, lines: [] };
        if (!referee || !target.floor) return null;
        return { title: 'Corridor', lines: target.known ? [] : ['The party hasn’t seen this cell.'] };
      }
      if (target.direction) lines.unshift(`Step ${target.direction}.`);
      return { title: `${area.label}. ${area.name || humanize(area.id)}`, lines };
    }
  }
}
