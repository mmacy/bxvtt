/**
 * Names of the built-in catalog entries, read from `data/catalog.json` (which `tools/extract-codes.py` writes
 * from osrlib). They give an event that names `torch`, `sleep`, or `goblin` a readable noun without a lookup.
 */

import catalog from './data/catalog.json' with { type: 'json' };
import { capitalizeFirst, indefiniteArticle, pluralize, prettifyId, singularize } from './format';

/**
 * How to name an item in a sentence. Get one with [`resolveItemNoun`][resolveItemNoun] for an item ID, or with
 * [`itemNounFromName`][itemNounFromName] for a printed name, and turn it into a phrase with
 * [`itemPhrase`][itemPhrase].
 */
export interface ItemNoun {
  /** Singular noun phrase without an article: `flask of oil`, `torch`, `Hand of Saint Corvane`. */
  one: string;
  /** Plural noun phrase: `flasks of oil`. */
  many: string;
  /** True for a name that takes no article, such as `thieves' tools`. */
  noArticle?: boolean;
  /**
   * True for a proper name, such as an adventure's `Hand of Saint Corvane`. It keeps its capitals and takes
   * `the` instead of `a` or `an`.
   */
  proper?: boolean;
}

/**
 * Hand-written nouns for catalog entries whose printed name describes a lot or a pack, such as `Torches (6)`.
 * Each noun names one unit of the item as osrlib counts it in an inventory stack, so `6 torches` is one lot.
 */
const ITEM_NOUN_OVERRIDES: Record<string, ItemNoun> = {
  torch: { one: 'torch', many: 'torches' },
  iron_spikes: { one: 'iron spike', many: 'iron spikes' },
  rations_iron: { one: 'iron ration', many: 'iron rations' },
  rations_standard: { one: 'standard ration', many: 'standard rations' },
  oil_flask: { one: 'flask of oil', many: 'flasks of oil' },
  holy_water: { one: 'vial of holy water', many: 'vials of holy water' },
  hammer: { one: 'small hammer', many: 'small hammers' },
  mirror: { one: 'steel mirror', many: 'steel mirrors' },
  pole: { one: '10-foot pole', many: '10-foot poles' },
  rope: { one: '50-foot rope', many: '50-foot ropes' },
  sack_large: { one: 'large sack', many: 'large sacks' },
  sack_small: { one: 'small sack', many: 'small sacks' },
  stakes_and_mallet: { one: 'set of wooden stakes and a mallet', many: 'sets of wooden stakes and a mallet' },
  thieves_tools: { one: "thieves' tools", many: "sets of thieves' tools", noArticle: true },
  tinder_box: { one: 'tinder box', many: 'tinder boxes' },
  wine: { one: 'pint of wine', many: 'pints of wine' },
  wolfsbane: { one: 'bunch of wolfsbane', many: 'bunches of wolfsbane' },
  arrows: { one: 'arrow', many: 'arrows' },
  crossbow_bolts: { one: 'crossbow bolt', many: 'crossbow bolts' },
  silver_tipped_arrow: { one: 'silver-tipped arrow', many: 'silver-tipped arrows' },
  sling_stones: { one: 'sling stone', many: 'sling stones' },
  leather: { one: 'suit of leather armour', many: 'suits of leather armour' },
  chainmail: { one: 'suit of chainmail', many: 'suits of chainmail' },
  plate_mail: { one: 'suit of plate mail', many: 'suits of plate mail' },
  garlic: { one: 'clove of garlic', many: 'cloves of garlic' },
  backpack: { one: 'backpack', many: 'backpacks' },
};

/** Lower-case a catalog name but keep acronyms such as ESP and numerals such as II. */
export function lowerCatalogName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (word.length >= 2 && /^[A-Z]+[’']?[0-9]*$/.test(word) ? word : word.toLowerCase()))
    .join(' ');
}

const EQUIPMENT = new Map<string, ItemNoun>();
const LOT_SIZES = new Map<string, number>();
for (const entry of catalog.equipment) {
  LOT_SIZES.set(entry.id, entry.lot_size);
  const override = ITEM_NOUN_OVERRIDES[entry.id];
  if (override) {
    EQUIPMENT.set(entry.id, override);
    continue;
  }
  // osrlib states each item's display names. An entry without them reads by its printed name.
  const one = entry.display_name || lowerCatalogName(entry.name);
  EQUIPMENT.set(entry.id, { one, many: entry.display_name_plural || pluralize(one) });
}

/** Built-in equipment nouns by every spelling a caller might pass: the printed name and the curated nouns. */
const EQUIPMENT_BY_NAME = new Map<string, ItemNoun>();
for (const entry of catalog.equipment) {
  const noun = EQUIPMENT.get(entry.id);
  if (!noun) continue;
  for (const spelling of [entry.name, lowerCatalogName(entry.name), noun.one, noun.many]) {
    const key = spelling.toLowerCase();
    if (!EQUIPMENT_BY_NAME.has(key)) EQUIPMENT_BY_NAME.set(key, noun);
  }
}

/** The noun of a built-in magic item template, from osrlib's display names. */
function magicItemNoun(entry: (typeof catalog.magic_items)[number]): ItemNoun {
  const one = entry.display_name || lowerCatalogName(entry.name);
  return { one, many: entry.display_name_plural || pluralize(one) };
}
const MAGIC_ITEMS = new Map<string, ItemNoun>(
  catalog.magic_items.map((entry) => [entry.id, magicItemNoun(entry)]),
);
const MAGIC_ITEMS_BY_NAME = new Map<string, ItemNoun>();
for (const entry of catalog.magic_items) {
  const noun = magicItemNoun(entry);
  for (const spelling of [entry.name, noun.one]) {
    if (!MAGIC_ITEMS_BY_NAME.has(spelling.toLowerCase()))
      MAGIC_ITEMS_BY_NAME.set(spelling.toLowerCase(), noun);
  }
}
const SPELLS = new Map<string, string>(
  // A spell's name is a proper name, written as the rules write it: `Sleep`, `Magic Missile`.
  catalog.spells.map((entry) => [entry.id, entry.name]),
);
const MONSTERS = new Map<string, { label: string; labelPlural: string; name: string }>(
  catalog.monsters.map((entry) => [
    entry.id,
    { label: entry.label, labelPlural: entry.label_plural, name: entry.name },
  ]),
);

/** Noun for a built-in equipment ID such as `torch`, or undefined when the ID isn't in the catalog. */
export function equipmentNoun(id: string): ItemNoun | undefined {
  return EQUIPMENT.get(id);
}

/**
 * How many units one purchase of a built-in equipment ID delivers, such as 6 for `torch`, or undefined when the
 * ID isn't in the catalog. A `purchase_equipment` command lists one ID per lot.
 */
export function equipmentLotSize(id: string): number | undefined {
  return LOT_SIZES.get(id);
}

/** Words that stay in lower case inside a title, such as the `of` in `Hand of Saint Corvane`. */
const TITLE_SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
]);

/** True when every word of a name of two or more words, apart from small words, starts with a capital. */
function isTitleCase(name: string): boolean {
  const words = name.split(' ').filter((word) => /^[A-Za-z]/.test(word) && !TITLE_SMALL_WORDS.has(word));
  return words.length >= 2 && words.every((word) => /^[A-Z]/.test(word));
}

/** Lower-case the first word of a sentence-case name, but keep an acronym or a word such as `McGuffin`. */
function lowerFirstWord(name: string): string {
  const [first = '', ...rest] = name.split(' ');
  const keep = /^[A-Z]{2,}/.test(first) || /^.[a-z]*[A-Z]/.test(first);
  return [keep ? first : first.toLowerCase(), ...rest].join(' ');
}

/** Words for one container of a substance in a lot name, such as the `vial` of `Holy water (vial)`. */
const CONTAINER_WORDS = new Set([
  'bag',
  'barrel',
  'bottle',
  'box',
  'bunch',
  'case',
  'cask',
  'flask',
  'jar',
  'jug',
  'pint',
  'pouch',
  'quiver',
  'skin',
  'vial',
]);

/**
 * Read a lot name such as `Torches (6)`, `Oil (1 flask)`, `Holy water (vial)`, `Arrows (quiver of 20)`, or
 * `Sack (large)` as the noun for one unit, or return undefined when the name has no parenthesis.
 */
function nounFromLotName(name: string): ItemNoun | undefined {
  const match = /^([^(]*?)\s*\(([^)]*)\)\s*(.*)$/.exec(name);
  if (!match) return undefined;
  const head = lowerFirstWord((match[1] ?? '').trim());
  const inner = (match[2] ?? '').trim().toLowerCase();
  const tail = (match[3] ?? '').trim();
  if (head === '') return undefined;
  let one: string;
  const counted = /^(\d+)\s+([a-z]+)$/.exec(inner);
  if (/^\d+$/.test(inner) || /^[a-z]+ of \d+/.test(inner)) {
    // `Torches (6)` and `Arrows (quiver of 20)` count single torches and arrows.
    one = singularize(head);
  } else if (counted?.[2] !== undefined && CONTAINER_WORDS.has(singularize(counted[2]))) {
    one = `${singularize(counted[2])} of ${head}`;
  } else if (CONTAINER_WORDS.has(inner)) {
    one = `${inner} of ${head}`;
  } else if (/^[a-z]+$/.test(inner)) {
    // `Sack (large)` and `Hammer (small)` put an adjective in the parenthesis.
    one = `${inner} ${head}`;
  } else {
    one = head;
  }
  if (tail !== '') one = `${one} ${tail}`;
  return { one, many: pluralize(one) };
}

/** Options for [`itemNounFromName`][itemNounFromName]. */
export interface ItemNameOptions {
  /**
   * Read the name as a rules catalog prints it, as in `/v1/rules/magic-items`, where every name is in title case
   * (`Potion of Healing`). The noun comes out in lower case. Leave it off for a name an adventure's author wrote,
   * where title case marks a proper name.
   */
  catalog?: boolean;
}

/**
 * The noun for an item from any printed name: a catalog name, a lot name, a display name with an article, or a
 * name an adventure's author wrote. A built-in equipment name gets the curated noun whatever its spelling.
 *
 * ```ts
 * itemNounFromName('Torches (6)'); // { one: 'torch', many: 'torches' }
 * itemNounFromName('Oil (1 flask)'); // { one: 'flask of oil', many: 'flasks of oil' }
 * itemNounFromName('Leather'); // { one: 'suit of leather armour', many: 'suits of leather armour' }
 * itemNounFromName('a potion'); // { one: 'potion', many: 'potions' }
 * itemNounFromName('Hand of Saint Corvane'); // { one: 'Hand of Saint Corvane', ..., proper: true }
 * itemNounFromName('Potion of Healing', { catalog: true }); // { one: 'potion of healing', ... }
 * ```
 */
export function itemNounFromName(name: string, options: ItemNameOptions = {}): ItemNoun {
  let text = name.replace(/\s+/g, ' ').trim();
  const article = /^(a|an|some|the)\s+/i.exec(text);
  const definite = article?.[1]?.toLowerCase() === 'the';
  if (article) text = text.slice(article[0].length);
  if (text === '') return { one: 'item', many: 'items' };
  const known = EQUIPMENT_BY_NAME.get(text.toLowerCase());
  if (known) return known;
  const magic = MAGIC_ITEMS_BY_NAME.get(text.toLowerCase());
  if (magic) return magic;
  const lot = nounFromLotName(text);
  if (lot) return options.catalog ? { one: lot.one.toLowerCase(), many: lot.many.toLowerCase() } : lot;
  if (options.catalog) {
    const one = lowerCatalogName(text);
    return { one, many: pluralize(one) };
  }
  if (definite || isTitleCase(text)) return { one: text, many: pluralize(text), proper: true };
  // A name that starts with a person's name of two or more words in the possessive, such as `Miller Aske's
  // strongbox`, takes no article and keeps its capitals. One capitalized word in the possessive, as in `Prior's
  // iron key`, reads as a common noun ("a prior's iron key"), because it is usually a title.
  if (/^(?:\p{Lu}[\p{L}-]*\s+)+\p{Lu}[\p{L}-]*['’]s?\s/u.test(text)) {
    return { one: text, many: pluralize(text), noArticle: true };
  }
  const one = lowerFirstWord(text);
  return { one, many: pluralize(one) };
}

/**
 * The noun as a phrase with an article or a count: `a torch`, `an iron spike`, `12 torches`, `thieves' tools`,
 * or `the Hand of Saint Corvane`.
 *
 * ```ts
 * itemPhrase(itemNounFromName('Torches (6)'), 12); // '12 torches'
 * ```
 */
export function itemPhrase(noun: ItemNoun, quantity = 1): string {
  if (quantity !== 1) return `${quantity} ${noun.many}`;
  if (noun.noArticle) return noun.one;
  if (noun.proper) return `the ${noun.one}`;
  return `${indefiniteArticle(noun.one)} ${noun.one}`;
}

/**
 * Short display label for an item in an inventory list, card, or form option, with no leading article:
 * `Chainmail`, `Leather armour`, `Shield`, `Mace`, `6 torches`, `Flask of oil`, `Hand of Saint Corvane`.
 *
 * ```ts
 * itemLabel(itemNounFromName('Chainmail')); // 'Chainmail'
 * itemLabel(itemNounFromName('Torches (6)'), 6); // '6 torches'
 * ```
 */
export function itemLabel(noun: ItemNoun, quantity = 1): string {
  if (quantity !== 1) return `${quantity} ${noun.many}`;
  const single = noun.one
    .replace(/^suit of /i, '')
    .replace(/^set of wooden stakes and a mallet$/i, 'wooden stakes and mallet');
  return capitalizeFirst(single);
}

/**
 * Noun for an item by its printed catalog name, such as `Oil (1 flask)`. An attack event names the weapon
 * this way. A name that isn't in the catalog, such as `Sword +1`, comes back in lower case.
 */
export function itemNounByName(name: string): ItemNoun {
  return itemNounFromName(name, { catalog: true });
}

/** Lower-case name of a built-in magic item template, such as `potion of healing`. */
export function magicItemTemplateName(id: string): string | undefined {
  return MAGIC_ITEMS.get(id)?.one;
}

/** Singular and plural nouns of a built-in magic item template, as osrlib states them: `pair of boots of speed`. */
export function magicItemTemplateNoun(id: string): ItemNoun | undefined {
  return MAGIC_ITEMS.get(id);
}

/** Lower-case name of a built-in spell, such as `magic missile`. */
export function spellCatalogName(id: string): string | undefined {
  return SPELLS.get(id);
}

/** Category of a built-in magic item template: `potion`, `scroll`, `wand`, `sword`, and so on. */
export function magicItemCategory(id: string): string | undefined {
  return catalog.magic_items.find((entry) => entry.id === id)?.category;
}

/** Singular and plural labels of a built-in monster template, such as `goblin` and `goblins`. */
export function monsterTemplateLabels(
  templateId: string,
): { label: string; labelPlural: string } | undefined {
  if (templateId.startsWith('npc:')) {
    const klass = prettifyId(templateId.slice('npc:'.length));
    return { label: `${klass} adventurer`, labelPlural: `${klass} adventurers` };
  }
  return MONSTERS.get(templateId);
}

/** Display name of a character class, capitalized: `Magic-User`. */
export function classCatalogName(classId: string): string | undefined {
  const entry = catalog.classes.find((candidate) => candidate.id === classId);
  return entry ? capitalizeFirst(entry.name) : undefined;
}

/** Every catalog ID that the text layer can name without help, for tests and tooling. */
export function catalogIds(): {
  equipment: string[];
  magicItems: string[];
  spells: string[];
  monsters: string[];
} {
  return {
    equipment: [...EQUIPMENT.keys()],
    magicItems: [...MAGIC_ITEMS.keys()],
    spells: [...SPELLS.keys()],
    monsters: [...MONSTERS.keys()],
  };
}
