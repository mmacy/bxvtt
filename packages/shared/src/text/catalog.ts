/**
 * Names of the built-in catalog entries, read from `data/catalog.json` (which `tools/extract-codes.py` writes
 * from osrlib). They give an event that names `torch`, `sleep`, or `goblin` a readable noun without a lookup.
 */

import catalog from './data/catalog.json' with { type: 'json' };
import { capitalizeFirst, pluralize, prettifyId } from './format';

export interface ItemNoun {
  /** Singular noun phrase without an article: `flask of oil`. */
  one: string;
  /** Plural noun phrase: `flasks of oil`. */
  many: string;
  /** True for a name that takes no article, such as `thieves' tools`. */
  noArticle?: boolean;
}

/** Hand-written nouns for catalog entries whose printed name describes a lot or a pack, such as `Torches (6)`. */
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
  thieves_tools: { one: "thieves' tools", many: "thieves' tools", noArticle: true },
  tinder_box: { one: 'tinder box', many: 'tinder boxes' },
  wine: { one: 'flask of wine', many: 'flasks of wine' },
  wolfsbane: { one: 'bunch of wolfsbane', many: 'bunches of wolfsbane' },
  arrows: { one: 'arrow', many: 'arrows' },
  crossbow_bolts: { one: 'crossbow bolt', many: 'crossbow bolts' },
  silver_tipped_arrow: { one: 'silver-tipped arrow', many: 'silver-tipped arrows' },
  sling_stones: { one: 'sling stone', many: 'sling stones' },
  leather: { one: 'leather armour', many: 'suits of leather armour' },
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
for (const entry of catalog.equipment) {
  const override = ITEM_NOUN_OVERRIDES[entry.id];
  if (override) {
    EQUIPMENT.set(entry.id, override);
    continue;
  }
  const one = lowerCatalogName(entry.name);
  EQUIPMENT.set(entry.id, { one, many: pluralize(one) });
}

const EQUIPMENT_BY_NAME = new Map<string, ItemNoun>();
for (const entry of catalog.equipment) {
  const noun = EQUIPMENT.get(entry.id);
  if (noun) EQUIPMENT_BY_NAME.set(entry.name, noun);
}

const MAGIC_ITEMS = new Map<string, string>(
  catalog.magic_items.map((entry) => [entry.id, lowerCatalogName(entry.name)]),
);
const SPELLS = new Map<string, string>(
  catalog.spells.map((entry) => [entry.id, lowerCatalogName(entry.name)]),
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
 * Noun for an item by its printed catalog name, such as `Oil (1 flask)`. An attack event names the weapon
 * this way. Names that aren't in the catalog, such as `Sword +1`, come back lower-cased.
 */
export function itemNounByName(name: string): ItemNoun {
  return (
    EQUIPMENT_BY_NAME.get(name) ?? { one: lowerCatalogName(name), many: pluralize(lowerCatalogName(name)) }
  );
}

/** Lower-case name of a built-in magic item template, such as `potion of healing`. */
export function magicItemTemplateName(id: string): string | undefined {
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
