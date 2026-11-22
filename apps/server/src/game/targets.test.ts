import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RefereeView } from '@bxvtt/shared/bxapi';
import type { PlayerView } from '@bxvtt/shared/protocol';
import { Database } from '../db';
import { ApiError } from '../errors';
import { resolveHandles, syncTargets, toHandles, withoutMonsterIds } from './targets';

/** One group as the player view and the referee view show it. */
interface GroupFixture {
  id: string;
  label: string;
  monsterIds: string[];
  fled?: boolean;
}

/** Builds the parts of the two views that target handles read. */
function views(
  groups: GroupFixture[],
  conditions: Record<string, string[]> = {},
): { view: PlayerView; referee: Pick<RefereeView, 'encounter' | 'monsters'> } {
  const view = {
    encounter: { groups: groups.map((group) => ({ id: group.id, fled: group.fled === true })) },
  } as unknown as PlayerView;
  const referee = {
    encounter: {
      started_round: 40,
      groups: groups.map((group) => ({ id: group.id, label: group.label, monster_ids: group.monsterIds })),
    },
    monsters: groups
      .flatMap((group) => group.monsterIds)
      .map((id) => ({ id, conditions: (conditions[id] ?? []).map((condition) => ({ condition })) })),
  } as unknown as Pick<RefereeView, 'encounter' | 'monsters'>;
  return { view, referee };
}

describe('target handles', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.run(
      `INSERT INTO users (id, name, color, token_hash, created_at)
       VALUES ('usr_1', 'Rhea', '#e69f00', 'hash', '2026-01-01T00:00:00Z')`,
    );
    db.run(
      `INSERT INTO tables (id, name, invite_code, party_control, auto_resolve, autosave, created_by, created_at)
       VALUES ('tbl_1', 'T', 'code', 'caller', 1, 1, 'usr_1', '2026-01-01T00:00:00Z')`,
    );
  });

  afterEach(() => {
    db.close();
  });

  it('numbers the monsters of a label and keeps each handle when a monster changes group', () => {
    const first = views([
      { id: 'group-0001', label: 'goblin', monsterIds: ['monster-0001', 'monster-0002'] },
    ]);
    const book = syncTargets(db, 'tbl_1', 'ses_1', first.view, first.referee);
    expect(book.targets.map((target) => target.label)).toEqual(['Goblin 1', 'Goblin 2']);
    const split = views([
      { id: 'group-0001', label: 'goblin', monsterIds: ['monster-0001'] },
      { id: 'group-0002', label: 'goblin', monsterIds: ['monster-0002', 'monster-0003'], fled: true },
    ]);
    const later = syncTargets(db, 'tbl_1', 'ses_1', split.view, split.referee);
    expect(later.targets).toEqual([
      expect.objectContaining({ handle: book.targets[0]?.handle, label: 'Goblin 1', group_id: 'group-0001' }),
      expect.objectContaining({ handle: book.targets[1]?.handle, label: 'Goblin 2', group_id: 'group-0002' }),
      expect.objectContaining({ label: 'Goblin 3', group_id: 'group-0002', fled: true }),
    ]);
  });

  it('gives an invisible monster no handle until it shows itself, and keeps a slain one', () => {
    const hidden = views([{ id: 'group-0001', label: 'orc', monsterIds: ['monster-0001', 'monster-0002'] }], {
      'monster-0001': ['invisible'],
    });
    const book = syncTargets(db, 'tbl_1', 'ses_1', hidden.view, hidden.referee);
    // Alone with its label, the orc reads without a number.
    expect(book.targets.map((target) => target.label)).toEqual(['Orc']);
    const shown = views([{ id: 'group-0001', label: 'orc', monsterIds: ['monster-0001', 'monster-0002'] }], {
      'monster-0002': ['dead'],
    });
    const later = syncTargets(db, 'tbl_1', 'ses_1', shown.view, shown.referee);
    expect(later.targets.map((target) => [target.label, target.defeated])).toEqual([
      ['Orc 2', false],
      ['Orc 1', true],
    ]);
  });

  it('swaps handles for monster IDs in target fields, and refuses an unknown handle', () => {
    const fixture = views([{ id: 'group-0001', label: 'goblin', monsterIds: ['monster-0007'] }]);
    const book = syncTargets(db, 'tbl_1', 'ses_1', fixture.view, fixture.referee);
    const handle = book.targets[0]?.handle ?? '';
    const command = {
      command_type: 'use_item',
      target_id: handle,
      targets: [handle, 'character-0001', 'cell:barrow:1:2,3'],
    };
    expect(resolveHandles(command, ['targets', 'target_id'], book, 'command')).toEqual({
      command_type: 'use_item',
      target_id: 'monster-0007',
      targets: ['monster-0007', 'character-0001', 'cell:barrow:1:2,3'],
    });
    expect(command.target_id).toBe(handle);
    try {
      resolveHandles({ targets: ['tgt_AAAAAAAAAAAAAAAA'] }, ['targets'], book, 'declaration');
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('target_unknown');
      expect((error as ApiError).extras).toEqual({
        field: 'declaration.targets',
        id: 'tgt_AAAAAAAAAAAAAAAA',
      });
    }
  });

  it('names monsters by handle in what a player receives, and drops a monster that has none', () => {
    const fixture = views(
      [{ id: 'group-0001', label: 'goblin', monsterIds: ['monster-0001', 'monster-0002'] }],
      {
        'monster-0002': ['invisible'],
      },
    );
    const book = syncTargets(db, 'tbl_1', 'ses_1', fixture.view, fixture.referee);
    const handle = book.targets[0]?.handle;
    expect(
      toHandles({ code: 'combat.attack.out_of_reach', params: { target: 'monster-0001' } }, book),
    ).toEqual({
      code: 'combat.attack.out_of_reach',
      params: { target: handle },
    });
    expect(withoutMonsterIds({ targets: ['monster-0001', 'monster-0002'], spell_id: 'sleep' }, book)).toEqual(
      {
        targets: [handle],
        spell_id: 'sleep',
      },
    );
  });

  it('names a lone monster without a number, and numbers it once another of its label joins', () => {
    const alone = views([
      { id: 'group-0001', label: 'Mag Corrie', monsterIds: ['monster-0001'] },
      { id: 'group-0002', label: 'ogre', monsterIds: ['monster-0002'] },
    ]);
    const book = syncTargets(db, 'tbl_1', 'ses_1', alone.view, alone.referee);
    expect(book.targets.map((target) => [target.label, target.number])).toEqual([
      ['Mag Corrie', 1],
      ['Ogre', 1],
    ]);
    // A referee spawns a second ogre into the encounter.
    const grown = views([
      { id: 'group-0001', label: 'Mag Corrie', monsterIds: ['monster-0001'] },
      { id: 'group-0002', label: 'ogre', monsterIds: ['monster-0002'] },
      { id: 'group-0003', label: 'ogre', monsterIds: ['monster-0003'] },
    ]);
    const later = syncTargets(db, 'tbl_1', 'ses_1', grown.view, grown.referee);
    expect(later.targets.map((target) => target.label)).toEqual(['Mag Corrie', 'Ogre 1', 'Ogre 2']);
    expect(later.targets[1]?.handle).toBe(book.targets[1]?.handle);
  });
});
