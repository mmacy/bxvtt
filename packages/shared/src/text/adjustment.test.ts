import { describe, expect, it } from 'vitest';
import { describeRejection, rejectionTemplateKey } from './rejections';
import type { ParamMap } from './template';

// The params come from bxapi's answers: `adjustment_limits` for the contract's fighter (STR 16, INT 13, WIS 12,
// seed 515), a fighter with STR 18 (seed 191), a fighter with no score to lower (seed 7), and a thief with STR 16,
// INT 15, WIS 7, DEX 6 (seed 12103), plus the merged params that the wizard adds. Refusals use the params of a 422.
const cases: Array<[row: string, code: string, params: ParamMap, text: string]> = [
  ['60-02', 'creation.adjustment.not_lowerable', { ability: 'dex' }, "Dexterity can't be lowered."],
  [
    '60-03',
    'creation.adjustment.prime_requisite_lowered',
    { ability: 'str' },
    "Strength is a prime requisite, so it can't be lowered.",
  ],
  [
    '60-04',
    'creation.adjustment.class_restriction',
    { ability: 'str', class: 'thief' },
    "Thieves can't lower Strength.",
  ],
  ['60-05', 'creation.adjustment.class_restriction', { ability: 'str' }, "Your class can't lower Strength."],
  [
    '60-06',
    'creation.adjustment.below_floor',
    { ability: 'int', score: 13, amount: 6, lowest: 9 },
    "Intelligence can't go below 9 in a trade.",
  ],
  [
    '60-07',
    'creation.adjustment.below_floor',
    { ability: 'int', score: 13, amount: 6 },
    'Lowering Intelligence by 6 takes it below the lowest score a trade allows.',
  ],
  [
    '60-08',
    'creation.adjustment.above_cap',
    { ability: 'str', score: 16, amount: 3, highest: 18 },
    "Strength can't go above 18 in a trade.",
  ],
  [
    '60-09',
    'creation.adjustment.above_cap',
    { ability: 'str', score: 16, amount: 3 },
    'Raising Strength by 3 takes it above the highest score a trade allows.',
  ],
  [
    '60-10',
    'creation.adjustment.raise_not_prime_requisite',
    { ability: 'int' },
    "Intelligence isn't a prime requisite, so it can't be raised.",
  ],
  [
    '60-11',
    'creation.adjustment.no_room_to_raise',
    { max_points: 0, prime: 'str' },
    'Strength is already as high as a trade can take it.',
  ],
  [
    '60-11a',
    'creation.adjustment.no_room_to_raise',
    { max_points: 0 },
    'Your prime requisites are already as high as a trade can take them.',
  ],
  [
    '60-11b',
    'creation.adjustment.no_room_to_raise',
    { max_points: 2, prime: 'str' },
    'Strength can rise only 2 points in a trade.',
  ],
  [
    '60-11c',
    'creation.adjustment.no_room_to_raise',
    { max_points: 1 },
    'Your prime requisites can rise only 1 point between them in a trade.',
  ],
  [
    '60-12',
    'creation.adjustment.no_room_to_lower',
    { max_points: 0, prime: 'str' },
    'None of your scores can go lower in a trade.',
  ],
  [
    '60-12a',
    'creation.adjustment.no_room_to_lower',
    { max_points: 3, prime: 'dex' },
    'Lowering your other scores buys only 3 points.',
  ],
  [
    '60-14',
    'creation.adjustment.reduction_not_even',
    { ability: 'int', amount: 1 },
    "You can't lower Intelligence by 1. Lower it by an even amount.",
  ],
  [
    '60-15',
    'creation.adjustment.points_mismatch',
    { points_available: 1, points_spent: 2 },
    'You gained 1 point from lowering scores, but spent 2.',
  ],
];

// The same codes without the number a template would show, which bxapi always sends today.
const fallbacks: Array<[code: string, params: ParamMap, text: string]> = [
  [
    'creation.adjustment.below_floor',
    { ability: 'int' },
    'Lowering Intelligence takes it below the lowest score a trade allows.',
  ],
  [
    'creation.adjustment.above_cap',
    { ability: 'str' },
    'Raising Strength takes it above the highest score a trade allows.',
  ],
  [
    'creation.adjustment.reduction_not_even',
    { ability: 'int' },
    "You can't lower Intelligence by that amount. Lower it by an even amount.",
  ],
  ['creation.adjustment.no_room_to_raise', { prime: 'str' }, "Strength can't rise any further in a trade."],
  ['creation.adjustment.no_room_to_raise', {}, "Your prime requisites can't rise any further in a trade."],
  ['creation.adjustment.no_room_to_lower', {}, "Lowering your other scores can't buy any more points."],
];

describe('ability trade reasons and refusals', () => {
  it.each(cases)('%s %s', (_row, code, params, text) => {
    expect(describeRejection({ code, params })).toBe(text);
  });

  it.each(fallbacks)('writes %s with no number when the number is missing', (code, params, text) => {
    expect(describeRejection({ code, params })).toBe(text);
  });

  it('picks the key of a points code by whether the trade can buy any points', () => {
    const code = 'creation.adjustment.no_room_to_raise';
    expect(rejectionTemplateKey({ code, params: { max_points: 0 } })).toBe(`${code}.none`);
    expect(rejectionTemplateKey({ code, params: { max_points: 2 } })).toBe(`${code}.some`);
    expect(rejectionTemplateKey({ code: 'creation.adjustment.below_floor', params: {} })).toBe(
      'creation.adjustment.below_floor',
    );
  });

  it('writes no number that bxapi owns', () => {
    for (const [, code, params] of cases) {
      const text = describeRejection({ code, params });
      const numbers = text.match(/\d+/g) ?? [];
      const given = Object.values(params).map(String);
      for (const n of numbers) expect(given, `${code}: ${text}`).toContain(n);
    }
  });
});
