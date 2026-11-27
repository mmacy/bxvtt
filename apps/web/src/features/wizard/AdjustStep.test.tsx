/**
 * The ability trade step. The limits are real answers from bxapi, saved in `__fixtures__/adjustment-limits.json`,
 * and every refusal is a real answer from `POST /api/characters/check`, saved in `__fixtures__/adjust-trades.json`
 * with the class and the roll it was asked about.
 */
import type { AdjustmentLimits, CharacterCheckRequest, Problem } from '@bxvtt/shared/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassDetail } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import catalog from './__fixtures__/catalog.json';
import limitFixtures from './__fixtures__/adjustment-limits.json';
import trades from './__fixtures__/adjust-trades.json';
import { explainAdjustCheck } from './adjustCheck';
import { AdjustStep, type CheckState } from './AdjustStep';
import { CharacterWizard } from './CharacterWizard';
import type { Adjustment } from './draft';
import { draftKey, emptyDraft } from './draft';
import type { Scores } from './tables';
import type { LimitsState } from './useAdjustmentLimits';

interface Trade {
  label: string;
  class_id: string;
  scores: Scores;
  adjustment: Adjustment;
  valid: boolean;
  rejections: Array<{ code: string; params: Record<string, unknown> }>;
}

const cases = trades.cases as unknown as Trade[];

function tradeNamed(label: string): Trade {
  const found = cases.find((c) => c.label === label);
  if (!found) throw new Error(`No captured trade named "${label}".`);
  return found;
}

function problemOf(rejections: Trade['rejections']): Problem {
  return {
    type: 'about:blank',
    title: 'Unprocessable Entity',
    status: 422,
    code: 'character_invalid',
    detail: 'The ability adjustment breaks the rules for trading ability points.',
    rejections,
  } as Problem;
}

function detailOf(classId: string): ClassDetail {
  const all = { ...catalog.details, ...trades.details } as unknown as Record<string, ClassDetail>;
  const found = all[classId];
  if (!found) throw new Error(`No class entry for ${classId}.`);
  return found;
}

/** Fighter seed 5: STR 15, INT 14, WIS 11, the roll in `adjust-trades.json`. */
const FIGHTER = limitFixtures.fighter_5;
const FIGHTER_LIMITS = FIGHTER.limits as AdjustmentLimits;
/** Fighter seed 191: STR 18, so no trade is possible. */
const CAPPED = limitFixtures.fighter_191;

const ready = (limits: AdjustmentLimits): LimitsState => ({ status: 'ready', limits });

interface StepOptions {
  scores?: Scores;
  adjustment?: Adjustment;
  check?: CheckState;
  limits?: LimitsState;
  onChange?: (adjustment: Adjustment) => void;
  onRetry?: () => void;
  detail?: ClassDetail | null;
}

function renderStep(options: StepOptions = {}) {
  return renderWithTable(
    <AdjustStep
      scores={options.scores ?? (FIGHTER.scores as Scores)}
      adjustment={options.adjustment ?? { lowered: {}, raised: {} }}
      onChange={options.onChange ?? (() => {})}
      detail={options.detail === undefined ? detailOf('fighter') : options.detail}
      tables={null}
      check={options.check ?? { status: 'idle' }}
      limits={options.limits ?? ready(FIGHTER_LIMITS)}
      onRetry={options.onRetry ?? (() => {})}
      classId="fighter"
    />,
  );
}

const lower = (ability: string) => screen.getByRole('button', { name: `Lower ${ability}` });
const raise = (ability: string) => screen.getByRole('button', { name: `Raise ${ability}` });

describe('AdjustStep lead and controls', () => {
  it('states the exchange rate and marks the prime requisite with a badge', () => {
    renderStep();
    expect(screen.getByText('Lowering a score by 2 raises a prime requisite by 1.')).toBeInTheDocument();
    expect(screen.getAllByText('Prime requisite')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Reset scores' })).toBeNull();
    expect(screen.queryByText(/No points traded/)).toBeNull();
  });

  it('keeps a disabled control focusable, with its name and its reason', () => {
    renderStep();
    expect(lower('Dexterity')).toHaveAttribute('aria-disabled', 'true');
    expect(lower('Dexterity')).toHaveAccessibleDescription("Dexterity can't be lowered.");
    expect(raise('Strength')).toHaveAccessibleDescription('Lower a score first to gain a point.');
    expect(raise('Wisdom')).toHaveAccessibleDescription(
      "Wisdom isn't a prime requisite, so it can't be raised.",
    );
    expect(lower('Strength')).toHaveAccessibleDescription(
      "Strength is a prime requisite, so it can't be lowered.",
    );
    lower('Dexterity').focus();
    expect(lower('Dexterity')).toHaveFocus();
  });

  it('lowers by lower_step and raises by raise_step', async () => {
    const onChange = vi.fn();
    const { user } = renderStep({ onChange });
    await user.click(lower('Intelligence'));
    expect(onChange).toHaveBeenLastCalledWith({ lowered: { int: 2 }, raised: {} });
    onChange.mockClear();
    await user.click(lower('Dexterity'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('explains why no trade is possible in the lead, and disables every control with its reason', () => {
    renderStep({ scores: CAPPED.scores as Scores, limits: ready(CAPPED.limits as AdjustmentLimits) });
    expect(screen.getByText('Strength is already as high as a trade can take it.')).toBeInTheDocument();
    expect(raise('Strength')).toHaveAccessibleDescription("Strength can't go above 18 in a trade.");
    expect(lower('Intelligence')).toHaveAccessibleDescription(
      'Lowering Intelligence by 2 takes it below the lowest score a trade allows.',
    );
  });

  it('shows no reason until the class entry names the prime requisite', () => {
    renderStep({
      scores: CAPPED.scores as Scores,
      limits: ready(CAPPED.limits as AdjustmentLimits),
      detail: null,
    });
    expect(screen.queryByText(/as high as a trade can take/)).toBeNull();
    expect(raise('Strength')).toBeDisabled();
    expect(raise('Strength')).not.toHaveAccessibleDescription(/./);
  });

  it('holds the lead with a skeleton and disables every control while the limits load', () => {
    renderStep({ limits: { status: 'loading' } });
    expect(screen.queryByText(/Lowering a score by/)).toBeNull();
    for (const button of within(screen.getByRole('group', { name: 'Ability trades' })).getAllByRole('button'))
      expect(button).toBeDisabled();
  });

  it('says the limits failed to load, and tries again', async () => {
    const onRetry = vi.fn();
    const { user } = renderStep({
      limits: {
        status: 'failed',
        detail: 'Check your connection, or ask the server host whether the server is running.',
      },
      onRetry,
    });
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent("Couldn't check which scores you can trade");
    expect(banner).toHaveTextContent('Check your connection');
    expect(lower('Intelligence')).toBeDisabled();
    await user.click(within(banner).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('AdjustStep after the limits fail', () => {
  const failed: LimitsState = {
    status: 'failed',
    detail:
      "Can't reach the bxvtt server. Check your connection, or ask the server host whether the server is running.",
  };
  const step = (failures: number, limits: LimitsState = failed) => (
    <AdjustStep
      scores={FIGHTER.scores as Scores}
      adjustment={{ lowered: {}, raised: {} }}
      onChange={() => {}}
      detail={detailOf('fighter')}
      tables={null}
      check={{ status: 'idle' }}
      limits={limits}
      onRetry={() => {}}
      failures={failures}
      classId="fighter"
    />
  );

  it('announces a retry that fails again, and keeps focus on Try again', async () => {
    const { user, rerender } = renderWithTable(step(1));
    const before = screen.getByText(/Can't reach the bxvtt server/);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    rerender(step(2));
    const after = screen.getByText(/Can't reach the bxvtt server/);
    // The alert gets a new node with the same text, which a screen reader reads again.
    expect(after).not.toBe(before);
    expect(screen.getByRole('alert')).toContainElement(after);
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveFocus();
  });

  it('leaves focus alone when the limits load later for another reason after a retry failed', async () => {
    const { user, rerender } = renderWithTable(step(1));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    rerender(step(2));
    rerender(step(2, ready(FIGHTER_LIMITS)));
    expect(screen.getByText('Lowering a score by 2 raises a prime requisite by 1.')).not.toHaveFocus();
  });
});

describe('AdjustStep status', () => {
  it.each([
    [{ lowered: { int: 2 }, raised: {} }, 'invalid', '1 point to spend'],
    [{ lowered: { int: 4 }, raised: {} }, 'invalid', '2 points to spend'],
    [{ lowered: {}, raised: { str: 1 } }, 'invalid', '1 point short'],
    [{ lowered: { int: 2 }, raised: { str: 1 } }, 'ok', 'Trade complete'],
  ] as const)('shows %j as %s', (adjustment, check, badge) => {
    renderStep({
      adjustment: { lowered: { ...adjustment.lowered }, raised: { ...adjustment.raised } },
      check: check === 'ok' ? { status: 'ok' } : { status: 'invalid', sentences: ['ignored'] },
    });
    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(screen.queryByText('ignored')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset scores' })).toBeEnabled();
  });

  it('says how the experience modifier changes beside a complete trade', () => {
    renderStep({ adjustment: { lowered: { int: 2 }, raised: { str: 1 } }, check: { status: 'ok' } });
    expect(screen.getByText('Your experience modifier changes from +5% to +10%.')).toBeInTheDocument();
  });

  it('says nothing about an experience modifier that stays the same', () => {
    renderStep({
      scores: { ...(FIGHTER.scores as Scores), str: 13 },
      adjustment: { lowered: { int: 2 }, raised: { str: 1 } },
      check: { status: 'ok' },
    });
    expect(screen.getByText('Trade complete')).toBeInTheDocument();
    expect(screen.queryByText(/experience modifier/)).toBeNull();
  });

  it('shows a running check', () => {
    renderStep({ adjustment: { lowered: { int: 2 }, raised: { str: 1 } }, check: { status: 'checking' } });
    expect(screen.getByText('Checking the trade')).toBeInTheDocument();
  });

  it('shows a refusal that names a score beside that score, with no sentence in the footer', () => {
    const trade = tradeNamed('fighter lowers Intelligence below 9');
    renderStep({
      adjustment: { lowered: { int: 4 }, raised: { str: 2 } },
      check: explainAdjustCheck(problemOf(trade.rejections)),
    });
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
    expect(
      screen.getByText('Lowering Intelligence by 6 takes it below the lowest score a trade allows.'),
    ).toBeInTheDocument();
  });

  it('shows a refusal that names no score beside the badge', () => {
    renderStep({
      adjustment: { lowered: { int: 2 }, raised: { str: 1 } },
      check: explainAdjustCheck(
        problemOf([
          { code: 'creation.adjustment.points_mismatch', params: { points_available: 1, points_spent: 2 } },
        ]),
      ),
    });
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
    expect(screen.getByText('You gained 1 point from lowering scores, but spent 2.')).toBeInTheDocument();
  });
});

describe('explainAdjustCheck', () => {
  it('names the class in a refused class restriction, as the disabled reason does', () => {
    const { rejections } = tradeNamed('thief lowers Strength');
    const named = explainAdjustCheck(problemOf(rejections), 'thief');
    expect(named.status === 'invalid' && named.byAbility?.str).toContain("Thieves can't lower Strength.");
    const unnamed = explainAdjustCheck(problemOf(rejections));
    expect(unnamed.status === 'invalid' && unnamed.byAbility?.str).toContain(
      "Your class can't lower Strength.",
    );
  });
});

/** A fake API that serves the catalogs, the limits, and the check answer captured for each trade. */
function tradeApi(
  options: {
    limits?: () => Promise<AdjustmentLimits>;
    answer?: (request: CharacterCheckRequest) => Promise<void>;
  } = {},
): FakeApi {
  const api = createFakeApi();
  api.rules.mockImplementation(async (path: string) => {
    if (path === 'classes') return { items: catalog.classes.items, total: 3, limit: 200, offset: 0 };
    if (path.startsWith('classes/')) {
      const id = path.slice('classes/'.length) as keyof typeof catalog.details;
      return catalog.details[id] ?? catalog.details.fighter;
    }
    if (path === 'tables/abilities') return catalog.abilities;
    if (path === 'equipment') return { items: catalog.equipment.items, total: 0, limit: 200, offset: 0 };
    if (path === 'spells') return { items: catalog.spells.items, total: 0, limit: 200, offset: 0 };
    if (path === 'languages') return { items: catalog.languages.items, total: 0, limit: 200, offset: 0 };
    throw new Error(`No fixture for ${path}`);
  });
  api.fullCatalog.mockImplementation(async (name) => {
    const items = name === 'classes' ? Object.values(catalog.details) : [];
    return { catalog: name, total: items.length, items } as never;
  });
  api.getAdjustmentLimits.mockImplementation(options.limits ?? (async () => FIGHTER_LIMITS));
  api.checkCharacter.mockImplementation(async (request: CharacterCheckRequest) => {
    await options.answer?.(request);
    const adjustment = request.adjustment as Adjustment | undefined;
    const trade = cases.find(
      (c) =>
        c.class_id === request.class_id &&
        JSON.stringify(c.adjustment) ===
          JSON.stringify({ lowered: adjustment?.lowered ?? {}, raised: adjustment?.raised ?? {} }),
    );
    if (!trade || trade.valid || trade.rejections.length === 0) return { valid: true, problem: null };
    return { valid: false, problem: problemOf(trade.rejections) };
  });
  api.getStartingRolls.mockResolvedValue({
    used: false,
    class_id: null,
    rules: {
      ability_score_method: '3d6',
      hp_reroll_at_first_level: false,
      max_hp_at_first_level: false,
      ability_score_rerolls: 0,
      sub_par_restart: false,
    },
    gold_rolled: false,
  });
  return api;
}

function rollOf(scores: Scores) {
  return {
    id: 'rol_trade',
    scores,
    rolls: {
      scores,
      rolls: {
        str: [6, 5, 4],
        int: [4, 5, 5],
        wis: [3, 4, 4],
        dex: [2, 3, 4],
        con: [5, 3, 3],
        cha: [4, 3, 3],
      },
    },
    eligible_class_ids: ['fighter'],
    used: false,
    created_at: '2026-11-21T00:00:00Z',
    table_id: fixtureSnapshot('lobby', 'player').table.id,
    ability_score_method: '3d6',
    rules: {
      ability_score_method: '3d6',
      hp_reroll_at_first_level: false,
      max_hp_at_first_level: false,
      ability_score_rerolls: 0,
      sub_par_restart: false,
    },
    rerolls_left: 0,
  };
}

function openAdjustStep(
  api: FakeApi,
  scores: Scores = FIGHTER.scores as Scores,
  adjustment: Adjustment = { lowered: {}, raised: {} },
) {
  localStorage.setItem(
    draftKey(null, fixtureSnapshot('lobby', 'player').table.id),
    JSON.stringify({ ...emptyDraft(), roll: rollOf(scores), classId: 'fighter', step: 'adjust', adjustment }),
  );
  return renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
    api,
    snapshot: fixtureSnapshot('lobby', 'player'),
    preferences: { motion: 'reduce' },
  });
}

const FOOTER = () => screen.getByRole('contentinfo');
const SLOW = { timeout: 4000 };

describe('the ability trade step in the wizard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('makes a full trade, with Continue disabled until the points are spent', async () => {
    const api = tradeApi();
    const { user } = openAdjustStep(api);
    await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.');
    expect(within(FOOTER()).getByRole('button', { name: 'Skip this step' })).toBeEnabled();

    await user.click(lower('Intelligence'));
    expect(screen.getByText('1 point to spend')).toBeInTheDocument();
    const next = within(FOOTER()).getByRole('button', { name: 'Continue' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveAccessibleDescription('Spend your points on a prime requisite, or reset your scores.');

    await user.click(raise('Strength'));
    await screen.findByText('Trade complete', {}, SLOW);
    await user.click(within(FOOTER()).getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Alignment and languages' })).toBeInTheDocument();
    // The limits hold for every click, so the wizard reads them once for the roll and the class.
    expect(api.getAdjustmentLimits).toHaveBeenCalledTimes(1);
    expect(api.getAdjustmentLimits).toHaveBeenCalledWith('rol_trade', { class_id: 'fighter' });
  });

  it('blocks Continue for a trade a point short, and a reset clears it', async () => {
    const { user } = openAdjustStep(tradeApi());
    await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.');
    await user.click(lower('Intelligence'));
    await user.click(raise('Strength'));
    await user.click(raise('Intelligence'));
    expect(screen.getByText('1 point short')).toBeInTheDocument();
    expect(within(FOOTER()).getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription(
      'Lower a score to pay for what you raised, or reset your scores.',
    );
    await user.click(screen.getByRole('button', { name: 'Reset scores' }));
    expect(within(FOOTER()).getByRole('button', { name: 'Skip this step' })).toBeEnabled();
  });

  it('reads Continue and lets the player go on when no trade is possible', async () => {
    const { user } = openAdjustStep(
      tradeApi({ limits: async () => CAPPED.limits as AdjustmentLimits }),
      CAPPED.scores as Scores,
    );
    await screen.findByText('Strength is already as high as a trade can take it.');
    await user.click(within(FOOTER()).getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Alignment and languages' })).toBeInTheDocument();
  });

  it('describes the step in game terms', async () => {
    openAdjustStep(tradeApi());
    expect(
      await screen.findByText('Trade points into a prime requisite, or keep your rolled scores.'),
    ).toBeInTheDocument();
  });

  it('lets the player skip while the limits fail to load, and reads them again on Try again', async () => {
    let fail = true;
    const api = tradeApi({
      limits: async () => {
        if (fail) throw new TypeError('Failed to fetch');
        return FIGHTER_LIMITS;
      },
    });
    const { user } = openAdjustStep(api);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent("Couldn't check which scores you can trade");
    expect(within(FOOTER()).getByRole('button', { name: 'Skip this step' })).toBeEnabled();
    fail = false;
    await user.click(within(banner).getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.'),
    ).toBeInTheDocument();
    expect(api.getAdjustmentLimits).toHaveBeenCalledTimes(2);
  });

  it("ignores a slow answer to an earlier trade once a later trade's answer is in", async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = tradeApi({
      answer: async (request) => {
        // The first balanced trade waits until the test lets it go.
        const adjustment = request.adjustment as Adjustment | undefined;
        if (adjustment?.lowered.wis === undefined) await slow;
      },
    });
    const { user } = openAdjustStep(api);
    await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.');
    await user.click(lower('Intelligence'));
    await user.click(raise('Strength'));
    await waitFor(() => expect(api.checkCharacter).toHaveBeenCalledTimes(1), SLOW);
    await user.click(lower('Wisdom'));
    await user.click(raise('Strength'));
    await screen.findByText('Trade complete', {}, SLOW);

    release();
    await waitFor(() => expect(api.checkCharacter).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('Trade complete')).toBeInTheDocument();
  });

  it('checks the trade only once it is balanced', async () => {
    const api = tradeApi();
    const { user } = openAdjustStep(api);
    await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.');
    await user.click(lower('Intelligence'));
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(api.checkCharacter).not.toHaveBeenCalled();
    await user.click(raise('Strength'));
    await screen.findByText('Trade complete', {}, SLOW);
    expect(api.checkCharacter).toHaveBeenCalledTimes(1);
  });

  it('holds Continue for a balanced trade until the check answers', async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = tradeApi({ answer: () => slow });
    const { user } = openAdjustStep(api);
    await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.');
    await user.click(lower('Intelligence'));
    await user.click(raise('Strength'));
    const next = within(FOOTER()).getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    await waitFor(() => expect(api.checkCharacter).toHaveBeenCalledTimes(1), SLOW);
    expect(next).toBeDisabled();
    release();
    await screen.findByText('Trade complete', {}, SLOW);
    expect(within(FOOTER()).getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('starts over from a saved trade that the limits cannot produce', async () => {
    const api = tradeApi();
    openAdjustStep(api, FIGHTER.scores as Scores, { lowered: { int: 1 }, raised: {} });
    await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.');
    expect(await within(FOOTER()).findByRole('button', { name: 'Skip this step' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Reset scores' })).toBeNull();
    expect(screen.getByRole('group', { name: /^Intelligence after the trade 14/ })).toBeInTheDocument();
  });

  it('keeps a saved trade that fits but is unfinished', async () => {
    openAdjustStep(tradeApi(), FIGHTER.scores as Scores, { lowered: { int: 2 }, raised: {} });
    expect(await screen.findByText('1 point to spend')).toBeInTheDocument();
  });

  it('shows a saved trade as being checked while the limits load, with no verdict', async () => {
    const api = tradeApi({ limits: () => new Promise<AdjustmentLimits>(() => {}) });
    openAdjustStep(api, FIGHTER.scores as Scores, { lowered: { int: 2 }, raised: {} });
    expect(await screen.findByText('Checking the trade')).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(screen.queryByText('Not allowed')).toBeNull();
    expect(api.checkCharacter).not.toHaveBeenCalled();
    expect(within(FOOTER()).getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('shows no badge for a saved trade when the limits fail, and the check decides Continue', async () => {
    const api = tradeApi({
      limits: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    openAdjustStep(api, FIGHTER.scores as Scores, { lowered: { int: 2 }, raised: {} });
    await screen.findByRole('alert');
    // The captured answer for Intelligence lowered by 2 refuses the points that don't add up.
    await waitFor(() => expect(api.checkCharacter).toHaveBeenCalled(), SLOW);
    await waitFor(() =>
      expect(within(FOOTER()).getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription(
        'Try again to check the trade, or reset your scores.',
      ),
    );
    expect(screen.queryByText('Not allowed')).toBeNull();
    expect(screen.queryByText('1 point to spend')).toBeNull();
  });

  it('keeps focus on Try again while it reads the limits, then moves it to the lead', async () => {
    let attempt = 0;
    let answer: (limits: AdjustmentLimits) => void = () => {};
    const api = tradeApi({
      limits: () => {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new TypeError('Failed to fetch'));
        return new Promise<AdjustmentLimits>((resolve) => {
          answer = resolve;
        });
      },
    });
    const { user } = openAdjustStep(api);
    const banner = await screen.findByRole('alert');
    await user.click(within(banner).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.getAdjustmentLimits).toHaveBeenCalledTimes(2));
    const retry = within(screen.getByRole('alert')).getByRole('button', { name: 'Try again' });
    expect(retry).toHaveFocus();
    expect(retry).toHaveAttribute('aria-busy', 'true');
    answer(FIGHTER_LIMITS);
    const lead = await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.');
    await waitFor(() => expect(lead).toHaveFocus());
  });

  it("doesn't reuse a check that got no answer once Try again loads the limits", async () => {
    let up = false;
    const api = tradeApi({
      limits: async () => {
        if (!up) throw new TypeError('Failed to fetch');
        return FIGHTER_LIMITS;
      },
      answer: async () => {
        if (!up) throw new TypeError('Failed to fetch');
      },
    });
    const { user } = openAdjustStep(api, FIGHTER.scores as Scores, {
      lowered: { int: 2 },
      raised: { str: 1 },
    });
    const banner = await screen.findByRole('alert');
    await waitFor(() => expect(api.checkCharacter).toHaveBeenCalledTimes(1), SLOW);
    await waitFor(() =>
      expect(within(FOOTER()).getByRole('button', { name: 'Continue' })).toHaveAccessibleDescription(
        'Try again to check the trade, or reset your scores.',
      ),
    );
    up = true;
    await user.click(within(banner).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Trade complete', {}, SLOW)).toBeInTheDocument();
    expect(screen.queryByText('Not allowed')).toBeNull();
    expect(within(FOOTER()).getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('shows no verdict for a check that got no answer, and lets Continue check again', async () => {
    const api = tradeApi({
      answer: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const { user } = openAdjustStep(api);
    await screen.findByText('Lowering a score by 2 raises a prime requisite by 1.');
    await user.click(lower('Intelligence'));
    await user.click(raise('Strength'));
    await waitFor(() => expect(api.checkCharacter).toHaveBeenCalledTimes(1), SLOW);
    const next = within(FOOTER()).getByRole('button', { name: 'Continue' });
    await waitFor(() => expect(next).toBeEnabled());
    expect(screen.queryByText('Not allowed')).toBeNull();
    expect(screen.queryByText('Trade complete')).toBeNull();
    // Continue checks again, and the wizard's own failure banner says what went wrong.
    await user.click(next);
    expect(await screen.findByText("Can't reach the bxvtt server")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Adjust scores' })).toBeInTheDocument();
  });

  it('shows the reasons without the prime requisite when the class entry never loads', async () => {
    const api = tradeApi({ limits: async () => CAPPED.limits as AdjustmentLimits });
    api.fullCatalog.mockRejectedValue(new TypeError('Failed to fetch'));
    openAdjustStep(api, CAPPED.scores as Scores);
    expect(
      await screen.findByText(
        'Your prime requisites are already as high as a trade can take them.',
        {},
        SLOW,
      ),
    ).toBeInTheDocument();
  });
});
