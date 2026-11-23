/**
 * Original names for the "Suggest a name" button, grouped by class or race. They are invented for bxvtt and
 * borrow from no published setting.
 */

const HUMAN_NAMES: readonly string[] = [
  'Flarg',
  'Clarence',
  'Mazpar',
  'Tinks',
  'Aldric Venn',
  'Brisa Holloway',
  'Corwin Ashdale',
  'Delia Marsh',
  'Edric Thorne',
  'Fennick Rye',
  'Gwenna Sallow',
  'Hale Corrigan',
  'Isolde Brack',
  'Jory Wainwright',
  'Katrin Vell',
  'Lucan Merrow',
  'Maud Calloway',
  'Niall Strand',
  'Oriel Hask',
  'Perrin Lusk',
  'Rhosyn Quill',
  'Sabine Harrow',
  'Tobin Fairweather',
  'Wenna Cole',
];

const DWARF_NAMES: readonly string[] = [
  'Bardin Coalhand',
  'Doke',
  'Dagna Ironvein',
  'Durk Stonebrow',
  'Frida Anvilsong',
  'Gorm Flintbeard',
  'Hilde Deepdelve',
  'Korvak Ashbellow',
  'Magda Copperhelm',
  'Orsk Granitefist',
  'Runa Hammerfall',
  'Thrain Blackseam',
  'Ulla Emberforge',
];

const ELF_NAMES: readonly string[] = [
  'Elfy',
  'Aelindra',
  'Caelith Morrowind',
  'Elowen Starfall',
  'Faelar Thistledown',
  'Ilyra Moonwhisper',
  'Lirael Dawnmere',
  'Nimeriel',
  'Saelis Ambergrove',
  'Thalion Silverbough',
  'Vaelin Nightbloom',
  'Yssra Willowmere',
  'Zephyrine Larkspur',
];

const HALFLING_NAMES: readonly string[] = [
  'Huge',
  'Bramble Underhill',
  'Cobb Tealeaf',
  'Daisy Brambleton',
  'Fen Buttercross',
  'Hob Applewhistle',
  'Lark Goodbarrow',
  'Merry Thistlefoot',
  'Nell Puddlewick',
  'Pip Hollowmead',
  'Rosie Kettleby',
  'Tansy Greenhollow',
  'Wick Barleycorn',
];

const NAMES: Record<string, readonly string[]> = {
  human: HUMAN_NAMES,
  fighter: ['Flarg', ...HUMAN_NAMES.filter((name) => name !== 'Flarg')],
  cleric: ['Clarence', ...HUMAN_NAMES.filter((name) => name !== 'Clarence')],
  magic_user: ['Mazpar', ...HUMAN_NAMES.filter((name) => name !== 'Mazpar')],
  thief: ['Tinks', ...HUMAN_NAMES.filter((name) => name !== 'Tinks')],
  dwarf: DWARF_NAMES,
  elf: ELF_NAMES,
  halfling: HALFLING_NAMES,
};

/**
 * A name for a new character, different from the one in the field.
 *
 * @param race - The class ID or race of the chosen class, such as `fighter` or `dwarf`. Unknown values use human names.
 * @param current - The current name in the field, which the suggestion avoids.
 * @param random - A number from 0 up to 1, such as `Math.random()`.
 * @param taken - Names the player's other characters already have, which the suggestion avoids when possible.
 */
export function suggestName(
  race: string | null | undefined,
  current: string,
  random: number,
  taken: readonly string[] = [],
): string {
  const list = NAMES[race ?? 'human'] ?? NAMES.human ?? [];
  const avoid = new Set([current.trim(), ...taken]);
  const fresh = list.filter((name) => !avoid.has(name));
  const options = fresh.length > 0 ? fresh : list.filter((name) => name !== current.trim());
  const pool = options.length > 0 ? options : list;
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))] ?? 'Flarg';
}
