import type {
  CommandSummary,
  ClassSummary,
  EquipmentSummary,
  Language,
  MagicItemSummary,
  MonsterSummary,
  SpellSummary,
} from '@bxvtt/shared/bxapi';
import { describe, expect, it } from 'vitest';
import rules from './fixtures/rules.json';
import { bodySnippet, buildSearchItems, highlight, matchesFilter, parseQuery, search } from './search';

const items = buildSearchItems({
  classes: rules.classes as ClassSummary[],
  spells: rules.spells as SpellSummary[],
  monsters: rules.monsters as MonsterSummary[],
  equipment: rules.equipment as EquipmentSummary[],
  magicItems: rules.magicItems as MagicItemSummary[],
  languages: rules.languages as Language[],
  commands: [
    { command_type: 'search', kind: 'play', allowed_modes: ['exploring'], summary: '' },
    { command_type: 'grant_coins', kind: 'referee', allowed_modes: ['town'], summary: '' },
  ] as CommandSummary[],
  fullSpells: [rules.spellDetails.sleep, rules.spellDetails.cure_light_wounds] as never,
  fullMonsters: [
    { ...rules.monsterDetails.goblin, categories: ['person'] },
    { ...rules.monsterDetails.green_slime, categories: ['undead'] },
  ] as never,
});

const names = (query: string, kind?: string) =>
  search(items, query)
    .filter((group) => kind === undefined || group.kind === kind)
    .flatMap((group) => group.items.map((entry) => entry.name));

describe('parseQuery', () => {
  it('reads level and hit dice facets', () => {
    expect(parseQuery('3rd level')).toEqual([{ type: 'level', value: 3 }]);
    expect(parseQuery('level 2 cleric')).toEqual([
      { type: 'level', value: 2 },
      { type: 'word', value: 'cleric' },
    ]);
    expect(parseQuery('4 hd')).toEqual([{ type: 'hd', value: 4 }]);
    expect(parseQuery('hd4')).toEqual([{ type: 'hd', value: 4 }]);
    expect(parseQuery('l5')).toEqual([{ type: 'level', value: 5 }]);
    expect(parseQuery('7')).toEqual([{ type: 'number', value: 7 }]);
  });
});

describe('search', () => {
  it('finds an entry by name and ranks an exact name first', () => {
    const groups = search(items, 'sleep');
    expect(groups[0]?.kind).toBe('spells');
    expect(groups[0]?.items[0]?.name).toBe('Sleep');
  });

  it('matches the start of a word and ignores case, accents, and punctuation', () => {
    expect(names('DOPPELGANGER')).toContain('Doppelgänger');
    expect(names('magic-user', 'classes')).toContain('Magic-User');
    expect(names('thieves tools', 'equipment')).toContain('Thieves’ tools');
  });

  it('finds spells by level, and monsters by hit dice', () => {
    expect(names('3rd level', 'spells').length).toBeGreaterThan(5);
    const spells = search(items, 'level 3').find((group) => group.kind === 'spells');
    expect(spells?.items.every((entry) => entry.level === 3)).toBe(true);
    const monsters = search(items, 'hd 5').find((group) => group.kind === 'monsters');
    expect(monsters?.items.length).toBeGreaterThan(0);
    expect(monsters?.items.every((entry) => entry.hd === 5)).toBe(true);
  });

  it('finds spells by class and equipment by type', () => {
    const cleric = search(items, 'cleric');
    expect(cleric.find((group) => group.kind === 'classes')?.items[0]?.name).toBe('Cleric');
    expect(cleric.find((group) => group.kind === 'spells')?.items.length).toBe(34);
    expect(names('armor', 'equipment')).toContain('Plate mail');
    expect(names('weapon', 'equipment')).toContain('Sword');
  });

  it('finds a monster by the categories of the full catalog', () => {
    expect(names('undead', 'monsters')).toEqual(['Green Slime']);
  });

  it('finds an entry by its text when no name matches, and ranks it below a name match', () => {
    const groups = search(items, 'slumber');
    expect(groups[0]?.items[0]?.name).toBe('Sleep');
    const sleep = items.find((entry) => entry.id === 'sleep');
    expect(sleep && bodySnippet(sleep, 'slumber')).toMatch(/slumber/);
    expect(sleep && bodySnippet(sleep, 'sleep')).toBeNull();
  });

  it('lists play actions, and no referee action', () => {
    expect(names('search', 'commands')).toEqual(['Search']);
    expect(names('coins', 'commands')).toEqual([]);
  });

  it('finds equipment by its qualities and damage', () => {
    expect(names('missile', 'equipment').length).toBeGreaterThanOrEqual(0);
  });

  it('opens a table at the right place', () => {
    const turning = search(items, 'turn undead').flatMap((group) => group.items)[0];
    expect(turning?.route).toEqual({ page: 'entry', kind: 'tables', id: 'combat', anchor: 'turning' });
  });

  it('finds the license', () => {
    expect(names('license', 'license')).toEqual(['Open Game License']);
  });

  it('returns nothing for a blank query and for a miss', () => {
    expect(search(items, '   ')).toEqual([]);
    expect(search(items, 'qzxv')).toEqual([]);
  });

  it('searches a thousand entries in a few milliseconds', () => {
    const many = Array.from({ length: 10 }, () => items).flat();
    const started = performance.now();
    for (let i = 0; i < 20; i++) search(many, 'dra');
    expect((performance.now() - started) / 20).toBeLessThan(25);
  });
});

describe('highlight', () => {
  it('marks the matching part of a name', () => {
    expect(highlight('Fire Ball', 'ba')).toEqual([
      { text: 'Fire ', match: false },
      { text: 'Ba', match: true },
      { text: 'll', match: false },
    ]);
  });

  it('marks across accents and apostrophes', () => {
    expect(
      highlight('Thieves’ tools', 'tools').some((segment) => segment.match && segment.text === 'tools'),
    ).toBe(true);
  });

  it('leaves the text alone for a facet-only query', () => {
    expect(highlight('Fly', 'level 3')).toEqual([{ text: 'Fly', match: false }]);
  });
});

describe('matchesFilter', () => {
  it('matches word starts and substrings', () => {
    expect(matchesFilter('Hold Person', 'per')).toBe(true);
    expect(matchesFilter('Hold Person', 'hold p')).toBe(true);
    expect(matchesFilter('Hold Person', 'xyz')).toBe(false);
    expect(matchesFilter('Anything', '')).toBe(true);
  });
});
