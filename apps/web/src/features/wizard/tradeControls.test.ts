/**
 * The control rules of the trade step, against limits that bxapi returned. Each case starts from the rolled
 * scores, clicks controls by their rules, and reads the controls and the status after the last click.
 */
import type { AbilityAdjustmentLimit } from '@bxvtt/shared/bxapi';
import type { AdjustmentLimits } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/adjustment-limits.json';
import type { Adjustment } from './draft';
import type { Ability, Scores } from './tables';
import {
  NO_POINT_REASON,
  tradeBalance,
  tradeContinueBlock,
  tradeContinueLabel,
  tradeControls,
  tradeLead,
  tradeStatus,
  tradeStatusLabel,
  fitTrade,
  tradeFits,
  tradeNeedsCheck,
  type LimitsState,
  type TradeInput,
} from './tradeControls';

type Name = Exclude<keyof typeof fixtures, '_about'>;
type Click = `${'lower' | 'raise'} ${Ability}`;

const PRIMES: Record<string, Ability[]> = {
  fighter: ['str'],
  thief: ['dex'],
  elf: ['int', 'str'],
  magic_user: ['int'],
};

function inputOf(name: Name, adjustment: Adjustment = { lowered: {}, raised: {} }): TradeInput {
  const fixture = fixtures[name];
  return {
    limits: fixture.limits as AdjustmentLimits,
    scores: fixture.scores as Scores,
    adjustment,
    classId: fixture.class_id,
    primes: PRIMES[fixture.class_id] ?? [],
  };
}

/** Clicks each control in turn, failing on a click at a disabled control. */
function play(name: Name, clicks: readonly Click[]): TradeInput {
  let input = inputOf(name);
  for (const click of clicks) {
    const [side, ability] = click.split(' ') as ['lower' | 'raise', Ability];
    const control = tradeControls(input)[ability][side];
    expect(control.enabled, `${click}: ${control.reason ?? ''}`).toBe(true);
    if (control.next === null) throw new Error(`${click} has no next trade`);
    input = { ...input, adjustment: control.next };
  }
  return input;
}

function reasonOf(input: TradeInput, click: Click): string | null {
  const [side, ability] = click.split(' ') as ['lower' | 'raise', Ability];
  const control = tradeControls(input)[ability][side];
  return control.enabled ? null : control.reason;
}

interface Case {
  label: string;
  fixture: Name;
  clicks: Click[];
  /** The controls that should be enabled after the clicks. */
  enabled?: Click[];
  /** The reason each listed control shows after the clicks. */
  reasons?: Partial<Record<Click, string>>;
  adjustment?: Adjustment;
}

const cases: Case[] = [
  {
    label: 'the contract fighter before a trade',
    fixture: 'fighter_515',
    clicks: [],
    enabled: ['lower int', 'lower wis'],
    reasons: {
      'raise str': NO_POINT_REASON,
      'lower str': "Strength is a prime requisite, so it can't be lowered.",
      'lower dex': "Dexterity can't be lowered.",
      'raise int': "Intelligence isn't a prime requisite, so it can't be raised.",
    },
  },
  {
    label: 'the contract fighter stops buying at max_points after two steps off Intelligence',
    fixture: 'fighter_515',
    clicks: ['lower int', 'lower int'],
    enabled: ['raise str', 'raise int'],
    reasons: {
      'lower wis': 'Strength can rise only 2 points in a trade.',
      'lower int': "Intelligence can't go below 9 in a trade.",
    },
    adjustment: { lowered: { int: 4 }, raised: {} },
  },
  {
    label: 'the contract fighter through a full trade',
    fixture: 'fighter_515',
    clicks: ['lower int', 'lower int', 'raise str', 'raise str'],
    enabled: ['lower str', 'raise int'],
    reasons: {
      'raise str': "Strength can't go above 18 in a trade.",
      'lower wis': 'Strength can rise only 2 points in a trade.',
      'raise wis': "Wisdom isn't a prime requisite, so it can't be raised.",
    },
    adjustment: { lowered: { int: 4 }, raised: { str: 2 } },
  },
  {
    label: 'a lowerable score one step above its lowest',
    fixture: 'fighter_515',
    clicks: ['lower wis'],
    enabled: ['lower int', 'raise wis', 'raise str'],
    reasons: { 'lower wis': "Wisdom can't go below 10 in a trade." },
    adjustment: { lowered: { wis: 2 }, raised: {} },
  },
  {
    label: 'a prime requisite at the cap (issue 54)',
    fixture: 'fighter_191',
    clicks: [],
    enabled: [],
    reasons: {
      'raise str': "Strength can't go above 18 in a trade.",
      'lower str': "Strength is a prime requisite, so it can't be lowered.",
      'lower int': 'Lowering Intelligence by 2 takes it below the lowest score a trade allows.',
    },
  },
  {
    label: 'no room to lower, with no points',
    fixture: 'fighter_7',
    clicks: [],
    enabled: [],
    reasons: {
      'raise str': 'None of your scores can go lower in a trade.',
      'lower int': 'Lowering Intelligence by 2 takes it below the lowest score a trade allows.',
      'lower wis': 'Lowering Wisdom by 2 takes it below the lowest score a trade allows.',
    },
  },
  {
    label: "the thief's class restriction and no room to lower with some points",
    fixture: 'thief_12103',
    clicks: ['lower int', 'lower int', 'lower int', 'raise dex', 'raise dex', 'raise dex'],
    enabled: ['lower dex', 'raise int'],
    reasons: {
      'raise dex': 'Lowering your other scores buys only 3 points.',
      'lower str': "Thieves can't lower Strength.",
      'lower int': "Intelligence can't go below 9 in a trade.",
      'lower wis': 'Lowering Wisdom by 2 takes it below the lowest score a trade allows.',
    },
    adjustment: { lowered: { int: 6 }, raised: { dex: 3 } },
  },
  {
    label: 'a class with two prime requisites shares the one point',
    fixture: 'elf_1832',
    clicks: ['lower wis', 'raise str'],
    enabled: ['lower str', 'raise wis'],
    reasons: {
      'raise int': 'Lowering your other scores buys only 1 point.',
      'raise str': 'Lowering your other scores buys only 1 point.',
      'lower wis': "Wisdom can't go below 9 in a trade.",
    },
    adjustment: { lowered: { wis: 2 }, raised: { str: 1 } },
  },
  {
    label: 'a lowered score stopped by the points its prime requisite can take',
    fixture: 'magic_user_1832',
    clicks: ['lower str', 'lower str'],
    reasons: { 'lower str': 'Intelligence can rise only 2 points in a trade.' },
    adjustment: { lowered: { str: 4 }, raised: {} },
  },
  {
    label: 'undo of a lowering gives back lower_step',
    fixture: 'fighter_515',
    clicks: ['lower int', 'raise int'],
    adjustment: { lowered: {}, raised: {} },
  },
  {
    label: 'undo of a raise takes back raise_step',
    fixture: 'fighter_515',
    clicks: ['lower int', 'raise str', 'lower str'],
    adjustment: { lowered: { int: 2 }, raised: {} },
  },
  {
    label: 'undo of a lowering whose point is spent leaves the trade a point short',
    fixture: 'fighter_515',
    clicks: ['lower int', 'raise str', 'raise int'],
    enabled: ['lower str', 'lower int', 'lower wis'],
    reasons: { 'raise str': NO_POINT_REASON },
    adjustment: { lowered: {}, raised: { str: 1 } },
  },
];

describe('trade controls', () => {
  it.each(cases)('$label', ({ fixture, clicks, enabled, reasons, adjustment }) => {
    const input = play(fixture, clicks);
    if (adjustment) expect(input.adjustment).toEqual(adjustment);
    if (enabled) {
      const rows = tradeControls(input);
      const open = Object.entries(rows).flatMap(([ability, row]) => [
        ...(row.lower.enabled ? [`lower ${ability}`] : []),
        ...(row.raise.enabled ? [`raise ${ability}`] : []),
      ]);
      expect(open.sort()).toEqual([...enabled].sort());
    }
    for (const [click, reason] of Object.entries(reasons ?? {}))
      expect(reasonOf(input, click as Click), click).toBe(reason);
  });

  it('gives every disabled control a reason once the limits load', () => {
    for (const name of Object.keys(fixtures).filter((key) => key !== '_about') as Name[]) {
      for (const row of Object.values(tradeControls(inputOf(name)))) {
        for (const control of [row.lower, row.raise]) {
          if (!control.enabled) expect(control.reason, name).toMatch(/\.$/);
        }
      }
    }
  });

  it('disables every control with no reason while the limits load', () => {
    const input = { ...inputOf('fighter_515', { lowered: { int: 2 }, raised: {} }), limits: null };
    for (const row of Object.values(tradeControls(input))) {
      expect(row.lower).toEqual({ enabled: false, next: null, reason: null });
      expect(row.raise).toEqual({ enabled: false, next: null, reason: null });
    }
  });
});

describe('the trade lead, status, and Continue', () => {
  it('states the exchange rate from the limits, or why no trade is possible', () => {
    expect(
      tradeLead({ ...inputOf('fighter_515'), limits: fixtures.fighter_515.limits as AdjustmentLimits }),
    ).toBe('Lowering a score by 2 raises a prime requisite by 1.');
    expect(
      tradeLead({ ...inputOf('fighter_191'), limits: fixtures.fighter_191.limits as AdjustmentLimits }),
    ).toBe('Strength is already as high as a trade can take it.');
    expect(
      tradeLead({ ...inputOf('fighter_7'), limits: fixtures.fighter_7.limits as AdjustmentLimits }),
    ).toBe('None of your scores can go lower in a trade.');
    const elf = { ...inputOf('elf_1832'), primes: ['int', 'str'] };
    const none = { ...(fixtures.elf_1832.limits as AdjustmentLimits), can_trade: false, max_points: 0 };
    none.max_points_reason = { code: 'creation.adjustment.no_room_to_raise', params: { max_points: 0 } };
    expect(tradeLead({ ...elf, limits: none })).toBe(
      'Your prime requisites are already as high as a trade can take them.',
    );
  });

  const limits = fixtures.fighter_515.limits as AdjustmentLimits;
  const ready: LimitsState = { status: 'ready', limits };
  const statusCases: Array<
    [string, Adjustment, 'idle' | 'checking' | 'ok' | 'invalid', string | null, string]
  > = [
    ['nothing traded', { lowered: {}, raised: {} }, 'idle', null, 'Skip this step'],
    ['a point to spend', { lowered: { int: 2 }, raised: {} }, 'invalid', '1 point to spend', 'Continue'],
    ['points to spend', { lowered: { int: 4 }, raised: {} }, 'invalid', '2 points to spend', 'Continue'],
    ['a point short', { lowered: {}, raised: { str: 1 } }, 'invalid', '1 point short', 'Continue'],
    ['a check running', { lowered: { int: 2 }, raised: { str: 1 } }, 'checking', null, 'Continue'],
    ['a refused trade', { lowered: { int: 2 }, raised: { str: 1 } }, 'invalid', 'Not allowed', 'Continue'],
    ['a complete trade', { lowered: { int: 2 }, raised: { str: 1 } }, 'ok', 'Trade complete', 'Continue'],
  ];
  it.each(statusCases)('%s', (_label, adjustment, check, badge, button) => {
    const status = tradeStatus(ready, adjustment, check);
    expect(tradeStatusLabel(status)).toBe(badge);
    expect(tradeContinueLabel(ready, status)).toBe(button);
  });

  it('says why Continue is disabled for an unfinished or refused trade', () => {
    expect(tradeContinueBlock(tradeStatus(ready, { lowered: { int: 2 }, raised: {} }, 'invalid'))).toEqual({
      reason: 'Spend your points on a prime requisite, or reset your scores.',
    });
    expect(tradeContinueBlock(tradeStatus(ready, { lowered: {}, raised: { str: 1 } }, 'invalid'))).toEqual({
      reason: 'Lower a score to pay for what you raised, or reset your scores.',
    });
    const balanced = { lowered: { int: 2 }, raised: { str: 1 } };
    expect(tradeContinueBlock(tradeStatus(ready, balanced, 'invalid'))).toEqual({
      reason: 'Change the trade, or reset your scores.',
    });
    expect(tradeContinueBlock(tradeStatus(ready, balanced, 'checking'))).toEqual({ reason: null });
    expect(tradeContinueBlock(tradeStatus(ready, balanced, 'ok'))).toBeNull();
    expect(tradeContinueBlock(tradeStatus(ready, { lowered: {}, raised: {} }, 'idle'))).toBeNull();
  });

  it('reads Continue when no trade is possible', () => {
    const none: LimitsState = { status: 'ready', limits: fixtures.fighter_191.limits as AdjustmentLimits };
    const loading: LimitsState = { status: 'loading' };
    expect(tradeContinueLabel(none, tradeStatus(none, { lowered: {}, raised: {} }, 'idle'))).toBe('Continue');
    expect(tradeContinueLabel(loading, tradeStatus(loading, { lowered: {}, raised: {} }, 'idle'))).toBe(
      'Skip this step',
    );
  });

  it('counts the points bought by whole steps of lowering', () => {
    expect(tradeBalance(limits, { lowered: { int: 4, wis: 2 }, raised: { str: 1 } })).toEqual({
      bought: 3,
      spent: 1,
      unspent: 2,
      short: 0,
    });
  });
});

describe('a trade from a draft that the limits did not produce', () => {
  const limits = fixtures.fighter_515.limits as AdjustmentLimits;
  const scores = fixtures.fighter_515.scores as Scores;

  it('compares by a whole step, so an odd amount from an earlier draft never takes a score below its lowest', () => {
    let input = inputOf('fighter_515', { lowered: { int: 1 }, raised: {} });
    const first = tradeControls(input).int.lower;
    expect(first.next).toEqual({ lowered: { int: 3 }, raised: {} });
    input = { ...input, adjustment: first.next ?? input.adjustment };
    // Intelligence is 10, and one more step would leave it at 8, below its lowest of 9.
    expect(reasonOf(input, 'lower int')).toBe("Intelligence can't go below 9 in a trade.");
  });

  it.each([
    ['an amount that is not a whole step', { lowered: { int: 1 }, raised: {} }],
    ['a lowering below the lowest score', { lowered: { int: 6 }, raised: { str: 2 } }],
    ['a raise above the highest score', { lowered: { int: 4 }, raised: { str: 3 } }],
    ['a change to a score that cannot change', { lowered: { dex: 2 }, raised: { str: 1 } }],
    ['more points bought than the most a trade buys', { lowered: { int: 4, wis: 2 }, raised: { str: 2 } }],
    ['one score both lowered and raised', { lowered: { str: 2 }, raised: { str: 1 } }],
  ] as const)('drops %s back to no trade', (_label, adjustment) => {
    const trade = { lowered: { ...adjustment.lowered }, raised: { ...adjustment.raised } };
    expect(tradeFits(limits, scores, trade)).toBe(false);
    expect(fitTrade(limits, scores, trade)).toEqual({ lowered: {}, raised: {} });
  });

  it.each([
    ['an unspent point', { lowered: { int: 2 }, raised: {} }],
    ['a point short', { lowered: {}, raised: { str: 1 } }],
    ['a complete trade', { lowered: { int: 4 }, raised: { str: 2 } }],
  ] as const)('keeps a trade that fits, with %s', (_label, adjustment) => {
    const trade = { lowered: { ...adjustment.lowered }, raised: { ...adjustment.raised } };
    expect(fitTrade(limits, scores, trade)).toBe(trade);
  });
});

describe('step sizes from bxapi', () => {
  // The same fighter with a step of 3 that buys 2 points, up to 4 points: no number here is 2 or 1 by rule.
  const base = fixtures.fighter_515.limits as AdjustmentLimits;
  const limits: AdjustmentLimits = {
    ...base,
    lower_step: 3,
    raise_step: 2,
    max_points: 4,
    max_points_reason: { code: 'creation.adjustment.no_room_to_raise', params: { max_points: 4 } },
    abilities: {
      ...base.abilities,
      int: { ...(base.abilities.int as AbilityAdjustmentLimit), lowest: 7 },
      wis: { ...(base.abilities.wis as AbilityAdjustmentLimit), lowest: 6 },
      str: { ...(base.abilities.str as AbilityAdjustmentLimit), highest: 20 },
    },
  };
  const input = (adjustment: Adjustment): TradeInput => ({ ...inputOf('fighter_515', adjustment), limits });

  it('lowers by lower_step, raises by raise_step, and stops at each limit', () => {
    let trade = input({ lowered: {}, raised: {} });
    const step = (click: Click) => {
      const [side, ability] = click.split(' ') as ['lower' | 'raise', Ability];
      const next = tradeControls(trade)[ability][side].next;
      if (next === null) throw new Error(`${click} is disabled`);
      trade = input(next);
    };
    step('lower int');
    expect(trade.adjustment).toEqual({ lowered: { int: 3 }, raised: {} });
    step('raise str');
    expect(trade.adjustment).toEqual({ lowered: { int: 3 }, raised: { str: 2 } });
    expect(reasonOf(trade, 'raise str')).toBe(NO_POINT_REASON);
    step('lower int');
    step('raise str');
    expect(trade.adjustment).toEqual({ lowered: { int: 6 }, raised: { str: 4 } });
    // Intelligence is 7, its lowest, and Strength is 20, its highest.
    expect(reasonOf(trade, 'lower int')).toBe("Intelligence can't go below 7 in a trade.");
    expect(reasonOf(trade, 'raise str')).toBe("Strength can't go above 20 in a trade.");
    expect(reasonOf(trade, 'lower wis')).toBe('Strength can rise only 4 points in a trade.');
  });

  it('fits a trade by those step sizes', () => {
    const scores = fixtures.fighter_515.scores as Scores;
    expect(tradeFits(limits, scores, { lowered: { int: 3 }, raised: { str: 2 } })).toBe(true);
    expect(tradeFits(limits, scores, { lowered: { int: 2 }, raised: { str: 1 } })).toBe(false);
    expect(tradeFits(limits, scores, { lowered: { int: 3 }, raised: { str: 1 } })).toBe(false);
  });
});

describe('the trade while the limits load or fail', () => {
  const trade = { lowered: { int: 2 }, raised: {} };
  const loading: LimitsState = { status: 'loading' };
  const failed: LimitsState = {
    status: 'failed',
    detail: 'The server is busy right now. Try again in a moment.',
  };

  it('shows a trade as being checked while the limits load, never as a verdict', () => {
    for (const check of ['idle', 'checking', 'ok', 'invalid'] as const) {
      const status = tradeStatus(loading, trade, check);
      expect(status).toEqual({ kind: 'checking' });
      expect(tradeStatusLabel(status)).toBeNull();
      expect(tradeContinueBlock(status)).toEqual({ reason: null });
    }
  });

  it('shows no badge after the limits fail, and lets only the check pass the trade', () => {
    expect(tradeStatusLabel(tradeStatus(failed, trade, 'invalid'))).toBeNull();
    expect(tradeContinueBlock(tradeStatus(failed, trade, 'invalid'))).toEqual({
      reason: 'Try again to check the trade, or reset your scores.',
    });
    expect(tradeContinueBlock(tradeStatus(failed, trade, 'checking'))).toEqual({ reason: null });
    expect(tradeContinueBlock(tradeStatus(failed, trade, 'ok'))).toBeNull();
  });

  it('checks a trade only once it is balanced, or when the limits failed', () => {
    const ready: LimitsState = { status: 'ready', limits: fixtures.fighter_515.limits as AdjustmentLimits };
    expect(tradeNeedsCheck(ready, { lowered: {}, raised: {} })).toBe(false);
    expect(tradeNeedsCheck(ready, trade)).toBe(false);
    expect(tradeNeedsCheck(ready, { lowered: {}, raised: { str: 1 } })).toBe(false);
    expect(tradeNeedsCheck(ready, { lowered: { int: 2 }, raised: { str: 1 } })).toBe(true);
    expect(tradeNeedsCheck(loading, { lowered: { int: 2 }, raised: { str: 1 } })).toBe(false);
    expect(tradeNeedsCheck(failed, trade)).toBe(true);
  });
});
