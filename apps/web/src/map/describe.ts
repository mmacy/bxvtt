/**
 * Plain-language descriptions of map targets, for the hover tooltip and for screen readers. They
 * describe what the map data says. They never say whether an action would succeed.
 */
import { capitalizeFirst } from '@bxvtt/shared/text';
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

/**
 * A door's state as a phrase, such as "closed, locked". Only a referee's map knows whether a gate guards a door,
 * because the player view doesn't say.
 */
export function doorSummary(door: MapDoor): string {
  const parts: string[] = [door.open ? 'open' : 'closed'];
  if (door.wedged) parts.push('wedged with a spike');
  if (door.locked) parts.push('locked');
  if (door.unlocked) parts.push('unlocked');
  if (door.stuck) parts.push('stuck');
  if (door.gated) parts.push('opens only when its condition is met');
  return parts.join(', ');
}

/** How many characters of a feature's referee notes the referee's tooltip shows. */
const NOTES_LENGTH = 120;

/** The tooltip line for a feature's referee notes, cut to 120 characters, or `null` when there are none. */
export function refereeNotesLine(notes: string | null): string | null {
  const text = notes?.trim() ?? '';
  if (text === '') return null;
  const shown = text.length > NOTES_LENGTH ? `${text.slice(0, NOTES_LENGTH).trimEnd()}…` : text;
  return `Referee notes: ${shown}`;
}

const TRAP_STATES: Record<MapTrap['state'], string> = {
  hidden: 'Trap, not yet found',
  found: 'Trapped',
  sprung: 'Trap sprung',
  removed: 'Trap disarmed',
};

/**
 * The lines for a trap. A player's map holds only the traps the party knows about, so a player reads the state
 * alone. A referee also reads what springs the trap and what it does.
 */
function trapLines(trap: MapTrap, referee: boolean): string[] {
  const lines = [TRAP_STATES[trap.state]];
  if (!referee) return lines;
  if (trap.trigger !== null)
    lines.push(trap.trigger === 'enter' ? 'Springs on entry' : 'Springs when opened');
  if (trap.summary && trap.summary !== 'Trap')
    lines.push(trap.summary.charAt(0).toUpperCase() + trap.summary.slice(1));
  return lines;
}

function featureTitle(feature: MapFeature, referee: boolean): string {
  switch (feature.kind) {
    case 'cache':
      return 'Treasure';
    case 'generated_cache':
      return 'Treasure';
    case 'pile':
      return 'Dropped goods';
    case 'trick':
      if (!referee) return 'Something odd';
      return feature.found === false ? 'Construction trick, not found' : 'Construction trick';
    case 'custom':
      return 'Point of interest';
  }
}

/** Describes a target, or returns `null` when it isn't worth a tooltip. */
export function describeTarget(target: MapTarget, map: LevelMap): TargetDescription | null {
  const referee = map.layer === 'referee';
  switch (target.kind) {
    case 'pin': {
      const lines = target.pin.note ? [target.pin.note] : [];
      if (target.pin.refereeOnly) lines.push('Visible only to referees.');
      return { title: `Pin ${target.pin.label}`, lines };
    }
    case 'party': {
      return { title: 'Party', lines: [`Facing ${target.party.facing}.`] };
    }
    case 'edge': {
      const { edge } = target;
      const lines: string[] = [];
      let title = 'Wall';
      if (edge.kind === 'door' && edge.door) {
        const hidden = edge.door.secret && edge.door.discovered === false;
        title = edge.door.secret ? (hidden ? 'Secret door, not found' : 'Secret door, found') : 'Door';
        lines.push(hidden ? 'Appears as a wall to players.' : humanize(doorSummary(edge.door)) + '.');
      } else if (edge.kind === 'passage') {
        title = 'Passage';
        lines.push('Leads through the wall.');
      } else if (edge.kind === 'open') {
        title = 'Opening';
      }
      if (target.direction) lines.push(`To the ${target.direction} of the party.`);
      return { title, lines };
    }
    case 'feature': {
      const f = target.feature;
      const lines: string[] = [];
      if (f.description) lines.push(f.description);
      if (f.contents.length > 0) {
        // Everyone reads a pile one entry per line. A referee reads what a cache holds on one labeled line.
        if (f.kind === 'pile') lines.push(...f.contents.map((entry) => capitalizeFirst(entry)));
        else if (referee) lines.push(`Holds: ${f.contents.join(', ')}`);
        else lines.push(f.contents.join(', '));
      }
      // An emptied cache says so, and its trap no longer matters, as the scene panel shows it.
      const emptied = f.kind === 'cache' && f.emptied;
      if (emptied) lines.push('Emptied.');
      else if (f.trap) lines.push(...trapLines(f.trap, referee));
      const notes = referee ? refereeNotesLine(f.refereeNotes) : null;
      if (notes !== null) lines.push(notes);
      if (referee && !f.known) lines.push('Unseen by the party.');
      return { title: featureTitle(f, referee), lines };
    }
    case 'transition': {
      const t = target.transition;
      const lines: string[] = [];
      if (t.to) {
        const sameLevel = t.to.dungeonId === map.dungeonId && t.to.levelNumber === map.levelNumber;
        lines.push(sameLevel ? 'Leads elsewhere on this level.' : `Leads to level ${t.to.levelNumber}.`);
      }
      // Only a referee's map knows whether a gate guards a transition.
      if (t.gated) lines.push('Opens only when its condition is met.');
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
        if (area.trap) lines.push(...trapLines(area.trap, referee));
        if (!area.known) lines.push('Unseen by the party.');
      }
      if (!area) {
        if (target.direction) return { title: `Step ${target.direction}`, lines: [] };
        if (!referee || !target.floor) return null;
        return { title: 'Corridor', lines: target.known ? [] : ['Unseen by the party.'] };
      }
      if (target.direction) lines.unshift(`Step ${target.direction}.`);
      const name = area.name || humanize(area.id);
      return { title: area.label ? `${area.label}. ${name}` : name, lines };
    }
  }
}
