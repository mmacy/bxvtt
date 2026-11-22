import { describe, expect, it } from 'vitest';
import codes from './data/codes.json' with { type: 'json' };
import {
  abilityLabel,
  alignmentLabel,
  battleActionLabel,
  battleMoveLabel,
  classLabel,
  clockDays,
  clockTurns,
  coinLabel,
  conditionGained,
  conditionLabel,
  count,
  directionLabel,
  doorStateFromEdge,
  doorStateLabel,
  facingLabel,
  formatCoins,
  formatDice,
  formatDiceTotal,
  formatDuration,
  formatDurationRounds,
  formatFeet,
  formatGameClock,
  formatInteger,
  healingServiceLabel,
  itemTypeLabel,
  joinList,
  languageLabel,
  ordinal,
  pluralize,
  saveLabel,
  sessionModeDescription,
  sessionModeLabel,
  signed,
  stanceLabel,
  timeUnitLabel,
  toRounds,
  withArticle,
  CONDITION_VALUES,
  SESSION_MODE_VALUES,
} from './index';

describe('number and list formatters', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [101, '101st'],
    [111, '111th'],
  ])('ordinal(%i)', (n, expected) => {
    expect(ordinal(n)).toBe(expected);
  });

  it('joins lists with and', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b, and c');
    expect(joinList(['a', 'b', 'c'], 'or')).toBe('a, b, or c');
  });

  it('pluralizes regular and irregular nouns', () => {
    expect(pluralize('torch')).toBe('torches');
    expect(pluralize('goblin')).toBe('goblins');
    expect(pluralize('wolf')).toBe('wolves');
    expect(pluralize('thief')).toBe('thieves');
    expect(pluralize('dwarf')).toBe('dwarves');
    expect(pluralize('ghoul')).toBe('ghouls');
    expect(pluralize('flask of oil')).toBe('flasks of oil');
    expect(pluralize('berry')).toBe('berries');
    expect(pluralize('key')).toBe('keys');
    expect(count(1, 'torch')).toBe('1 torch');
    expect(count(3, 'torch')).toBe('3 torches');
    expect(count(2, 'Hit Die', 'Hit Dice')).toBe('2 Hit Dice');
    expect(count(1500, 'point')).toBe('1,500 points');
  });

  it('chooses a or an', () => {
    expect(withArticle('goblin')).toBe('a goblin');
    expect(withArticle('orc')).toBe('an orc');
    expect(withArticle('unicorn')).toBe('a unicorn');
    expect(withArticle('owl bear')).toBe('an owl bear');
  });

  it('signs modifiers', () => {
    expect(signed(2)).toBe('+2');
    expect(signed(0)).toBe('+0');
    expect(signed(-1)).toBe('-1');
  });

  it('formats distances, dice, and coins', () => {
    expect(formatFeet(20)).toBe('20 feet');
    expect(formatFeet(1)).toBe('1 foot');
    expect(formatFeet(30, 'short')).toBe("30'");
    expect(formatDice(' 2D6 + 1 ')).toBe('2d6+1');
    expect(formatDice('2d6+1x10')).toBe('2d6+1x10');
    expect(formatDiceTotal('2d6+1', [4, 5], 10)).toBe('2d6+1: 4 + 5, +1 = 10');
    expect(formatCoins({ gp: 25, sp: 10, cp: 50 })).toBe('25 gp, 10 sp, 50 cp');
    expect(formatCoins({ pp: 1, gp: 1 }, 'long')).toBe('1 platinum piece, 1 gold piece');
    expect(formatCoins({})).toBe('0 gp');
    expect(formatInteger(17820)).toBe('17,820');
  });
});

describe('game time', () => {
  const clock = codes.clock;

  it('uses the constants that osrlib uses', () => {
    expect(clock.seconds_per_round).toBe(10);
    expect(clock.rounds_per_turn).toBe(60);
    expect(clock.turns_per_day).toBe(144);
    expect(clock.rounds_per_day).toBe(8640);
  });

  it('counts whole turns and days as osrlib does', () => {
    for (const sample of clock.samples) {
      expect(clockTurns(sample.rounds), `${sample.rounds} rounds`).toBe(sample.turns);
      expect(clockDays(sample.rounds), `${sample.rounds} rounds`).toBe(sample.days);
    }
  });

  it('converts game time units to rounds as osrlib does', () => {
    for (const step of clock.advance) {
      expect(
        toRounds(step.amount, step.unit as 'round' | 'turn' | 'day'),
        `${step.amount} ${step.unit}`,
      ).toBe(step.rounds);
    }
  });

  it.each([
    [0, 'Day 1, 00:00'],
    [1, 'Day 1, 00:00'],
    [6, 'Day 1, 00:01'],
    [60, 'Day 1, 00:10'],
    [360, 'Day 1, 01:00'],
    [8639, 'Day 1, 23:59'],
    [8640, 'Day 2, 00:00'],
    [8640 + 3840, 'Day 2, 10:40'],
    [17820, 'Day 3, 01:30'],
  ])('formats %i rounds as %s', (rounds, expected) => {
    expect(formatGameClock(rounds)).toBe(expected);
  });

  it('can show seconds and shift the dial', () => {
    expect(formatGameClock(8640 + 3841, { seconds: true })).toBe('Day 2, 10:40:10');
    expect(formatGameClock(0, { startHour: 6 })).toBe('Day 1, 06:00');
    expect(formatGameClock(8640 - 360, { startHour: 6 })).toBe('Day 2, 05:00');
  });

  it.each([
    [1, 'round', '1 round (10 seconds)'],
    [5, 'round', '5 rounds (50 seconds)'],
    [6, 'round', '6 rounds (1 minute)'],
    [1, 'turn', '1 turn (10 minutes)'],
    [3, 'turn', '3 turns (30 minutes)'],
    [6, 'turn', '6 turns (1 hour)'],
    [7, 'turn', '7 turns (1 hour 10 minutes)'],
    [48, 'turn', '48 turns (8 hours)'],
    [1, 'day', '1 day'],
    [2, 'day', '2 days'],
  ] as const)('formats %i %s as %s', (amount, unit, expected) => {
    expect(formatDuration(amount, unit)).toBe(expected);
  });

  it('formats a duration in rounds with the largest units that fit', () => {
    expect(formatDurationRounds(61)).toBe('1 turn and 1 round (10 minutes 10 seconds)');
    expect(formatDurationRounds(8640)).toBe('1 day');
    expect(formatDurationRounds(8640 + 60)).toBe('1 day and 1 turn');
    expect(formatDurationRounds(0)).toBe('0 rounds (0 seconds)');
  });
});

describe('labels', () => {
  it('labels session modes in sentence case, each with a description', () => {
    expect(sessionModeLabel('game_over')).toBe('Game over');
    expect(sessionModeLabel('exploring')).toBe('Exploring');
    for (const mode of SESSION_MODE_VALUES) expect(sessionModeDescription(mode)).toMatch(/\.$/);
    expect(sessionModeLabel('hyper_mode')).toBe('Hyper mode');
  });

  it('labels every condition', () => {
    expect(conditionLabel('lycanthropy_incubation')).toBe('Lycanthropy incubating');
    expect(conditionGained('petrified')).toBe('is turned to stone');
    for (const condition of CONDITION_VALUES) {
      expect(conditionLabel(condition)).toMatch(/^[A-Z]/);
      expect(conditionLabel(condition)).not.toContain('_');
    }
  });

  it('names abilities, saves, alignments, classes, languages, coins, and item types', () => {
    expect(abilityLabel('str')).toBe('Strength');
    expect(abilityLabel('cha', 'short')).toBe('CHA');
    expect(saveLabel('breath')).toBe('Dragon breath');
    expect(saveLabel('paralysis', 'short')).toBe('Paralysis');
    expect(alignmentLabel('chaotic')).toBe('Chaotic');
    expect(classLabel('magic_user')).toBe('Magic-User');
    expect(classLabel('elf')).toBe('Elf');
    expect(languageLabel('doppelganger')).toBe('Doppelgänger');
    expect(languageLabel('alignment_lawful')).toBe('Lawful alignment tongue');
    expect(coinLabel('gp')).toBe('Gold pieces');
    expect(itemTypeLabel('magic_item')).toBe('Magic item');
    expect(healingServiceLabel('raise_dead')).toBe('Raise dead');
  });

  it('names doors, bearings, actions, moves, directions, facings, and time units', () => {
    expect(doorStateLabel('stuck')).toBe('Stuck');
    expect(doorStateFromEdge({ kind: 'door', door_open: false, door_wedged: false })).toBe('closed');
    expect(doorStateFromEdge({ kind: 'door', door_open: true, door_wedged: true })).toBe('wedged');
    expect(doorStateFromEdge({ kind: 'wall' })).toBe('wall');
    expect(stanceLabel('indifferent')).toBe('Indifferent');
    expect(battleActionLabel('turn_undead')).toBe('Turn undead');
    expect(battleActionLabel('give_item')).toBe('Give an item');
    expect(battleMoveLabel('fighting_withdrawal')).toBe('Fighting withdrawal');
    expect(directionLabel('south')).toBe('South');
    expect(facingLabel('west')).toBe('facing west');
    expect(timeUnitLabel('turn')).toBe('Turns (10 minutes)');
  });
});
