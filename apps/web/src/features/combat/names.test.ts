import { describe, expect, it } from 'vitest';
import { countBadge, countedGroup, groupHeading, theGroup } from './names';

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
