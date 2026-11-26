import { describe, expect, it } from 'vitest';
import { attributeRefusals, previewRefusals } from './refusals';

const declarers = ['character-0001', 'character-0002', 'character-0003'];

describe('attributing refusals', () => {
  it("names each rejection's member from params.character", () => {
    expect(
      attributeRefusals(
        [
          {
            code: 'combat.attack.out_of_reach',
            params: { character: 'character-0001', group: 'group-0001' },
          },
          { code: 'magic.cast.target_count', params: { character: 'character-0002', expected: 1 } },
        ],
        declarers,
      ),
    ).toEqual([
      {
        member_id: 'character-0001',
        code: 'combat.attack.out_of_reach',
        params: { character: 'character-0001', group: 'group-0001' },
      },
      {
        member_id: 'character-0002',
        code: 'magic.cast.target_count',
        params: { character: 'character-0002', expected: 1 },
      },
    ]);
  });

  it('names nobody for a rejection of the round as a whole, or one that names a non-declarer', () => {
    expect(
      attributeRefusals(
        [
          { code: 'battle.declaration.roster_mismatch' },
          { code: 'x', params: { character: 'character-0009' } },
        ],
        declarers,
      ).map((refusal) => refusal.member_id),
    ).toEqual([null, null]);
  });
});

describe('preview refusals', () => {
  it('lists the rejections of each declaration in marching order', () => {
    expect(
      previewRefusals(
        {
          'character-0003': [
            { code: 'battle.declaration.hide_in_front_rank', params: { character: 'character-0003' } },
          ],
          'character-0001': [],
          'character-0002': [{ code: 'magic.cast.target_count', params: { character: 'character-0002' } }],
        },
        declarers,
      ),
    ).toEqual([
      {
        member_id: 'character-0002',
        code: 'magic.cast.target_count',
        params: { character: 'character-0002' },
      },
      {
        member_id: 'character-0003',
        code: 'battle.declaration.hide_in_front_rank',
        params: { character: 'character-0003' },
      },
    ]);
  });
});
