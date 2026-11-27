/**
 * Reads the printed tables that bxapi serves (`/api/rules/tables/abilities` and a class's entry) to show what a
 * score means. Nothing here decides whether a choice is legal: the wizard asks the server for that. These
 * functions only look a score up in a table row, the way a player reads the table in the rulebook.
 */
import type { AbilityTables } from '@bxvtt/shared/bxapi';
import type { ClassDetail } from '@/app';

/** The six abilities in the order B/X lists them, which is also the order bxapi rolls them. */
export const ABILITIES = ['str', 'int', 'wis', 'dex', 'con', 'cha'] as const;
/** An ability key, as bxapi spells it. */
export type Ability = (typeof ABILITIES)[number];

/** Ability scores keyed by ability. */
export type Scores = Record<Ability, number>;

/** Whether a string is one of the six ability keys. */
export function isAbility(value: string): value is Ability {
  return (ABILITIES as readonly string[]).includes(value);
}

/**
 * Reads bxapi's score map into the six abilities, or `null` when one is missing.
 *
 * @param scores - A score map such as an ability roll's `scores`.
 */
export function readScores(scores: Record<string, number> | null | undefined): Scores | null {
  if (!scores) return null;
  const result: Partial<Scores> = {};
  for (const ability of ABILITIES) {
    const value = scores[ability];
    if (typeof value !== 'number') return null;
    result[ability] = value;
  }
  return result as Scores;
}

interface Row {
  min_score: number;
  max_score: number;
}

function rowFor<T extends Row>(rows: readonly T[] | undefined, score: number): T | undefined {
  return rows?.find((row) => score >= row.min_score && score <= row.max_score);
}

/** One line of what a score does, such as "Melee attacks and damage, +1". */
export interface ModifierLine {
  label: string;
  value: number | string;
  /** Whether `value` is a modifier to show with a sign. */
  signed: boolean;
}

/**
 * The modifier a `StatBox` shows for a score: the strength melee modifier, the wisdom modifier to saves against
 * magic, the dexterity missile modifier, the constitution hit point modifier, and the charisma reaction
 * modifier. Intelligence has no single modifier, so it returns `undefined`.
 *
 * @param tables - bxapi's ability tables.
 * @param ability - The ability.
 * @param score - The score.
 */
export function headlineModifier(tables: AbilityTables, ability: Ability, score: number): number | undefined {
  switch (ability) {
    case 'str':
      return rowFor(tables.strength, score)?.melee;
    case 'int':
      return undefined;
    case 'wis':
      return rowFor(tables.wisdom, score)?.magic_saves;
    case 'dex':
      return rowFor(tables.dexterity, score)?.missile;
    case 'con':
      return rowFor(tables.constitution, score)?.hit_points;
    case 'cha':
      return rowFor(tables.charisma, score)?.npc_reactions;
  }
}

const LITERACY: Record<string, string> = {
  illiterate: 'Illiterate',
  basic: 'Basic',
  literate: 'Literate',
};

/**
 * Everything the ability table says about a score, as lines for a tooltip or a sheet.
 *
 * @param tables - bxapi's ability tables.
 * @param ability - The ability.
 * @param score - The score.
 */
export function modifierLines(tables: AbilityTables, ability: Ability, score: number): ModifierLine[] {
  switch (ability) {
    case 'str': {
      const row = rowFor(tables.strength, score);
      if (!row) return [];
      return [
        { label: 'Melee attacks and damage', value: row.melee, signed: true },
        { label: 'Open stuck doors', value: `${row.open_doors} in 6`, signed: false },
      ];
    }
    case 'int': {
      const row = rowFor(tables.intelligence, score);
      if (!row) return [];
      return [
        { label: 'Extra languages', value: row.additional_languages, signed: false },
        {
          label: 'Reading and writing',
          value: `${LITERACY[row.literacy] ?? row.literacy}${row.broken_speech ? ', broken speech' : ''}`,
          signed: false,
        },
      ];
    }
    case 'wis': {
      const row = rowFor(tables.wisdom, score);
      return row ? [{ label: 'Saving throws against magic', value: row.magic_saves, signed: true }] : [];
    }
    case 'dex': {
      const row = rowFor(tables.dexterity, score);
      if (!row) return [];
      return [
        { label: 'Missile attacks', value: row.missile, signed: true },
        { label: 'Armour class bonus', value: row.ac, signed: true },
        { label: 'Initiative', value: row.initiative, signed: true },
      ];
    }
    case 'con': {
      const row = rowFor(tables.constitution, score);
      return row ? [{ label: 'Hit points per hit die', value: row.hit_points, signed: true }] : [];
    }
    case 'cha': {
      const row = rowFor(tables.charisma, score);
      if (!row) return [];
      return [
        { label: 'Reactions', value: row.npc_reactions, signed: true },
        { label: 'Most retainers', value: row.max_retainers, signed: false },
        { label: 'Retainer loyalty', value: row.retainer_loyalty, signed: false },
      ];
    }
  }
}

/**
 * The number of extra languages the intelligence table lists for a score.
 *
 * @param tables - bxapi's ability tables.
 * @param intelligence - The intelligence score.
 */
export function extraLanguageCount(tables: AbilityTables, intelligence: number): number {
  return rowFor(tables.intelligence, intelligence)?.additional_languages ?? 0;
}

/**
 * The experience modifier a class's printed table lists for a set of scores. The class entry lists its tiers
 * from the largest bonus down, and the first tier whose minimums the scores meet applies, as osrlib's
 * `xp_modifier_pct` reads the same table.
 *
 * @param detail - The class entry.
 * @param scores - The scores.
 * @returns The percentage, such as `10` or `-20`.
 */
export function xpModifierFor(detail: ClassDetail, scores: Scores): number {
  for (const tier of detail.xp_tiers) {
    const met = Object.entries(tier.minimums).every(
      ([ability, minimum]) => isAbility(ability) && typeof minimum === 'number' && scores[ability] >= minimum,
    );
    if (met) return tier.modifier_pct;
  }
  return 0;
}

/** A spell list the class casts from, read from its magic ability, and whether the magic is arcane. */
export interface ClassMagic {
  kind: 'arcane' | 'divine';
  spellList: string;
}

/**
 * The magic a class casts, from the `arcane_magic` or `divine_magic` special ability in its entry.
 *
 * @param detail - The class entry.
 * @returns The kind and spell list, or `null` for a class that casts no spells.
 */
export function classMagic(detail: ClassDetail | null | undefined): ClassMagic | null {
  if (!detail) return null;
  for (const ability of detail.abilities) {
    if (ability.tag !== 'arcane_magic' && ability.tag !== 'divine_magic') continue;
    const params = ability.params as Record<string, unknown> | undefined;
    const list = typeof params?.spell_list === 'string' ? params.spell_list : detail.id;
    return { kind: ability.tag === 'arcane_magic' ? 'arcane' : 'divine', spellList: list };
  }
  return null;
}

/**
 * The spell slots the class's progression table lists at a level, by spell level from 1.
 *
 * @param detail - The class entry.
 * @param level - The character's level.
 */
export function spellSlotsAt(detail: ClassDetail | null | undefined, level: number): number[] {
  const row = detail?.progression.find((entry) => entry.level === level);
  return row?.spell_slots ?? [];
}

/** The first level at which the class table gives any spell slot, or `null` for a class without one. */
export function firstSpellLevel(detail: ClassDetail | null | undefined): number | null {
  const row = detail?.progression.find((entry) => entry.spell_slots.some((n) => n > 0));
  return row?.level ?? null;
}
