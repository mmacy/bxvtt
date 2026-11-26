import { describe, expect, it } from 'vitest';
import type { CreatureGroupLike } from './creatures';
import { creatureNames } from './creatures';

function group(
  id: string,
  label: string,
  members: [string, 'alive' | 'defeated' | 'fled'][],
): CreatureGroupLike {
  return { id, label, members: members.map(([memberId, status]) => ({ id: memberId, status })) };
}

const names = (groups: CreatureGroupLike[]) => creatureNames(groups).map((creature) => creature.name);

describe('creature names', () => {
  it('numbers the creatures of a label and keeps each number when a group splits', () => {
    expect(
      names([
        group('group-0001', 'goblin', [
          ['monster-0001', 'alive'],
          ['monster-0002', 'alive'],
        ]),
      ]),
    ).toEqual(['Goblin 1', 'Goblin 2']);
    // monster-0002 splits off and runs with a newcomer, and monster-0001 falls.
    const split = creatureNames([
      group('group-0001', 'goblin', [['monster-0001', 'defeated']]),
      group('group-0002', 'goblin', [
        ['monster-0003', 'fled'],
        ['monster-0002', 'fled'],
      ]),
    ]);
    expect(split).toEqual([
      { id: 'monster-0001', group_id: 'group-0001', status: 'defeated', name: 'Goblin 1' },
      { id: 'monster-0003', group_id: 'group-0002', status: 'fled', name: 'Goblin 3' },
      { id: 'monster-0002', group_id: 'group-0002', status: 'fled', name: 'Goblin 2' },
    ]);
  });

  it('names a lone creature by its label, and numbers it once another of its label joins', () => {
    const alone = [
      group('group-0001', 'Mag Corrie', [['npc-0001', 'alive']]),
      group('group-0002', 'ogre', [['monster-0002', 'alive']]),
    ];
    expect(names(alone)).toEqual(['Mag Corrie', 'Ogre']);
    expect(names([...alone, group('group-0003', 'ogre', [['monster-0010', 'alive']])])).toEqual([
      'Mag Corrie',
      'Ogre 1',
      'Ogre 2',
    ]);
  });

  it('counts IDs by number, not as text', () => {
    expect(
      names([
        group('group-0001', 'rat', [
          ['monster-0010', 'alive'],
          ['monster-0009', 'alive'],
        ]),
      ]),
    ).toEqual(['Rat 2', 'Rat 1']);
  });

  it('names nobody outside an encounter', () => {
    expect(creatureNames(undefined)).toEqual([]);
  });
});
