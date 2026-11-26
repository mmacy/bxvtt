import { describe, expect, it } from 'vitest';
import { emptyContext } from './context';
import { describeRejection } from './rejections';

const ctx = {
  ...emptyContext(),
  members: { 'character-0001': { name: 'Wren' } },
  items: { 'magic-item-0001': 'staff of healing' },
};

describe('a param that bxapi or the server sends as null', () => {
  it('reads as missing, so each rejection takes its wording without that param', () => {
    expect(
      describeRejection(
        {
          code: 'combat.attack.out_of_reach',
          params: { character: 'character-0001', target: null, distance_feet: 30 },
        },
        ctx,
      ),
    ).toBe(
      'Wren is 30 feet from the target, too far for a melee attack. Close in first, or use a missile weapon or a spell.',
    );
    expect(
      describeRejection(
        {
          code: 'battle.declaration.invisible_target',
          params: { character: 'character-0001', target: null },
        },
        ctx,
      ),
    ).toBe("That target is invisible, so Wren can't target it. Choose another target.");
    expect(
      describeRejection(
        { code: 'items.use.target_healed_today', params: { item: 'magic-item-0001', target: null } },
        ctx,
      ),
    ).toBe('A staff of healing has already healed them today. Choose someone else.');
  });

  it('still names a target that is there', () => {
    expect(
      describeRejection(
        {
          code: 'items.use.target_healed_today',
          params: { item: 'magic-item-0001', target: 'character-0001' },
        },
        ctx,
      ),
    ).toMatch(/has already healed Wren today/);
  });
});
