import { describe, expect, it } from 'vitest';
import codes from './data/codes.json';
import { describeTradeGuidance, isTradeInProgress } from './rejections';

// The params are the ones bxapi returned for a fighter who rolled STR 15, INT 14 (see the wizard's component tests).
const NOT_EVEN = { code: 'creation.adjustment.reduction_not_even', params: { ability: 'int', amount: 1 } };

function mismatch(points_available: number, points_spent: number) {
  return { code: 'creation.adjustment.points_mismatch', params: { points_available, points_spent } };
}

describe('trade guidance', () => {
  it('lists the two codes that describe a trade in progress and no other', () => {
    const inProgress = Object.keys(codes.rejections).filter(isTradeInProgress);
    expect(inProgress.sort()).toEqual([
      'creation.adjustment.points_mismatch',
      'creation.adjustment.reduction_not_even',
    ]);
  });

  it('treats a code it does not know as a wrong choice', () => {
    expect(isTradeInProgress('creation.adjustment.something_new')).toBe(false);
    expect(isTradeInProgress('')).toBe(false);
  });

  it('names the score and the amount for an amount that is not even', () => {
    expect(describeTradeGuidance(NOT_EVEN)).toBe(
      "You've lowered Intelligence by 1. Lower a score by an even amount to gain points.",
    );
  });

  it('says what to do for each way the points can fall short of the trade', () => {
    expect(describeTradeGuidance(mismatch(1, 0))).toBe(
      "You've gained 1 point from lowering scores. Raise a prime requisite to finish the trade.",
    );
    expect(describeTradeGuidance(mismatch(2, 1))).toBe(
      "You've gained 2 points from lowering scores and spent 1. Raise a prime requisite to spend the rest.",
    );
    expect(describeTradeGuidance(mismatch(0, 1))).toBe(
      "You've spent 1 point without lowering a score to pay for the trade. Lower a score to gain points, or reset to your rolled scores.",
    );
    expect(describeTradeGuidance(mismatch(1, 3))).toBe(
      "You've gained 1 point from lowering scores, but you spent 3. Raise a prime requisite by less, or lower a score to gain more points.",
    );
  });

  it('falls back to the refusal for a code that is not in progress or lacks its params', () => {
    expect(
      describeTradeGuidance({ code: 'creation.adjustment.not_lowerable', params: { ability: 'dex' } }),
    ).toBe("Dexterity can't be lowered. Only Strength, Intelligence, and Wisdom can be traded for points.");
    expect(describeTradeGuidance({ code: 'creation.adjustment.points_mismatch', params: {} })).toMatch(
      /^You gained/,
    );
  });

  it('writes every sentence without a dash or a raw code', () => {
    const lines = [NOT_EVEN, mismatch(1, 0), mismatch(2, 1), mismatch(0, 1), mismatch(1, 3)].map((r) =>
      describeTradeGuidance(r),
    );
    for (const line of lines) {
      expect(line).not.toMatch(/[–—]/);
      expect(line).not.toMatch(/creation\.|\{|\}|undefined/);
    }
  });
});
