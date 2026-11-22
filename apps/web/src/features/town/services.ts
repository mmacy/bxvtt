/**
 * The town's service lines are free text that the adventure's author wrote, such as "Ostler's store: weapons,
 * armour, and adventuring gear". This module splits a line into a name and an offer, and matches a line to the
 * part of the town that does the job by the words in it. The match only decides which button a line gets and
 * which name heads a page. The legal commands decide what the party can do.
 */
import type { TownSection } from './townUi';

/** The sections that a service line can describe. */
export type ServiceSection = Exclude<TownSection, 'square'>;

const KEYWORDS: Record<ServiceSection, RegExp> = {
  temple: /temple|shrine|healing|healer|cure|clinic|chapel|church|priest|cleric|apothecary/i,
  treasure: /buys|moneychanger|gems|jewel|pawn|appraiser|broker|buyer/i,
  outfitter: /weapon|armour|armor|gear|store|smith|shop|market|arms|outfitter|merchant|trader|supplies/i,
  rest: /bed|inn\b|rest|supper|study|food|tavern|lodging|room|board|hostel/i,
};

/** The order to test sections in, most specific first, so "Temple of the Lantern: cure ... gear" is a temple. */
const ORDER: readonly ServiceSection[] = ['temple', 'treasure', 'outfitter', 'rest'];

/**
 * Splits a service line at its first colon.
 *
 * @param line - A line of `PlayerView.town_services`.
 * @returns The place's name and what it offers (empty when the line has no colon).
 */
export function parseService(line: string): { name: string; offer: string } {
  const colon = line.indexOf(':');
  if (colon < 0) return { name: line.trim(), offer: '' };
  return { name: line.slice(0, colon).trim(), offer: line.slice(colon + 1).trim() };
}

/** The section a service line describes, or `null` when no keyword matches. */
export function sectionOf(line: string): ServiceSection | null {
  for (const section of ORDER) {
    if (KEYWORDS[section].test(line)) return section;
  }
  return null;
}

/**
 * The name of the place that does a section's job, from the town's own lines.
 *
 * @param section - A section of town.
 * @param lines - `PlayerView.town_services`.
 * @returns The name the author gave, such as "Widow Marl, moneychanger", or `null`.
 */
export function placeName(section: ServiceSection, lines: readonly string[]): string | null {
  const line = lines.find((candidate) => sectionOf(candidate) === section);
  return line === undefined ? null : parseService(line).name;
}

/**
 * Whether the town's own list supports a service. A town that lists nothing, or lists only lines this module
 * can't read, supports every service its commands allow, so unusual wording never hides a real shop.
 *
 * @param section - The section to check.
 * @param lines - `PlayerView.town_services`.
 */
export function townListsService(section: ServiceSection, lines: readonly string[]): boolean {
  const known = new Set(lines.map(sectionOf));
  const readable = ['outfitter', 'temple', 'treasure'].some((candidate) =>
    known.has(candidate as ServiceSection),
  );
  return lines.length === 0 || !readable || known.has(section);
}
