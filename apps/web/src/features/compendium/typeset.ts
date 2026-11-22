/**
 * Pure formatters that turn bxapi's catalog fields into the words and notation of a B/X rulebook. They show
 * what the catalogs state and never compute a rule.
 */
import type {
  AlignmentSpec,
  AttackRoutine,
  MonsterHitDice,
  MovementMode,
  NumberAppearingValue,
  TreasureEntry,
  TreasureRef,
} from '@bxvtt/shared/bxapi';
import {
  alignmentLabel,
  conditionLabel,
  formatDice,
  formatInteger,
  joinList,
  pluralize,
  signed,
} from '@bxvtt/shared/text';
import { titleFromId } from './model';

/** Removes the Markdown links and bold marks that the SRD compilation leaves in some names and prose. */
export function stripMarkup(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Splits catalog prose into its non-empty lines, with markup removed. */
export function proseLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => stripMarkup(line))
    .filter((line) => line.length > 0);
}

export interface LabelledLine {
  label: string | null;
  text: string;
}

const LABEL_PATTERN = /^([A-Z][^:.!?\n]{0,48}?):\s+(\S.*)$/;

/** Splits a line such as `Duration: 6 turns` into its label and text. A line with no label has `label: null`. */
export function splitLabel(line: string): LabelledLine {
  const match = LABEL_PATTERN.exec(line);
  if (match && (match[1]?.split(/\s+/).length ?? 0) <= 7) {
    return { label: match[1] ?? null, text: match[2] ?? '' };
  }
  return { label: null, text: line };
}

/** Hit dice as the stat block prints them: `1-1`, `4+1*`, `½`, or `1 hp`. */
export function formatHitDice(hd: MonsterHitDice): string {
  if (hd.count === 0) return hd.fixed_hp === null ? '0' : `${hd.fixed_hp} hp`;
  if (hd.die === 4 && hd.count === 1 && hd.modifier === 0) return `½${'*'.repeat(hd.asterisks)}`;
  const modifier = hd.modifier === 0 ? '' : hd.modifier < 0 ? `${hd.modifier}` : `+${hd.modifier}`;
  return `${hd.count}${modifier}${'*'.repeat(hd.asterisks)}`;
}

/** The hit points a stat block states beside the hit dice, such as `avg. 3 hp` or `80 hp`. */
export function hitPointsNote(hd: MonsterHitDice): string | null {
  if (hd.count === 0) return null;
  if (hd.fixed_hp !== null) return `${hd.fixed_hp} hp`;
  if (hd.average_hp !== null) return `avg. ${hd.average_hp} hp`;
  return null;
}

/** Armour class in descending notation with the ascending value in brackets: `6 [13]`. */
export function formatArmourClass(descending: number | null | undefined, ascending?: number | null): string {
  if (descending === null || descending === undefined) return 'Every attack hits';
  return ascending === null || ascending === undefined ? `${descending}` : `${descending} [${ascending}]`;
}

/** Whether a catalog field that may be missing or null holds a number. */
export function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number';
}

/** A plain attack-matrix label for a number that may be negative. Uses a hyphen-minus. */
export function formatNumber(n: number): string {
  return formatInteger(n);
}

/** Names what a hit does beyond damage: `energy_drain` becomes `energy drain`. */
export function effectLabel(effect: string): string {
  return titleFromId(effect).toLowerCase();
}

function attackDamage(attack: AttackRoutine['attacks'][number]): string {
  const parts: string[] = [];
  if (attack.damage) {
    const dice = formatDice(attack.damage);
    const modifier = attack.by_weapon_modifier ? ` ${signed(attack.by_weapon_modifier)}` : '';
    parts.push(attack.by_weapon ? `usually ${dice}${modifier}` : `${dice}${modifier}`);
  } else if (attack.fixed_damage !== null) {
    parts.push(`${attack.fixed_damage}`);
  } else if (attack.fixed_damage_options.length > 0) {
    parts.push(joinList(attack.fixed_damage_options.map(String), 'or'));
  } else if (attack.by_weapon) {
    parts.push('by weapon');
  }
  const damage = parts.join(', ');
  if (attack.effects.length === 0) return damage;
  const effects = joinList(attack.effects.map(effectLabel));
  return damage ? `${damage} plus ${effects}` : effects;
}

/** One attack routine in stat block form: `2 claws (1d4), 1 bite (2d6)`. */
export function formatAttackRoutine(routine: AttackRoutine): string {
  return routine.attacks
    .map((attack) => {
      const name = attack.count === 1 ? stripMarkup(attack.name) : pluralize(stripMarkup(attack.name));
      const damage = attackDamage(attack);
      return damage ? `${attack.count} ${name} (${damage})` : `${attack.count} ${name}`;
    })
    .join(', ');
}

/** When a monster uses a routine. The first, primary routine needs no label. */
export function routineUseLabel(use: string): string {
  switch (use) {
    case 'primary':
      return 'Attacks';
    case 'alternative':
      return 'Or instead';
    case 'situational':
      return 'In some situations';
    case 'special':
      return 'Special attack';
    default:
      return titleFromId(use);
  }
}

/** A movement rate as the stat block prints it: `60' (20')`, with the mode after it: `240' (80') flying`. */
export function formatMovement(mode: MovementMode): string {
  const rate = `${formatInteger(mode.rate_feet)}' (${formatInteger(mode.encounter_rate_feet)}')`;
  return mode.descriptor ? `${rate} ${mode.descriptor}` : rate;
}

/** Which class and level a monster saves as: `NH` becomes `normal human`, `2` becomes `fighter 2`. */
export function formatSaveAs(saveAs: string): string {
  const value = saveAs.trim();
  if (value === 'NH') return 'normal human';
  if (/^\d+$/.test(value)) return `fighter ${value}`;
  if (/^F\d/.test(value)) return value.replace(/^F(\d+)( to )F(\d+)$/, 'fighter $1$2$3');
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/** The alignments a monster may have: `Chaotic`, `Lawful, neutral, or chaotic`. */
export function formatAlignmentSpec(spec: AlignmentSpec): string {
  const options = spec.options.map(alignmentLabel);
  if (options.length === 0) return 'Unaligned';
  const text = joinList(
    options.map((option, index) => (index === 0 ? option : option.toLowerCase())),
    'or',
  );
  return spec.usual ? `${text} (usually ${alignmentLabel(spec.usual).toLowerCase()})` : text;
}

/** A number appearing value: `2d4`, `1`, or `See description`. */
export function formatNumberAppearing(value: NumberAppearingValue): string {
  if (value.dice) return formatDice(value.dice);
  if (value.fixed !== null) return `${value.fixed}`;
  return 'See description';
}

export interface TreasureLine {
  letters: string[];
  parenthetical: string[];
  notes: string[];
}

/** The parts of a treasure line, so a view can link each treasure type letter. */
export function treasureLine(treasure: TreasureRef): TreasureLine {
  const notes: string[] = [];
  if (treasure.multiplier > 1) notes.push(`generate ${treasure.multiplier} times`);
  if (treasure.extra_gp > 0) notes.push(`plus ${formatInteger(treasure.extra_gp)} gp`);
  for (const special of treasure.special) notes.push(special);
  if (treasure.see_below) notes.push('see description');
  return { letters: treasure.letters, parenthetical: treasure.parenthetical, notes };
}

/** What a monster is worth when a group member differs: `bodyguard 20, king 35`. */
export function formatXpNotes(notes: readonly { role: string; xp: number }[]): string {
  return notes.map((note) => `${note.role} ${formatInteger(note.xp)}`).join(', ');
}

/** A range of ability scores: `3`, `4-5`. */
export function scoreRange(min: number, max: number): string {
  return min === max ? `${min}` : `${min}-${max}`;
}

/** An experience modifier: `+10%`, `0%`, `-20%`. */
export function formatPercentModifier(pct: number): string {
  return pct === 0 ? '0%' : `${signed(pct)}%`;
}

/** A price in gold pieces. */
export function formatCost(gp: number): string {
  return gp === 0 ? 'Free' : `${formatInteger(gp)} gp`;
}

/** Weight in coins, the B/X unit of encumbrance. */
export function formatWeight(coins: number): string {
  return `${formatInteger(coins)} coins`;
}

/** A chance such as `2` in six: `2 in 6`. */
export function chanceInSix(n: number): string {
  return `${n} in 6`;
}

/** Damage reduction and immunity lines for a monster's defences, as sentences. */
export function defenceLines(defenses: {
  harmed_only_by: readonly string[];
  reductions: readonly { keys: readonly string[]; divisor: number }[];
  energy: Record<string, { immunity: string; auto_save_magical: boolean }>;
  condition_immunities: readonly string[];
}): string[] {
  const lines: string[] = [];
  const source = (key: string) => (key === 'magic' ? 'magic' : key);
  if (defenses.harmed_only_by.length > 0) {
    lines.push(`Harmed only by ${joinList(defenses.harmed_only_by.map(source), 'or')}.`);
  }
  for (const reduction of defenses.reductions) {
    const amount = reduction.divisor === 2 ? 'half' : `1/${reduction.divisor}`;
    lines.push(
      reduction.keys.length === 0
        ? `Takes ${amount} damage from every source.`
        : `Takes ${amount} damage from ${joinList(reduction.keys.map(source), 'or')}.`,
    );
  }
  for (const [element, defense] of Object.entries(defenses.energy)) {
    const name = element.replace(/_/g, ' ');
    lines.push(
      defense.immunity === 'all'
        ? `Immune to ${name}.`
        : `Immune to non-magical ${name}${defense.auto_save_magical ? ' and saves automatically against magical ' + name : ''}.`,
    );
  }
  if (defenses.condition_immunities.length > 0) {
    lines.push(
      `Immune to being ${joinList(defenses.condition_immunities.map((c) => conditionLabel(c).toLowerCase()))}.`,
    );
  }
  return lines;
}

const MAGIC_TYPE_LABELS: Record<string, string> = {
  armour: 'Armour or shield',
  misc: 'Miscellaneous item',
  potion: 'Potion',
  ring: 'Ring',
  rod_staff_wand: 'Rod, staff, or wand',
  scroll: 'Scroll or map',
  sword: 'Magic sword',
  weapon: 'Magic weapon',
};

/** Label for a row of the master magic item type table. */
export function magicItemTypeLabel(type: string): string {
  return MAGIC_TYPE_LABELS[type] ?? titleFromId(type);
}

const MAGIC_CATEGORY_LABELS: Record<string, { singular: string; plural: string }> = {
  armour: { singular: 'Armour or shield', plural: 'Armour and shields' },
  misc: { singular: 'Miscellaneous item', plural: 'Miscellaneous items' },
  potion: { singular: 'Potion', plural: 'Potions' },
  ring: { singular: 'Ring', plural: 'Rings' },
  rod: { singular: 'Rod', plural: 'Rods' },
  staff: { singular: 'Staff', plural: 'Staves' },
  wand: { singular: 'Wand', plural: 'Wands' },
  scroll: { singular: 'Scroll or map', plural: 'Scrolls and maps' },
  sword: { singular: 'Sword', plural: 'Swords' },
  weapon: { singular: 'Weapon', plural: 'Weapons' },
};

/** Label for a magic item category: `Wand`, or `Wands` with `plural`. */
export function magicCategoryLabel(category: string, plural = false): string {
  const entry = MAGIC_CATEGORY_LABELS[category];
  if (!entry) return titleFromId(category);
  return plural ? entry.plural : entry.singular;
}

const COIN_LABELS: Record<string, string> = { pp: 'pp', gp: 'gp', ep: 'ep', sp: 'sp', cp: 'cp' };

/** One printed line of a treasure type, such as `25%: 1d6×1000 cp`. */
export function treasureEntryText(entry: TreasureEntry): { chance: string; text: string } {
  const parts: string[] = [];
  if (entry.coins)
    parts.push(`${entry.coins.dice} ${COIN_LABELS[entry.coins.denomination] ?? entry.coins.denomination}`);
  if (entry.gems_dice) parts.push(`${formatDice(entry.gems_dice)} gems`);
  if (entry.jewellery_dice) parts.push(`${formatDice(entry.jewellery_dice)} jewellery`);
  for (const magic of entry.magic) {
    const count = magic.count_dice ? formatDice(magic.count_dice) : `${magic.count ?? 1}`;
    if (magic.kind === 'any') {
      const except =
        magic.exclude.length > 0
          ? `, no ${joinList(
              magic.exclude.map((type) => magicItemTypeLabel(type).toLowerCase()),
              'or',
            )}`
          : '';
      parts.push(`any ${count} magic item${count === '1' ? '' : 's'}${except}`);
    } else if (magic.kind === 'category') {
      parts.push(
        `${count} ${magic.categories.map((type) => magicItemTypeLabel(type).toLowerCase()).join(' ')}`,
      );
    } else {
      parts.push(
        `${count} of ${joinList(
          magic.categories.map((type) => magicItemTypeLabel(type).toLowerCase()),
          'or',
        )}`,
      );
    }
  }
  const chance = entry.chance_pct === 0 ? 'Always' : `${entry.chance_pct}%`;
  return { chance, text: parts.join(' and ') };
}

const EQUIPMENT_GROUPS: Record<string, string> = {
  weapon: 'Weapons',
  armour: 'Armour',
  gear: 'Adventuring gear',
  ammunition: 'Ammunition',
};

/** The heading of a group of equipment: `Weapons`. */
export function equipmentGroupLabel(itemType: string): string {
  return EQUIPMENT_GROUPS[itemType] ?? titleFromId(itemType);
}

/** Sorts names the way a rulebook index does: ignoring case, accents, and punctuation. */
export function indexKey(name: string): string {
  return normalize(name).replace(/\s+/g, ' ');
}

/** Lowercase, accent-free, punctuation-free text for matching. Apostrophes join words: `thieves’` is `thieves`. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
