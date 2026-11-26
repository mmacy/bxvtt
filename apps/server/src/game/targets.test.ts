import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@bxvtt/shared/protocol';
import { unlistedTarget, withoutUnlistedCreatures } from './targets';

/** A player view with one party member and one goblin group that lists monster-0001 and monster-0002. */
const view = {
  party: [{ id: 'character-0001' }],
  encounter: {
    groups: [
      {
        id: 'group-0001',
        label: 'goblin',
        members: [
          { id: 'monster-0001', status: 'alive' },
          { id: 'monster-0002', status: 'defeated' },
        ],
      },
    ],
  },
} as unknown as PlayerView;

/** The session's creatures from the referee view: the goblins, and a monster from an encounter that ended. */
const known = new Set(['monster-0001', 'monster-0002', 'monster-0003']);
const fields = ['targets', 'target_id'];

describe('player targets', () => {
  it('accepts party members, cells, groups, and every creature the view lists', () => {
    const command = {
      command_type: 'use_item',
      target_id: 'group-0001',
      targets: ['monster-0001', 'monster-0002', 'character-0001', 'cell:barrow:1:2,3'],
    };
    expect(unlistedTarget(command, fields, view, known)).toBeNull();
  });

  it('finds a creature the view does not list, whether it exists or not', () => {
    expect(unlistedTarget({ targets: ['monster-0001', 'monster-0003'] }, fields, view, known)).toEqual({
      field: 'targets',
      id: 'monster-0003',
    });
    expect(unlistedTarget({ target_id: 'monster-0099' }, fields, view, known)).toEqual({
      field: 'target_id',
      id: 'monster-0099',
    });
  });

  it('finds nothing outside an encounter but the party', () => {
    const town = { party: [{ id: 'character-0001' }], encounter: null } as unknown as PlayerView;
    expect(unlistedTarget({ targets: ['character-0001'] }, fields, town, known)).toBeNull();
    expect(unlistedTarget({ targets: ['monster-0001'] }, fields, town, known)?.id).toBe('monster-0001');
  });

  it('drops unlisted creatures from what a player receives, and keeps listed ones', () => {
    const declaration = {
      action: 'cast',
      spell_id: 'sleep',
      targets: ['monster-0001', 'monster-0003'],
      note: { target: 'monster-0003' },
    };
    expect(withoutUnlistedCreatures(declaration, view, known)).toEqual({
      action: 'cast',
      spell_id: 'sleep',
      targets: ['monster-0001'],
      note: { target: null },
    });
    expect(declaration.targets).toEqual(['monster-0001', 'monster-0003']);
  });
});
