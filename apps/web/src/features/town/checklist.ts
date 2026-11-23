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
  key: 'spells' | 'light' | 'tinder' | 'rations' | 'rope';
  /** What to carry, such as "A light source". */
  title: string;
  /** Whether someone in the party carries it. */
  covered: boolean;
  /** Who carries it, or why it matters when nobody does. */
  detail: string;
  /** What a screen reader hears after the title, when "nobody has it yet" doesn't fit. */
  status?: string;
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
 * @param spellsAdvice - What to say about casters with spells to prepare, or nothing when there are none.
 */
export function readinessChecklist(
  party: readonly MemberView[],
  spellsAdvice?: { detail: string; status: string },
): Suggestion[] {
  const light = carriers(party, LIGHT_IDS);
  const tinder = carriers(party, ['tinder_box']);
  const rations = carriers(party, RATION_IDS);
  const rope = carriers(party, ['rope']);
  const spells: Suggestion[] =
    spellsAdvice === undefined
      ? []
      : [
          {
            key: 'spells',
            title: 'Spells to prepare',
            covered: false,
            detail: spellsAdvice.detail,
            status: spellsAdvice.status,
            search: '',
          },
        ];
  return [
    ...spells,
    {
      key: 'light',
      title: 'Light source',
      covered: light.length > 0,
      detail:
        light.length > 0
          ? `${carry(light)} torches or a lantern.`
          : 'Bring torches or a lantern to see underground.',
      search: 'torch',
    },
    {
      key: 'tinder',
      title: 'Tinder box',
      covered: tinder.length > 0,
      detail:
        tinder.length > 0
          ? `${carry(tinder)} a tinder box.`
          : 'You need a tinder box to light torches and lanterns.',
      search: 'tinder',
    },
    {
      key: 'rations',
      title: 'Rations',
      covered: rations.length > 0,
      detail: rations.length > 0 ? `${carry(rations)} rations.` : 'Pack food for multi-day expeditions.',
      search: 'rations',
    },
    {
      key: 'rope',
      title: 'Rope',
      covered: rope.length > 0,
      detail: rope.length > 0 ? `${carry(rope)} rope.` : 'Bring rope for pits, ledges, and climbing.',
      search: 'rope',
    },
  ];
}

/** The suggestions nobody in the party covers. */
export function gaps(checklist: readonly Suggestion[]): Suggestion[] {
  return checklist.filter((suggestion) => !suggestion.covered);
}
