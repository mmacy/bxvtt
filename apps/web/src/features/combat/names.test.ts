import { describe, expect, it } from 'vitest';
import { countBadge, countedGroup, groupHeading, theGroup } from './names';
import { targetLabel } from './text';

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

describe('target labels', () => {
  const target = (handle: string, label: string, group: string) => ({
    handle,
    group_id: group,
    label,
    number: Number(label.split(' ').at(-1)),
    defeated: false,
    fled: false,
  });

  it('drop the number of a named individual who is the only one of that name', () => {
    const targets = [
      target('tgt_aaaaaaaaaaaaaaaa', 'Mag Corrie 1', 'group-0001'),
      target('tgt_bbbbbbbbbbbbbbbb', 'Goblin 1', 'group-0002'),
    ];
    expect(targetLabel(targets[0]!, targets, 'Mag Corrie')).toBe('Mag Corrie');
    expect(targetLabel(targets[1]!, targets, 'goblin')).toBe('Goblin 1');
  });
});
