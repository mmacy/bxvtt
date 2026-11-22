/**
 * Original names for the "Suggest a name" button, grouped by the race a class belongs to. They are invented for
 * bxvtt and borrow from no published setting.
 */

const NAMES: Record<string, readonly string[]> = {
  human: [
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
  ],
  dwarf: [
    'Bardin Coalhand',
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
  ],
  elf: [
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
  ],
  halfling: [
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
  ],
};

/**
 * A name for a new character, different from the one in the field.
 *
 * @param race - The race of the chosen class, such as `dwarf`. An unknown race uses the human names.
 * @param current - The name the field holds now, which the suggestion avoids.
 * @param random - A number from 0 up to 1, such as `Math.random()`.
 * @param taken - Names the player's other characters already have, which the suggestion avoids when it can.
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
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))] ?? 'Wren';
}
