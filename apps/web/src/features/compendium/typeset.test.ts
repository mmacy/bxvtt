import type { AttackRoutine, MonsterHitDice } from '@bxvtt/shared/bxapi';
import { describe, expect, it } from 'vitest';
import { sortTurningColumns } from './tables/CombatTables';
import {
  defenceLines,
  effectLabel,
  formatArmourClass,
  formatAttackRoutine,
  formatHitDice,
  formatMovement,
  formatSaveAs,
  proseLines,
  scoreRange,
  splitLabel,
  stripMarkup,
  treasureEntryText,
} from './typeset';

const hd = (partial: Partial<MonsterHitDice>): MonsterHitDice => ({
  count: 1,
  die: 8,
  modifier: 0,
  asterisks: 0,
  average_hp: null,
  fixed_hp: null,
  ...partial,
});

describe('stripMarkup', () => {
  it('keeps the text of a Markdown link and drops its target', () => {
    expect(stripMarkup('[Language](/srd/index.php/Languages "Languages") and spells')).toBe(
      'Language and spells',
    );
  });

  it('removes bold marks but leaves the asterisks of hit dice', () => {
    expect(stripMarkup('**Bold** and 3* here')).toBe('Bold and 3* here');
  });
});

describe('prose', () => {
  it('splits a line into its run-in label and text', () => {
    expect(splitLabel('Duration: 6 turns')).toEqual({ label: 'Duration', text: '6 turns' });
    expect(splitLabel('Causes creatures to sleep. Note: this is a sentence.')).toEqual({
      label: null,
      text: 'Causes creatures to sleep. Note: this is a sentence.',
    });
  });

  it('returns the non-empty lines with markup removed', () => {
    expect(proseLines('One\n\n[Two](x)\n')).toEqual(['One', 'Two']);
  });
});

describe('stat block formatters', () => {
  it('prints hit dice as a stat block does', () => {
    expect(formatHitDice(hd({ count: 1, modifier: -1 }))).toBe('1-1');
    expect(formatHitDice(hd({ count: 4, modifier: 1, asterisks: 2 }))).toBe('4+1**');
    expect(formatHitDice(hd({ count: 1, die: 4 }))).toBe('½');
    expect(formatHitDice(hd({ count: 0, fixed_hp: 1 }))).toBe('1 hp');
  });

  it('prints both armour class forms, or says every attack hits', () => {
    expect(formatArmourClass(6, 13)).toBe('6 [13]');
    expect(formatArmourClass(null, null)).toBe('Every attack hits');
  });

  it('prints attacks with their damage, effects, and plural names', () => {
    const routine: AttackRoutine = {
      use: 'primary',
      attacks: [
        {
          count: 2,
          name: 'claw',
          damage: '1d4',
          fixed_damage: null,
          fixed_damage_options: [],
          by_weapon: false,
          by_weapon_modifier: 0,
          effects: [],
        },
        {
          count: 1,
          name: 'bite',
          damage: '2d6',
          fixed_damage: null,
          fixed_damage_options: [],
          by_weapon: false,
          by_weapon_modifier: 0,
          effects: ['energy_drain'],
        },
        {
          count: 1,
          name: 'weapon',
          damage: '1d6',
          fixed_damage: null,
          fixed_damage_options: [],
          by_weapon: true,
          by_weapon_modifier: 1,
          effects: [],
        },
      ],
    };
    expect(formatAttackRoutine(routine)).toBe(
      '2 claws (1d4), 1 bite (2d6 plus energy drain), 1 weapon (usually 1d6 +1)',
    );
  });

  it('prints movement with its mode', () => {
    expect(formatMovement({ rate_feet: 240, encounter_rate_feet: 80, descriptor: 'flying' })).toBe(
      "240' (80') flying",
    );
  });

  it('says what a monster saves as', () => {
    expect(formatSaveAs('NH')).toBe('normal human');
    expect(formatSaveAs('2')).toBe('fighter 2');
    expect(formatSaveAs('Cleric 1')).toBe('cleric 1');
  });

  it('turns an effect tag into words', () => {
    expect(effectLabel('1d10_hull_damage')).toBe('1d10 hull damage');
  });

  it('writes defences as sentences', () => {
    expect(
      defenceLines({
        harmed_only_by: ['silver', 'magic'],
        reductions: [{ keys: [], divisor: 2 }],
        energy: { fire: { immunity: 'all', auto_save_magical: false } },
        condition_immunities: ['charmed', 'asleep'],
      }),
    ).toEqual([
      'Harmed only by silver or magic.',
      'Takes half damage from every source.',
      'Immune to fire.',
      'Immune to being charmed and asleep.',
    ]);
  });
});

describe('table formatters', () => {
  it('ranges ability scores with a hyphen', () => {
    expect(scoreRange(3, 3)).toBe('3');
    expect(scoreRange(4, 5)).toBe('4-5');
  });

  it('prints a treasure line with its chance', () => {
    expect(
      treasureEntryText({
        chance_pct: 25,
        coins: { denomination: 'cp', dice: '1d6×1000' },
        gems_dice: null,
        jewellery_dice: null,
        magic: [],
      }),
    ).toEqual({ chance: '25%', text: '1d6×1000 cp' });
    expect(
      treasureEntryText({
        chance_pct: 0,
        coins: null,
        gems_dice: null,
        jewellery_dice: null,
        magic: [{ kind: 'any', categories: [], count: 3, count_dice: null, exclude: ['sword'] }],
      }),
    ).toEqual({ chance: 'Always', text: 'any 3 magic items, no magic sword' });
  });

  it('keeps the printed order of the turning undead columns', () => {
    expect(sortTurningColumns(['1', '2', '3', '4', '5', '6', '7-9', '2*'])).toEqual([
      '1',
      '2',
      '2*',
      '3',
      '4',
      '5',
      '6',
      '7-9',
    ]);
  });
});
