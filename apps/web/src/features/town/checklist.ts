/**
 * The "ready for the dungeon?" checklist. It reads what the party carries and suggests what a party usually
 * wants before it leaves. Nothing here is a rule: every line is advice, and the party can go without any of it.
 */
import type { MemberView } from '@bxvtt/shared/bxapi';
import { joinList } from '@bxvtt/shared/text';
import { countCarried, readInventory } from './inventory';

/** One line of advice. */
export interface Suggestion {
  /** A stable key for the line. */
  key: 'light' | 'tinder' | 'rations' | 'rope';
  /** What to carry, such as "A light source". */
  title: string;
  /** Whether someone in the party carries it. */
  covered: boolean;
  /** Who carries it, or why it matters when nobody does. */
  detail: string;
  /** Text to search the outfitter for when the line is not covered. */
  search: string;
}

const LIGHT_IDS = ['torch', 'lantern'] as const;
const RATION_IDS = ['rations_standard', 'rations_iron'] as const;

function carriers(party: readonly MemberView[], ids: readonly string[]): string[] {
  return party
    .filter((member) => {
      const inventory = readInventory(member);
      return ids.some((id) => countCarried(inventory, id) > 0);
    })
    .map((member) => member.name);
}

/** The verb for a list of carriers: "Brenna carries", "Brenna and Tamsin carry". */
function carry(list: readonly string[]): string {
  return `${joinList([...list])} ${list.length === 1 ? 'carries' : 'carry'}`;
}

/**
 * Builds the checklist from the party's packs.
 *
 * @param party - The party in marching order.
 */
export function readinessChecklist(party: readonly MemberView[]): Suggestion[] {
  const light = carriers(party, LIGHT_IDS);
  const tinder = carriers(party, ['tinder_box']);
  const rations = carriers(party, RATION_IDS);
  const rope = carriers(party, ['rope']);
  return [
    {
      key: 'light',
      title: 'A light source',
      covered: light.length > 0,
      detail:
        light.length > 0
          ? `${carry(light)} torches or a lantern.`
          : 'Torches or a lantern light the way underground.',
      search: 'torch',
    },
    {
      key: 'tinder',
      title: 'A tinder box to light it',
      covered: tinder.length > 0,
      detail:
        tinder.length > 0 ? `${carry(tinder)} one.` : 'A torch or lantern needs a tinder box to light it.',
      search: 'tinder',
    },
    {
      key: 'rations',
      title: 'Rations',
      covered: rations.length > 0,
      detail:
        rations.length > 0 ? `${carry(rations)} rations.` : 'A party that stays out for days needs food.',
      search: 'rations',
    },
    {
      key: 'rope',
      title: 'Rope',
      covered: rope.length > 0,
      detail: rope.length > 0 ? `${carry(rope)} rope.` : 'Rope is handy for pits, ledges, and prisoners.',
      search: 'rope',
    },
  ];
}

/** The suggestions nobody in the party covers. */
export function gaps(checklist: readonly Suggestion[]): Suggestion[] {
  return checklist.filter((suggestion) => !suggestion.covered);
}
