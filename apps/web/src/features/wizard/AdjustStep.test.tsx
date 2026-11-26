/**
 * The ability trade step. Every refusal below is a real answer from `POST /api/characters/check` against bxapi,
 * saved in `__fixtures__/adjust-trades.json` with the class and the roll it was asked about.
 */
import type { CharacterCheckRequest, Problem } from '@bxvtt/shared/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClassDetail } from '@/app';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import catalog from './__fixtures__/catalog.json';
import trades from './__fixtures__/adjust-trades.json';
import { explainAdjustCheck } from './adjustCheck';
import { AdjustStep, type AdjustCheckState } from './AdjustStep';
import { CharacterWizard } from './CharacterWizard';
import type { Adjustment } from './draft';
import { draftKey, emptyDraft } from './draft';
import type { Scores } from './tables';

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

function problemOf(trade: Trade): Problem {
  return {
    type: 'about:blank',
    title: 'Unprocessable Entity',
    status: 422,
    code: 'character_invalid',
    detail: 'The ability adjustment breaks the rules for trading ability points.',
    rejections: trade.rejections,
  } as Problem;
}

/** What the step shows for a captured answer. */
function stateOf(trade: Trade): AdjustCheckState {
  return trade.valid ? { status: 'ok' } : explainAdjustCheck(problemOf(trade));
}

function detailOf(classId: string): ClassDetail {
  const all = { ...catalog.details, ...trades.details } as unknown as Record<string, ClassDetail>;
  const found = all[classId];
  if (!found) throw new Error(`No class entry for ${classId}.`);
  return found;
}

function renderStep(label: string, state?: AdjustCheckState, attempts = 0) {
  const trade = tradeNamed(label);
  return renderWithTable(
    <AdjustStep
      scores={trade.scores}
      adjustment={trade.adjustment}
      onChange={() => {}}
      detail={detailOf(trade.class_id)}
      tables={null}
      check={state ?? stateOf(trade)}
      continueAttempts={attempts}
    />,
  );
}

describe('AdjustStep guidance for a trade in progress', () => {
  it('says nothing is traded before the player starts', () => {
    renderWithTable(
      <AdjustStep
        scores={tradeNamed('fighter lowers Intelligence by 1').scores}
        adjustment={{ lowered: {}, raised: {} }}
        onChange={() => {}}
        detail={detailOf('fighter')}
        tables={null}
        check={{ status: 'idle' }}
      />,
    );
    expect(screen.getByText('No points traded. Your rolled scores are unchanged.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset to rolled scores' })).toBeNull();
  });

  it('guides the player after one click on minus, without a warning', () => {
    renderStep('fighter lowers Intelligence by 1');
    const guidance = screen.getByText(/You've lowered Intelligence by 1\./);
    expect(guidance).toHaveTextContent(
      "You've lowered Intelligence by 1. Lower a score by an even amount to gain points.",
    );
    // A status, so a screen reader announces it politely, and no alert, so it never sounds like an error.
    expect(within(screen.getByRole('status')).getByText("Your ability trade isn't finished")).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText("This ability trade isn't allowed")).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset to rolled scores' })).toBeEnabled();
  });

  it('guides the player to spend the points they gained', () => {
    renderStep('fighter lowers Intelligence by 2');
    expect(screen.getByText(/You've gained 1 point from lowering scores\./)).toHaveTextContent(
      "You've gained 1 point from lowering scores. Raise a prime requisite to finish the trade.",
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('guides the player to spend the rest when a trade across two prime requisites is half done', () => {
    renderStep('halfling lowers Wisdom by 4 and raises Strength by 1');
    expect(screen.getByText(/You've gained 2 points/)).toHaveTextContent(
      "You've gained 2 points from lowering scores and spent 1. Raise a prime requisite to spend the rest.",
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('guides the player when they spent more than they gained', () => {
    renderStep('halfling lowers Wisdom by 2 and raises Strength and Dexterity by 1');
    expect(screen.getByText(/You've gained 1 point/)).toHaveTextContent(
      "You've gained 1 point from lowering scores, but you spent 2. Raise a prime requisite by less, or lower a score to gain more points.",
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('guides the player when they raised a score before lowering one', () => {
    renderStep('fighter raises Strength by 1 only');
    expect(screen.getByText(/You've spent 1 point/)).toHaveTextContent(
      "You've spent 1 point without lowering a score to pay for the trade. Lower a score to gain points, or reset to your rolled scores.",
    );
  });

  it('gives one next step when the amount is odd and the points are short too', () => {
    renderStep('fighter lowers Intelligence by 3');
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain("You've lowered Intelligence by 3.");
    expect(text).not.toContain("You've gained");
  });

  it('confirms a complete trade', () => {
    renderStep('fighter lowers Intelligence by 2 and raises Strength by 1');
    expect(screen.getByText('Valid ability trade')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText("Your ability trade isn't finished")).toBeNull();
  });

  it('confirms a trade that spends the points across two prime requisites', () => {
    renderStep('halfling lowers Wisdom by 4 and raises Strength and Dexterity by 1');
    expect(screen.getByText('Valid ability trade')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Strength after the trade 17/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Dexterity after the trade 17/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Wisdom after the trade 10/ })).toBeInTheDocument();
  });
});

describe('AdjustStep warning for a wrong choice', () => {
  it.each([
    ['fighter lowers Dexterity', "Dexterity can't be lowered."],
    ['fighter lowers Strength', "You can't lower Strength because it is a prime requisite for this class."],
    ['fighter raises Wisdom', "Wisdom isn't a prime requisite for this class, so you can't raise it."],
    ['fighter lowers Intelligence below 9', 'Intelligence is 14, so lowering it by 6 drops it below 9.'],
    ['fighter raises Strength above 18', 'Strength is 15, so raising it by 4 exceeds the maximum of 18.'],
    ['thief lowers Strength', "This class can't lower Strength."],
  ])('warns for %s', (label, sentence) => {
    renderStep(label);
    expect(screen.getByRole('alert')).toHaveTextContent("This ability trade isn't allowed");
    expect(screen.getByText(new RegExp(sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
    expect(screen.queryByText("Your ability trade isn't finished")).toBeNull();
  });

  it('shows the wrong choice alone when the trade is also unfinished', () => {
    renderStep('elf lowers Wisdom by 4 and raises Strength by 1');
    expect(screen.getByRole('alert')).toHaveTextContent("This ability trade isn't allowed");
    expect(screen.getByText(/Wisdom is 11, so lowering it by 4 drops it below 9/)).toBeInTheDocument();
    expect(screen.queryByText(/You gained|You've gained/)).toBeNull();
  });

  it('warns for a refusal it does not know', () => {
    const state = explainAdjustCheck({
      ...problemOf(tradeNamed('fighter lowers Intelligence by 1')),
      rejections: [{ code: 'creation.adjustment.something_new', params: { ability: 'int' } }],
    });
    expect(state.status).toBe('invalid');
    renderStep('fighter lowers Intelligence by 1', state);
    expect(screen.getByRole('alert')).toHaveTextContent("This ability trade isn't allowed");
  });

  it('warns when a refusal comes with a trade in progress that it does not know', () => {
    const state = explainAdjustCheck({
      ...problemOf(tradeNamed('fighter lowers Intelligence by 1')),
      rejections: [
        { code: 'creation.adjustment.reduction_not_even', params: { ability: 'int', amount: 1 } },
        { code: 'creation.adjustment.something_new', params: {} },
      ],
    });
    expect(state.status).toBe('invalid');
  });
});

describe('AdjustStep when the player tries to continue', () => {
  it('moves focus to the note that says to finish the trade or reset it', () => {
    renderStep('fighter lowers Intelligence by 2', undefined, 1);
    const note = screen.getByText('Finish the trade, or reset to your rolled scores, before you continue.');
    expect(note).toHaveFocus();
  });

  it('shows no note before the player tries to continue', () => {
    renderStep('fighter lowers Intelligence by 2');
    expect(screen.queryByText(/before you continue/)).toBeNull();
  });
});

/** A fake API that serves the catalogs and answers a check with the answer captured for that trade. */
function tradeApi(answer?: (request: CharacterCheckRequest) => Promise<void>): FakeApi {
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
  api.checkCharacter.mockImplementation(async (request: CharacterCheckRequest) => {
    await answer?.(request);
    const adjustment = request.adjustment as Adjustment | undefined;
    const trade = cases.find(
      (c) =>
        c.class_id === request.class_id &&
        JSON.stringify(c.adjustment) ===
          JSON.stringify({ lowered: adjustment?.lowered ?? {}, raised: adjustment?.raised ?? {} }),
    );
    if (!trade || trade.valid || trade.rejections.length === 0) return { valid: true, problem: null };
    return { valid: false, problem: problemOf(trade) };
  });
  api.getStartingRolls.mockResolvedValue({
    used: false,
    class_id: null,
    // TODO(table-ruleset): the roll's recorded rules replace the re-roll option.
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

const FIGHTER_SCORES = tradeNamed('fighter lowers Intelligence by 1').scores;

const FIGHTER_ROLL = {
  id: 'rol_trade',
  scores: FIGHTER_SCORES,
  rolls: {
    scores: FIGHTER_SCORES,
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
};

function openAdjustStep(api: FakeApi) {
  localStorage.setItem(
    draftKey(null),
    JSON.stringify({ ...emptyDraft(), roll: FIGHTER_ROLL, classId: 'fighter', step: 'adjust' }),
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

  it('keeps the player on the step with a trade in progress, and a reset clears it', async () => {
    const { user } = openAdjustStep(tradeApi());
    await user.click(await screen.findByRole('button', { name: 'Lower Intelligence' }));
    const guidance = await screen.findByText(/You've lowered Intelligence by 1\./, {}, SLOW);

    // Continue stays available and points at the guidance, so the player isn't left at a dead button.
    const next = within(FOOTER()).getByRole('button', { name: 'Continue' });
    expect(next).toBeEnabled();
    expect(next).toHaveAttribute('aria-describedby', guidance.id);

    await user.click(next);
    expect(screen.getByRole('heading', { name: 'Adjust scores' })).toBeInTheDocument();
    expect(
      screen.getByText('Finish the trade, or reset to your rolled scores, before you continue.'),
    ).toHaveFocus();
    expect(screen.queryByRole('alert')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Reset to rolled scores' }));
    expect(screen.getByText('No points traded. Your rolled scores are unchanged.')).toBeInTheDocument();
    expect(screen.queryByText(/before you continue/)).toBeNull();
    expect(within(FOOTER()).getByRole('button', { name: 'Skip this step' })).toBeEnabled();
  });

  it('follows the guidance from one click to a complete trade, and then continues', async () => {
    const api = tradeApi();
    const { user } = openAdjustStep(api);
    const lower = await screen.findByRole('button', { name: 'Lower Intelligence' });
    await user.click(lower);
    await screen.findByText(/even amount to gain points/, {}, SLOW);
    await user.click(lower);
    await screen.findByText(/You've gained 1 point from lowering scores\./, {}, SLOW);
    expect(screen.queryByText(/even amount/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Raise Strength' }));
    await screen.findByText('Valid ability trade', {}, SLOW);
    await user.click(within(FOOTER()).getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Identity' })).toBeInTheDocument();
  });

  it('shows a wrong choice as a warning and blocks Continue', async () => {
    const { user } = openAdjustStep(tradeApi());
    await user.click(await screen.findByRole('button', { name: 'Raise Wisdom' }));
    await user.click(screen.getByRole('button', { name: 'Lower Intelligence' }));
    await user.click(screen.getByRole('button', { name: 'Lower Intelligence' }));
    await screen.findByRole('alert', {}, SLOW);
    expect(screen.getByRole('alert')).toHaveTextContent("This ability trade isn't allowed");
    const next = within(FOOTER()).getByRole('button', { name: 'Continue' });
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveAccessibleDescription(
      "This ability trade isn't allowed. Change it, or reset to your rolled scores.",
    );
  });

  it("ignores a slow answer to an earlier click once a later click's answer is in", async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const api = tradeApi(async (request) => {
      // The first click lowers Intelligence by 1. Its answer waits until the test lets it go.
      if ((request.adjustment as Adjustment | undefined)?.lowered.int === 1) await slow;
    });
    const { user } = openAdjustStep(api);
    const lower = await screen.findByRole('button', { name: 'Lower Intelligence' });
    await user.click(lower);
    await waitFor(() => expect(api.checkCharacter).toHaveBeenCalledTimes(1), SLOW);
    await user.click(lower);
    await screen.findByText(/You've gained 1 point from lowering scores\./, {}, SLOW);

    release();
    await waitFor(() => expect(api.checkCharacter).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText(/You've gained 1 point from lowering scores\./)).toBeInTheDocument();
    expect(screen.queryByText(/even amount/)).toBeNull();
  });
});
