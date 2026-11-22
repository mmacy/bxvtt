import type { CompendiumEntry } from '@/app';
import type { IconName } from '@/ui';

/** The kinds of entry the compendium shows. `commands` has no section of its own, only entries. */
export type EntryKind = CompendiumEntry['kind'];

/** The sections of the rulebook, in the order of the tab strip. */
export type SectionId = Exclude<EntryKind, 'commands'>;

export interface SectionInfo {
  id: SectionId;
  label: string;
  /** The singular name, for a result group or a breadcrumb: "Spell". */
  singular: string;
  icon: IconName;
  blurb: string;
}

export const SECTIONS: readonly SectionInfo[] = [
  {
    id: 'classes',
    label: 'Classes',
    singular: 'Class',
    icon: 'shield',
    blurb: 'Requirements, hit dice, and level tables.',
  },
  {
    id: 'spells',
    label: 'Spells',
    singular: 'Spell',
    icon: 'spell',
    blurb: 'Cleric and magic-user spells by level.',
  },
  {
    id: 'monsters',
    label: 'Monsters',
    singular: 'Monster',
    icon: 'skull',
    blurb: 'Stat blocks, abilities, and treasure.',
  },
  {
    id: 'equipment',
    label: 'Equipment',
    singular: 'Equipment',
    icon: 'weapon-sword',
    blurb: 'Weapons, armour, gear, and ammunition.',
  },
  {
    id: 'magic-items',
    label: 'Magic items',
    singular: 'Magic item',
    icon: 'wand',
    blurb: 'Potions, rings, wands, swords, and more.',
  },
  {
    id: 'languages',
    label: 'Languages',
    singular: 'Language',
    icon: 'message',
    blurb: 'The tongues a character can speak.',
  },
  {
    id: 'tables',
    label: 'Tables',
    singular: 'Table',
    icon: 'scroll',
    blurb: 'Abilities, combat, encounters, and treasure.',
  },
];

export function sectionInfo(id: SectionId): SectionInfo {
  return SECTIONS.find((section) => section.id === id) ?? SECTIONS[0]!;
}

/** The names of the rule table sets, in book order. */
export const TABLE_SETS = [
  { id: 'abilities', label: 'Ability scores', blurb: 'Modifiers, languages, and experience by score.' },
  {
    id: 'combat',
    label: 'Combat',
    blurb: 'Attack matrix, saving throws, turning undead, reactions, and experience awards.',
  },
  {
    id: 'encounters',
    label: 'Encounters',
    blurb: 'Wandering monsters by dungeon level and non-player adventurers.',
  },
  {
    id: 'treasure',
    label: 'Treasure',
    blurb: 'Treasure types, gems, magic item types, room stocking, and unguarded treasure.',
  },
] as const;

export type TableSetId = (typeof TABLE_SETS)[number]['id'];

export function tableSetInfo(id: string): { id: string; label: string; blurb: string } {
  return TABLE_SETS.find((set) => set.id === id) ?? { id, label: titleFromId(id), blurb: '' };
}

/** A page of the book. */
export type Route =
  | { page: 'home' }
  | { page: 'section'; section: SectionId }
  | { page: 'entry'; kind: EntryKind; id: string; anchor?: string }
  | { page: 'license' };

export const HOME: Route = { page: 'home' };

/** Sentence-case words from an ID or any unknown token: `magic_user` becomes `Magic user`. */
export function titleFromId(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Class IDs are `magic_user` in bxapi. Accept the hyphenated form that the kit's class icons use. */
export function normalizeEntryId(kind: EntryKind, id: string): string {
  return kind === 'classes' ? id.replace(/-/g, '_') : id;
}

/**
 * The page a deep link names. `tables` entries accept `combat` or `combat/turning` to open a set at one table.
 * An entry without an ID opens its section.
 */
export function routeFromEntry(entry: CompendiumEntry): Route {
  if (entry.kind === 'commands') return entry.id ? { page: 'entry', kind: 'commands', id: entry.id } : HOME;
  if (!entry.id) return { page: 'section', section: entry.kind };
  if (entry.kind === 'tables') {
    const [id = '', anchor] = entry.id.split('/');
    return anchor ? { page: 'entry', kind: 'tables', id, anchor } : { page: 'entry', kind: 'tables', id };
  }
  return { page: 'entry', kind: entry.kind, id: normalizeEntryId(entry.kind, entry.id) };
}

export function routesEqual(a: Route, b: Route): boolean {
  if (a.page !== b.page) return false;
  if (a.page === 'section' && b.page === 'section') return a.section === b.section;
  if (a.page === 'entry' && b.page === 'entry')
    return a.kind === b.kind && a.id === b.id && a.anchor === b.anchor;
  return true;
}

/** A stable string for a route, to key scroll positions and React subtrees. */
export function routeKey(route: Route): string {
  switch (route.page) {
    case 'home':
      return 'home';
    case 'license':
      return 'license';
    case 'section':
      return `section:${route.section}`;
    case 'entry':
      return `entry:${route.kind}:${route.id}`;
  }
}

/** The section tab a route belongs under, or `null` on the home page. */
export function sectionOfRoute(route: Route): SectionId | null {
  if (route.page === 'section') return route.section;
  if (route.page === 'entry' && route.kind !== 'commands') return route.kind;
  return null;
}

/** The ID of an anchor inside the entry page, for a deep link to one table. */
export function anchorId(anchor: string): string {
  return `compendium-${anchor}`;
}

/** One printed table inside a rule table set, so search and links can open the set at the right place. */
export interface TableAnchor {
  set: TableSetId;
  anchor: string;
  title: string;
  /** Words that find the table by search, besides its title. */
  keywords: string;
}

export const TABLE_ANCHORS: readonly TableAnchor[] = [
  { set: 'abilities', anchor: 'strength', title: 'Strength', keywords: 'melee open doors modifier' },
  { set: 'abilities', anchor: 'intelligence', title: 'Intelligence', keywords: 'languages literacy' },
  { set: 'abilities', anchor: 'wisdom', title: 'Wisdom', keywords: 'magic saves modifier' },
  {
    set: 'abilities',
    anchor: 'dexterity',
    title: 'Dexterity',
    keywords: 'armour class missile initiative modifier',
  },
  { set: 'abilities', anchor: 'constitution', title: 'Constitution', keywords: 'hit points modifier' },
  { set: 'abilities', anchor: 'charisma', title: 'Charisma', keywords: 'reactions retainers loyalty' },
  {
    set: 'abilities',
    anchor: 'prime-requisite',
    title: 'Prime requisite experience',
    keywords: 'xp bonus modifier',
  },
  {
    set: 'combat',
    anchor: 'attack-matrix',
    title: 'Attack matrix',
    keywords: 'to hit thac0 attack roll armour class',
  },
  {
    set: 'combat',
    anchor: 'saving-throws',
    title: 'Monster saving throws',
    keywords: 'saves death wands paralysis breath spells',
  },
  { set: 'combat', anchor: 'turning', title: 'Turning undead', keywords: 'turn cleric destroy' },
  {
    set: 'combat',
    anchor: 'reaction',
    title: 'Monster reactions',
    keywords: 'reaction roll 2d6 hostile friendly',
  },
  { set: 'combat', anchor: 'xp-awards', title: 'Monster experience awards', keywords: 'xp hit dice' },
  {
    set: 'encounters',
    anchor: 'wandering',
    title: 'Wandering monsters',
    keywords: 'encounter dungeon level d20 random',
  },
  {
    set: 'encounters',
    anchor: 'npc-parties',
    title: 'Non-player adventurers',
    keywords: 'npc party class level alignment',
  },
  { set: 'treasure', anchor: 'treasure-types', title: 'Treasure types', keywords: 'hoard letter lair' },
  { set: 'treasure', anchor: 'gems', title: 'Gems and jewellery', keywords: 'value gp' },
  {
    set: 'treasure',
    anchor: 'magic-item-types',
    title: 'Magic item types',
    keywords: 'roll d% basic expert',
  },
  {
    set: 'treasure',
    anchor: 'stocking',
    title: 'Room stocking',
    keywords: 'dungeon contents empty monster trap special',
  },
  { set: 'treasure', anchor: 'unguarded', title: 'Unguarded treasure', keywords: 'cache dungeon level' },
];
