import { describe, expect, it } from 'vitest';
import { emptyContext } from '@bxvtt/shared/text';
import { countBadge, countedGroup, groupHeading, theGroup } from './names';
import { encounterCreatures, withCreatureNames } from './text';

describe('group labels', () => {
  const goblins = { label: 'goblin', plural: 'goblins', count: 3 };
  const mag = { label: 'Mag Corrie', plural: 'Mag Corries', count: 1 };
  const clerk = { label: 'ink-stained clerk', plural: 'ink-stained clerks', count: 1 };

  it('write a named individual as a name', () => {
    expect(theGroup(mag)).toBe('Mag Corrie');
    expect(groupHeading(mag)).toBe('Mag Corrie');
    expect(countedGroup(mag)).toBe('Mag Corrie');
    expect(countBadge(mag)).toBeNull();
  });

  it('write other groups with an article, a count, and a plural', () => {
    expect(theGroup(goblins)).toBe('the goblins');
    expect(groupHeading(goblins)).toBe('Goblins');
    expect(countedGroup(goblins)).toBe('3 goblins');
    expect(countBadge(goblins)).toBe('×3');
    expect(theGroup(clerk)).toBe('the ink-stained clerk');
    expect(countedGroup(clerk)).toBe('an ink-stained clerk');
    expect(countBadge(clerk)).toBeNull();
  });
});

describe('creature names in the combat text', () => {
  const ctx = {
    ...emptyContext(),
    groups: { 'group-0001': { label: 'goblin', labelPlural: 'goblins' } },
    monsters: { 'npc-0001': { label: 'adventurer', name: 'Mag Corrie' } },
  };
  const creatures = encounterCreatures({
    groups: [
      {
        id: 'group-0001',
        label: 'goblin',
        members: [
          { id: 'monster-0001', status: 'alive' },
          { id: 'npc-0001', status: 'alive' },
        ],
      },
    ],
  });

  it('name each creature by its number, and keep a name the context already has', () => {
    const named = withCreatureNames(ctx, creatures);
    expect(named.monsters['monster-0001']).toEqual({
      label: 'goblin',
      labelPlural: 'goblins',
      name: 'Goblin 1',
    });
    expect(named.monsters['npc-0001']?.name).toBe('Mag Corrie');
  });
});
