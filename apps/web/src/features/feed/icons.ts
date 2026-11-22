import type { EventIcon } from '@bxvtt/shared/text';
import type { SystemNoticeCode } from '@bxvtt/shared/protocol';
import type { IconName } from '@/ui';

/** The kit icon for each icon hint of the text layer. */
const EVENT_ICONS: Record<EventIcon, IconName> = {
  step: 'footprints',
  turn: 'compass',
  stairs: 'stairs',
  door: 'door',
  lock: 'door-locked',
  ear: 'ear',
  search: 'search',
  trap: 'trap',
  torch: 'torch',
  monsters: 'battle',
  run: 'footprints',
  sword: 'weapon-sword',
  shield: 'shield',
  arrow: 'arrow-right',
  dice: 'dice',
  wound: 'heart',
  heart: 'heart',
  skull: 'skull',
  spell: 'spell',
  book: 'book',
  holy: 'class-cleric',
  scroll: 'scroll',
  potion: 'potion',
  wand: 'wand',
  coins: 'coins',
  chest: 'chest',
  gem: 'gem',
  star: 'success',
  level: 'arrow-up',
  quest: 'flag',
  journal: 'journal',
  clock: 'hourglass',
  town: 'town',
  referee: 'referee',
  info: 'info',
  flag: 'flag',
  party: 'users',
  rest: 'rest',
  food: 'rest',
  warning: 'warning',
};

/** The kit icon for an event line. */
export function eventIcon(icon: EventIcon): IconName {
  return EVENT_ICONS[icon] ?? 'info';
}

/** The kit icon for a system notice. */
export function systemIcon(code: SystemNoticeCode): IconName {
  switch (code) {
    case 'member_joined':
    case 'member_rejoined':
    case 'member_left':
    case 'member_removed':
      return 'user';
    case 'role_changed':
      return 'referee';
    case 'save_created':
      return 'save';
    case 'save_restored':
      return 'undo';
    case 'seat_changed':
      return 'users';
    case 'caller_changed':
      return 'flag';
    case 'adventure_uploaded':
      return 'upload';
    default:
      return 'info';
  }
}

/** An arrow for a direction the party faces. */
export function directionArrow(facing: string): string {
  switch (facing) {
    case 'north':
      return '↑';
    case 'south':
      return '↓';
    case 'east':
      return '→';
    case 'west':
      return '←';
    default:
      return '•';
  }
}
