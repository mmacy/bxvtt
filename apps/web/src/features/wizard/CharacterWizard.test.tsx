import { BxvttProblemError } from '@bxvtt/shared/client';
import type {
  AbilityRoll,
  AdjustmentLimits,
  CharacterCheckRequest,
  CharacterRequest,
  CreationRules,
  Problem,
  StartingRolls,
  StartingRollsStatus,
  StoredCharacter,
} from '@bxvtt/shared/protocol';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import catalog from './__fixtures__/catalog.json';
import limitFixtures from './__fixtures__/adjustment-limits.json';
import trades from './__fixtures__/adjust-trades.json';
import stored from './__fixtures__/stored.json';
import type { ClassDetail } from '@/app';
import { explainAdjustCheck } from './adjustCheck';
import { AdjustStep } from './AdjustStep';
import { CharacterWizard } from './CharacterWizard';
import { draftKey, emptyDraft, legacyDraftKey, type WizardDraft } from './draft';

/** The table of the lobby fixture, where the wizard opens. */
const TABLE_ID = fixtureSnapshot('lobby', 'player').table.id;

/** The dice bxapi rolled for each ability. Each split differs from an even spread, so a test can tell them apart. */
const ABILITY_DICE = {
  str: [6, 6, 3],
  int: [2, 3, 4],
  wis: [1, 4, 5],
  dex: [5, 5, 2],
  con: [3, 2, 6],
  cha: [1, 1, 6],
} satisfies Record<string, [number, number, number]>;

const SCORES = { str: 15, int: 9, wis: 10, dex: 12, con: 11, cha: 8 };

/** The rules recorded on the test roll: no limit on rerolls. */
const RULES = {
  ability_score_method: '3d6',
  hp_reroll_at_first_level: false,
  max_hp_at_first_level: false,
  ability_score_rerolls: null,
  sub_par_restart: false,
} satisfies CreationRules;

const ROLL: AbilityRoll = {
  id: 'rol_test',
  scores: SCORES,
  ability_score_method: '3d6',
  rolls: { scores: SCORES, rolls: ABILITY_DICE, dropped: {}, sub_par: false },
  eligible_class_ids: ['fighter', 'dwarf', 'magic_user'],
  used: false,
  created_at: '2026-11-21T00:00:00Z',
  table_id: TABLE_ID,
  rules: RULES,
  rerolls_left: null,
};

/** The dice the fake server rolls: a 6 on the hit die, and 4, 6, and 1 for gold. */
const DICE = {
  hit_point_roll: { rolls: [6], hit_points: 6, maximized: false },
  gold_roll: { rolls: [4, 6, 1], modifier: 0, multiplier: 10, total: 110 },
};

function invalid(body: Partial<Problem>): BxvttProblemError {
  return new BxvttProblemError({
    type: 'about:blank',
    title: 'Unprocessable Entity',
    status: 422,
    code: 'character_invalid',
    detail: 'refused',
    ...body,
  } as Problem);
}

function page<T>(items: T[]) {
  return { items, total: items.length, limit: 200, offset: 0 };
}

interface ServerRolls {
  /** What the server recorded when the wizard opens. */
  status?: Partial<StartingRollsStatus>;
  /** The hit point roll the server returns. */
  hitPoints?: StartingRolls['hit_point_roll'];
}

/**
 * A fake API that serves the catalogs, answers checks, and keeps the starting rolls of one ability roll the way
 * the server does: rolling hit points fixes the class, and a repeat returns the same dice.
 */
function wizardApi(options: { refusal?: BxvttProblemError; rolls?: ServerRolls } = {}): FakeApi {
  const api = createFakeApi();
  api.rules.mockImplementation(async (path: string) => {
    if (path === 'classes') return page(catalog.classes.items);
    if (path.startsWith('classes/')) {
      const id = path.slice('classes/'.length) as keyof typeof catalog.details;
      return catalog.details[id] ?? catalog.details.fighter;
    }
    if (path === 'tables/abilities') return catalog.abilities;
    if (path === 'equipment') return page(catalog.equipment.items);
    if (path === 'spells') return page(catalog.spells.items);
    if (path === 'languages') return page(catalog.languages.items);
    throw new Error(`No fixture for ${path}`);
  });
  api.rollAbilities.mockResolvedValue(ROLL);
  api.getAbilityRoll.mockResolvedValue(ROLL);
  api.getCurrentAbilityRoll.mockResolvedValue(null);
  api.fullCatalog.mockImplementation(async (name) => {
    if (name === 'classes') {
      const items = Object.values(catalog.details);
      return { catalog: name, total: items.length, items } as never;
    }
    return { catalog: name, total: 0, items: [] } as never;
  });
  api.checkCharacter.mockImplementation(async (request: CharacterCheckRequest) => {
    const lots =
      request.purchases?.reduce(
        (sum, p) =>
          sum + (catalog.equipment.items.find((e) => e.id === p.item_id)?.cost_gp ?? 0) * (p.quantity ?? 1),
        0,
      ) ?? 0;
    if (lots > DICE.gold_roll.total) {
      return {
        valid: false,
        problem: invalid({
          rejections: [
            { code: 'items.purchase.insufficient_funds', params: { item: 'plate_mail', cost_gp: lots } },
          ],
        }).problem,
      };
    }
    if (options.refusal) return { valid: false, problem: options.refusal.problem };
    return { valid: true, problem: null };
  });
  const server: StartingRollsStatus = {
    used: false,
    class_id: null,
    rules: RULES,
    gold_rolled: false,
    ...options.rolls?.status,
  };
  const hitPoints = options.rolls?.hitPoints ?? DICE.hit_point_roll;
  const answer = (): StartingRolls => ({
    class_id: server.class_id ?? '',
    rules: server.rules,
    hit_point_roll: hitPoints,
    gold_roll: server.gold_rolled ? DICE.gold_roll : null,
  });
  api.getStartingRolls.mockImplementation(async () => ({ ...server }));
  api.rollHitPoints.mockImplementation(async (_rollId, body) => {
    if (server.class_id === null) {
      server.class_id = body.class_id;
    }
    return answer();
  });
  api.rollStartingGold.mockImplementation(async () => {
    server.gold_rolled = true;
    return answer();
  });
  api.createCharacter.mockImplementation(async (request: CharacterRequest) => ({
    ...(stored as unknown as StoredCharacter),
    name: request.name,
  }));
  return api;
}

const ABILITY_NAMES = {
  str: 'Strength',
  int: 'Intelligence',
  wis: 'Wisdom',
  dex: 'Dexterity',
  con: 'Constitution',
  cha: 'Charisma',
};

/** Checks that each ability's dice show the faces in the roll, in the order bxapi rolled them. */
function expectDiceOnScreen() {
  for (const [ability, faces] of Object.entries(ABILITY_DICE)) {
    const group = screen.getByRole('group', {
      name: `${ABILITY_NAMES[ability as keyof typeof ABILITY_NAMES]} roll`,
    });
    const shown = Array.from(group.querySelectorAll('[data-value]')).map((el) =>
      Number(el.getAttribute('data-value')),
    );
    expect(shown).toEqual(faces);
  }
}

/** Opens the wizard on a stored draft. */
function openOn(draft: Partial<WizardDraft> & Record<string, unknown>, api: FakeApi) {
  localStorage.setItem(
    draftKey(null, TABLE_ID),
    JSON.stringify({
      ...emptyDraft(),
      roll: ROLL,
      classId: 'fighter',
      name: 'Wren',
      alignment: 'lawful',
      ...draft,
    }),
  );
  return renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
    api,
    snapshot: fixtureSnapshot('lobby', 'player'),
    preferences: { motion: 'reduce' },
  });
}

function continueButton() {
  return screen.queryByRole('button', { name: /^Continue/ });
}

beforeEach(() => {
  localStorage.clear();
});

describe('CharacterWizard', () => {
  // This test walks many steps, so it gets more than the default 5 seconds on a busy machine.
  it('walks from the roll to a stored character, named on the review step, and closes', async () => {
    const api = wizardApi();
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const { user } = renderWithTable(<CharacterWizard open onClose={onClose} onCreated={onCreated} />, {
      api,
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });

    await user.click(await screen.findByRole('button', { name: 'Roll ability scores' }));
    expect(api.rollAbilities).toHaveBeenCalled();
    expect(await screen.findByRole('group', { name: /^Strength 15/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await user.click(await screen.findByRole('button', { name: /^Fighter/ }));
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // The trade is optional, and skipping still asks the server about the choices so far.
    await user.click(await screen.findByRole('button', { name: /Skip this step/ }));
    await user.click(await screen.findByRole('radio', { name: /Lawful/ }));
    expect(screen.queryByRole('textbox', { name: /Name/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // The player rolls hit points, then gold, before the shop opens.
    await user.click(await screen.findByRole('button', { name: 'Roll hit points' }));
    await user.click(await screen.findByRole('button', { name: 'Roll starting gold' }));
    expect(
      await screen.findByText('You start with 110 gold pieces to spend on equipment.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(await screen.findByText('110')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Sword to the cart' }));
    await waitFor(() => expect(continueButton()).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    // Before the review step, the checks send a stand-in name with the alignment the player chose.
    for (const [request] of api.checkCharacter.mock.calls) expect(request.name).toBe('Adventurer');
    expect(api.checkCharacter.mock.calls.at(-1)?.[0]).toMatchObject({
      alignment: 'lawful',
      purchases: [{ item_id: 'sword' }],
    });

    expect(await screen.findByText('6 hit points')).toBeInTheDocument();
    // The review step opens on the empty name field.
    const name = screen.getByRole('textbox', { name: /Name/ });
    await waitFor(() => expect(name).toHaveFocus());
    await user.type(name, 'Wren');
    await user.click(await screen.findByRole('button', { name: 'Create character' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalledTimes(1);
    const body = api.createCharacter.mock.calls.at(-1)?.[0];
    expect(body).toMatchObject({
      name: 'Wren',
      class_id: 'fighter',
      alignment: 'lawful',
      ability_roll_id: 'rol_test',
      purchases: [{ item_id: 'sword' }],
    });
    expect(api.rollHitPoints).toHaveBeenCalledWith('rol_test', { class_id: 'fighter' });
    expect(localStorage.getItem(draftKey(null, TABLE_ID))).toBeNull();
  }, 15_000);

  it('sends the player to the name field instead of the server when the name is missing', async () => {
    const api = wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } });
    const onClose = vi.fn();
    localStorage.setItem(
      draftKey(null, TABLE_ID),
      JSON.stringify({
        ...emptyDraft(),
        roll: ROLL,
        classId: 'fighter',
        alignment: 'lawful',
        step: 'review',
      }),
    );
    const { user } = renderWithTable(<CharacterWizard open onClose={onClose} onCreated={() => {}} />, {
      api,
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    const create = await screen.findByRole('button', { name: 'Create character' });
    await screen.findByText('6 hit points');
    const name = screen.getByRole('textbox', { name: /Name/ });
    // A saved character that reopens on the review step without a name starts on the name field.
    await waitFor(() => expect(name).toHaveFocus());
    // Selecting Create character moves focus to the button, and the missing name sends it back to the field.
    await user.click(create);
    expect(name).toHaveFocus();
    expect(name).toHaveAccessibleDescription('Enter a name.');
    expect(api.checkCharacter).not.toHaveBeenCalled();
    expect(api.createCharacter).not.toHaveBeenCalled();
    await user.type(name, 'Wren');
    expect(name).not.toHaveAccessibleDescription();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('heads the review sheet with the name, then the class line and its Change link, in that order', async () => {
    const { user } = openOn(
      { step: 'review' },
      wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } }),
    );
    const name = await screen.findByRole('textbox', { name: /Name/ });
    await screen.findByText('6 hit points');
    name.focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Suggest a name' })).toHaveFocus();
    await user.tab();
    expect(document.activeElement).toHaveTextContent('Fighter');
    await user.tab();
    // jsdom drops the space before the visually hidden part of the name, which browsers keep.
    const change = screen.getByRole('button', { name: /^Change\s?alignment and languages$/ });
    expect(change).toHaveFocus();
    // The link shares the class line's row, and each dot stays on the line with the word before it.
    const line = within(change.parentElement as HTMLElement).getByText(/^Level 1/);
    expect(line.textContent).toBe('Level 1 Fighter\u00a0· Veteran\u00a0· Lawful');
  });

  it('keeps the name on a resumed review step and leaves focus where the dialog puts it', async () => {
    openOn({ step: 'review' }, wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } }));
    const name = await screen.findByRole('textbox', { name: /Name/ });
    expect(name).toHaveValue('Wren');
    await screen.findByText('6 hit points');
    expect(name).not.toHaveFocus();
  });

  it('stores a character created while the player closed the wizard, without closing a later one', async () => {
    const api = wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } });
    let store: (character: StoredCharacter) => void = () => {};
    api.createCharacter.mockReturnValue(new Promise<StoredCharacter>((resolve) => (store = resolve)));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    localStorage.setItem(
      draftKey(null, TABLE_ID),
      JSON.stringify({
        ...emptyDraft(),
        roll: ROLL,
        classId: 'fighter',
        name: 'Wren',
        alignment: 'lawful',
        step: 'review',
      }),
    );
    const view = renderWithTable(<CharacterWizard open onClose={onClose} onCreated={onCreated} />, {
      api,
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    await view.user.click(await screen.findByRole('button', { name: 'Create character' }));
    await waitFor(() => expect(api.createCharacter).toHaveBeenCalled());
    // The player closes the wizard while the server stores the character, as Escape does.
    view.rerender(<CharacterWizard open={false} onClose={onClose} onCreated={onCreated} />);
    act(() => store({ ...(stored as unknown as StoredCharacter), name: 'Wren' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    // The character exists, so nothing is left unfinished.
    expect(localStorage.getItem(draftKey(null, TABLE_ID))).toBeNull();
  });

  describe('a wizard reopened while an earlier create is in flight', () => {
    function openReviewDraft() {
      localStorage.setItem(
        draftKey(null, TABLE_ID),
        JSON.stringify({
          ...emptyDraft(),
          roll: ROLL,
          classId: 'fighter',
          name: 'Wren',
          alignment: 'lawful',
          step: 'review',
        }),
      );
    }

    async function startThenReopen(api: FakeApi, onCreated: () => void, onClose: () => void) {
      openReviewDraft();
      const view = renderWithTable(<CharacterWizard open onClose={onClose} onCreated={onCreated} />, {
        api,
        snapshot: fixtureSnapshot('lobby', 'player'),
        preferences: { motion: 'reduce' },
      });
      await view.user.click(await screen.findByRole('button', { name: 'Create character' }));
      await waitFor(() => expect(api.createCharacter).toHaveBeenCalled());
      // The player closes the wizard and opens it again before the server answers.
      view.rerender(<CharacterWizard open={false} onClose={onClose} onCreated={onCreated} />);
      view.rerender(<CharacterWizard open onClose={onClose} onCreated={onCreated} />);
      const create = await screen.findByRole('button', { name: 'Create character' });
      return create;
    }

    it('waits for the answer and closes once the character is stored', async () => {
      const api = wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } });
      let store: (character: StoredCharacter) => void = () => {};
      api.createCharacter.mockReturnValue(new Promise<StoredCharacter>((resolve) => (store = resolve)));
      const onCreated = vi.fn();
      const onClose = vi.fn();
      const create = await startThenReopen(api, onCreated, onClose);
      expect(create).toHaveAttribute('aria-busy', 'true');
      act(() => store({ ...(stored as unknown as StoredCharacter), name: 'Wren' }));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(api.createCharacter).toHaveBeenCalledTimes(1);
      expect(localStorage.getItem(draftKey(null, TABLE_ID))).toBeNull();
    });

    it('lets the player carry on when the earlier create fails', async () => {
      const api = wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } });
      let fail: (error: unknown) => void = () => {};
      api.createCharacter.mockReturnValue(
        new Promise<StoredCharacter>((_resolve, reject) => (fail = reject)),
      );
      const onClose = vi.fn();
      const create = await startThenReopen(api, () => {}, onClose);
      act(() => fail(new TypeError('Failed to fetch')));
      await waitFor(() => expect(create).not.toHaveAttribute('aria-busy'));
      expect(onClose).not.toHaveBeenCalled();
      expect(localStorage.getItem(draftKey(null, TABLE_ID))).not.toBeNull();
    });
  });

  it('puts a name the server refuses on the field, with focus there', async () => {
    const api = wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } });
    api.createCharacter.mockRejectedValue(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        code: 'validation_error',
        detail: 'name',
      } as Problem),
    );
    const { user } = openOn({ step: 'review' }, api);
    const create = await screen.findByRole('button', { name: 'Create character' });
    await screen.findByText('6 hit points');
    const name = screen.getByRole('textbox', { name: /Name/ });
    await user.click(create);
    await waitFor(() => expect(name).toHaveAccessibleDescription("This name won't work. Try another."));
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    // The field is the one signal: no banner repeats the refusal.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/valid character name/)).toBeNull();
    await user.type(name, 'a');
    expect(name).not.toHaveAccessibleDescription();
  });

  it('stays open on the review step with every choice when storing the character fails', async () => {
    const api = wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } });
    api.createCharacter.mockRejectedValue(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        code: 'bxapi_unavailable',
        detail: 'unreachable',
      } as Problem),
    );
    const onCreated = vi.fn();
    const onClose = vi.fn();
    localStorage.setItem(
      draftKey(null, TABLE_ID),
      JSON.stringify({
        ...emptyDraft(),
        roll: ROLL,
        classId: 'fighter',
        name: 'Wren',
        alignment: 'lawful',
        step: 'review',
      }),
    );
    const { user } = renderWithTable(<CharacterWizard open onClose={onClose} onCreated={onCreated} />, {
      api,
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    await user.click(await screen.findByRole('button', { name: 'Create character' }));
    expect(await screen.findByText("Couldn't create Wren")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Wren');
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(localStorage.getItem(draftKey(null, TABLE_ID))).not.toBeNull();
  });

  it('shows the dice bxapi rolled for each ability, not a split of the score', async () => {
    const { user } = renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
      api: wizardApi(),
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    await user.click(await screen.findByRole('button', { name: 'Roll ability scores' }));
    await screen.findByRole('group', { name: /^Strength 15/ });
    expectDiceOnScreen();
  });

  it('shows the same dice when it restores a roll from an earlier visit', async () => {
    openOn({ step: 'roll' }, wizardApi());
    await screen.findByRole('group', { name: /^Strength 15/ });
    expectDiceOnScreen();
  });

  describe('a draft saved before bxapi returned the dice', () => {
    const { rolls: _dice, ...withoutDice } = ROLL;

    function openWithoutDice(api: FakeApi, draft: Partial<WizardDraft> = {}) {
      return openOn({ step: 'roll', roll: withoutDice as unknown as AbilityRoll, ...draft }, api);
    }

    it('keeps the draft, fetches the roll again, shows its dice, and saves them', async () => {
      const api = wizardApi();
      api.getAbilityRoll.mockResolvedValue(ROLL);
      openWithoutDice(api);
      await screen.findByRole('group', { name: /^Strength 15/ });
      await waitFor(() => expectDiceOnScreen());
      expect(api.getAbilityRoll).toHaveBeenCalledWith('rol_test');
      const saved = JSON.parse(localStorage.getItem(draftKey(null, TABLE_ID)) ?? '{}') as {
        name: string;
        roll: AbilityRoll;
      };
      expect(saved.name).toBe('Wren');
      expect(saved.roll.rolls.rolls).toEqual(ABILITY_DICE);
    });

    it('holds each die’s place with the loaded header while the dice load, then shows them without rolling', async () => {
      const api = wizardApi();
      let deliver: (roll: AbilityRoll) => void = () => {};
      api.getAbilityRoll.mockReturnValue(new Promise<AbilityRoll>((resolve) => (deliver = resolve)));
      const { container } = openWithoutDice(api);
      await screen.findByRole('group', { name: /^Strength 15/ });
      const busy = container.ownerDocument.querySelectorAll('[aria-busy="true"]');
      expect(busy).toHaveLength(6);
      const first = busy[0];
      if (!(first instanceof HTMLElement)) throw new Error('No dice slot.');
      expect(first).toHaveTextContent('Strength3d6');
      expect(screen.queryByRole('group', { name: 'Strength roll' })).not.toBeInTheDocument();
      deliver(ROLL);
      const strength = await screen.findByRole('group', { name: 'Strength roll' });
      expect(strength).toHaveAttribute('aria-busy', 'false');
      expect(container.ownerDocument.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
      expectDiceOnScreen();
    });

    it('resumes the later steps while the dice are still on their way', async () => {
      const api = wizardApi();
      api.getAbilityRoll.mockReturnValue(new Promise(() => {}));
      openWithoutDice(api, { step: 'identity' });
      expect(
        await screen.findByRole('heading', { name: 'Alignment and languages', level: 3 }),
      ).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: /Lawful/ })).toBeChecked();
    });

    it('keeps the scores and the draft when the fetch fails for another reason', async () => {
      const api = wizardApi();
      api.getAbilityRoll.mockRejectedValue(new Error('offline'));
      openWithoutDice(api);
      await screen.findByRole('group', { name: /^Strength 15/ });
      await waitFor(() => expect(api.getAbilityRoll).toHaveBeenCalled());
      expect(screen.queryByRole('group', { name: 'Strength roll' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Roll ability scores' })).not.toBeInTheDocument();
      const saved = JSON.parse(localStorage.getItem(draftKey(null, TABLE_ID)) ?? '{}') as { name: string };
      expect(saved.name).toBe('Wren');
    });

    it('starts again from new scores when the roll is gone', async () => {
      const api = wizardApi();
      api.getAbilityRoll.mockRejectedValue(invalid({ code: 'not_found', status: 404 }));
      openWithoutDice(api);
      expect(await screen.findByText('Your ability roll expired')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Roll ability scores' })).toBeInTheDocument();
    });
  });

  it('takes the player to the step a refusal belongs to', async () => {
    const api = wizardApi({
      refusal: invalid({
        rejections: [
          { code: 'items.equip.armour_not_allowed', params: { class: 'magic_user', item: 'leather' } },
        ],
      }),
      rolls: { status: { class_id: 'fighter', gold_rolled: true } },
    });
    const { user } = openOn({ step: 'review' }, api);
    await user.click(await screen.findByRole('button', { name: 'Create character' }));
    expect(await screen.findByText('Check your starting equipment')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Outfit' })).toBeInTheDocument();
  });

  it('keeps the choices when the dialog closes and reopens', async () => {
    openOn({ step: 'identity' }, wizardApi());
    expect(await screen.findByRole('radio', { name: /Lawful/ })).toBeChecked();
    // The player chose to resume, so no banner repeats it.
    expect(screen.queryByText(/Resumed/)).toBeNull();
  });

  it('starts again from new scores when the server says the roll is used', async () => {
    openOn({ step: 'outfit' }, wizardApi({ rolls: { status: { used: true } } }));
    expect(
      await screen.findByText('You already made a character from these ability scores'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll ability scores' })).toBeInTheDocument();
  });
});

describe('the hit points and gold step', () => {
  it('before any roll, says what rolling fixes and offers only the hit points', async () => {
    openOn({ step: 'hp_gold' }, wizardApi());
    const roll = await screen.findByRole('button', { name: 'Roll hit points' });
    expect(roll).toHaveAccessibleDescription('Rolling hit points fixes your class as a fighter.');
    const gold = screen.getByRole('button', { name: 'Roll starting gold' });
    expect(gold).toHaveAttribute('aria-disabled', 'true');
    expect(gold).toHaveAccessibleDescription('Roll your hit points before your starting gold.');
    expect(screen.getByText('d8')).toBeInTheDocument();
    expect(continueButton()).toBeNull();
  });

  it('shows the hit die, the modifier, and the total from the server once the hit points are rolled', async () => {
    const api = wizardApi();
    const { user } = openOn({ step: 'hp_gold' }, api);
    await user.click(await screen.findByRole('button', { name: 'Roll hit points' }));
    const dice = await screen.findByRole('group', { name: 'Hit points roll' });
    expect(within(dice).getByText('Hit points: rolled 6 on 1d8, total 6.')).toBeInTheDocument();
    expect(screen.getByText('You start with 6 hit points.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Roll hit points' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Roll starting gold' })).toBeEnabled();
    expect(continueButton()).toBeNull();
    expect(api.rollStartingGold).not.toHaveBeenCalled();
  });

  it('lets the player continue once both are rolled, with focus following the rolls', async () => {
    const { user } = openOn({ step: 'hp_gold' }, wizardApi());
    (await screen.findByRole('button', { name: 'Roll hit points' })).focus();
    await user.keyboard('{Enter}');
    const gold = await screen.findByRole('button', { name: 'Roll starting gold' });
    await waitFor(() => expect(gold).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('group', { name: 'Starting gold roll' })).toBeInTheDocument();
    const result = screen.getByText('You start with 110 gold pieces to spend on equipment.');
    await waitFor(() => expect(result).toHaveFocus());
    expect(screen.queryByRole('button', { name: /^Roll (hit points|starting gold)$/ })).toBeNull();
    expect(continueButton()).toBeEnabled();
  });

  it('after a reload, shows the rolls the server kept and offers neither roll again', async () => {
    const api = wizardApi({
      rolls: { status: { class_id: 'fighter', gold_rolled: true } },
    });
    openOn({ step: 'hp_gold' }, api);
    expect(
      await screen.findByText('You start with 110 gold pieces to spend on equipment.'),
    ).toBeInTheDocument();
    expect(screen.getByText('You start with 6 hit points.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Roll (hit points|starting gold)$/ })).toBeNull();
    // The wizard reads the dice with the request that returns the rolls already made, and never rolls gold.
    expect(api.rollHitPoints).toHaveBeenCalledWith('rol_test', { class_id: 'fighter' });
    expect(api.rollStartingGold).not.toHaveBeenCalled();
  });

  it('shows the dice the first-level reroll set aside', async () => {
    const api = wizardApi({
      rolls: {
        status: {
          class_id: 'fighter',
          rules: { ...RULES, hp_reroll_at_first_level: true },
          gold_rolled: false,
        },
        hitPoints: { rolls: [1, 2, 5], hit_points: 5, maximized: false },
      },
    });
    openOn({ step: 'hp_gold', hpReroll: true }, api);
    expect(
      await screen.findByRole('group', { name: 'Set aside by the hit die reroll: 1 and 2' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your hit die came up 1 and 2, so you rolled again. You start with 5 hit points.'),
    ).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(api.rollHitPoints).toHaveBeenCalledWith('rol_test', { class_id: 'fighter' });
  });

  it('sends a draft from the version that counted gold back to the rolls before the shop', async () => {
    openOn({ step: 'outfit', gold: { key: 'rol_test:fighter:plain', gp: 90 } }, wizardApi());
    expect(await screen.findByRole('button', { name: 'Roll hit points' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hit points and gold', level: 3 })).toBeInTheDocument();
  });
});

describe('the class step after the hit points are rolled', () => {
  it('shows the class as fixed', async () => {
    const api = wizardApi({
      rolls: {
        status: {
          class_id: 'dwarf',
          rules: { ...RULES, hp_reroll_at_first_level: true },
          gold_rolled: false,
        },
      },
    });
    openOn({ step: 'class', classId: 'fighter', hpReroll: false }, api);
    expect(await screen.findByText('Your class is fixed as a dwarf')).toBeInTheDocument();
    expect(screen.getByText('You rolled hit points for these ability scores.')).toBeInTheDocument();
    // The server's record wins over the draft in this browser.
    const dwarf = await screen.findByRole('button', { name: 'Dwarf' });
    expect(dwarf).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fighter' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Fighter' })).toHaveAccessibleDescription(
      /^You rolled hit points for these ability scores/,
    );
    // The table's rules decide the hit die reroll, so the class step offers no choice of it.
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

/** A roll with the rerolls left that the server counted, under rules that allow `limit` rerolls. */
function rollWith(limit: number | null, left: number | null, change: Partial<AbilityRoll> = {}): AbilityRoll {
  return { ...ROLL, rules: { ...RULES, ability_score_rerolls: limit }, rerolls_left: left, ...change };
}

function refusal(code: string, extra: Partial<Problem> = {}): BxvttProblemError {
  return new BxvttProblemError({
    type: 'about:blank',
    title: 'Conflict',
    status: 409,
    code,
    detail: 'refused',
    ...extra,
  } as Problem);
}

describe("the table's reroll limit", () => {
  it('says how many rerolls are left on Roll again', async () => {
    const api = wizardApi();
    api.getAbilityRoll.mockResolvedValue(rollWith(3, 2));
    openOn({ step: 'roll', roll: rollWith(3, 2) }, api);
    const again = await screen.findByRole('button', { name: 'Roll again' });
    expect(again).toHaveAccessibleDescription('2 left');
    expect(screen.queryByText(/reroll freely/)).toBeNull();
  });

  it('keeps Roll again with its reason once the rerolls are used, and hides Start over', async () => {
    const api = wizardApi();
    api.getAbilityRoll.mockResolvedValue(rollWith(3, 0));
    const { user } = openOn({ step: 'roll', roll: rollWith(3, 0) }, api);
    const again = await screen.findByRole('button', { name: 'Roll again' });
    expect(again).toHaveAttribute('aria-disabled', 'true');
    expect(again).toHaveAccessibleDescription("You've used all the rerolls your table allows.");
    expect(screen.queryByText('0 left')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    await screen.findByRole('heading', { name: 'Choose a class', level: 3 });
    expect(screen.queryByRole('button', { name: 'Start over' })).toBeNull();
  });

  it('shows no reroll row at a table that allows no rerolls', async () => {
    const api = wizardApi();
    api.getAbilityRoll.mockResolvedValue(rollWith(0, 0));
    openOn({ step: 'roll', roll: rollWith(0, 0) }, api);
    await screen.findByRole('group', { name: /^Strength 15/ });
    expect(screen.queryByRole('button', { name: 'Roll again' })).toBeNull();
  });

  it('shows Roll again with no count when the table has no limit', async () => {
    openOn({ step: 'roll' }, wizardApi());
    const again = await screen.findByRole('button', { name: 'Roll again' });
    expect(again).not.toHaveAccessibleDescription();
  });

  it('goes back to the scores the player rolled last when the server refuses another roll', async () => {
    const api = wizardApi();
    api.rollAbilities.mockRejectedValue(refusal('ability_rerolls_used', { roll_id: 'rol_newest' }));
    api.getAbilityRoll.mockResolvedValue(rollWith(0, 0, { id: 'rol_newest' }));
    const { user } = renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
      api,
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    await user.click(await screen.findByRole('button', { name: 'Roll ability scores' }));
    expect(await screen.findByText("You've used all your rerolls")).toBeInTheDocument();
    expect(screen.getByText('These are the ability scores you rolled last.')).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: /^Strength 15/ })).toBeInTheDocument();
    expect(api.getAbilityRoll).toHaveBeenCalledWith('rol_newest');
  });

  it('takes the newest roll when the server says the draft has an older one', async () => {
    const api = wizardApi({ rolls: { status: { class_id: 'fighter', gold_rolled: true } } });
    api.checkCharacter.mockRejectedValue(refusal('ability_roll_superseded', { roll_id: 'rol_newest' }));
    api.getAbilityRoll.mockImplementation(async (id: string) => ({ ...ROLL, id }));
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    const { user } = openOn({ step: 'review' }, api);
    await user.click(await screen.findByRole('button', { name: 'Create character' }));
    expect(await screen.findByText('You rolled newer ability scores')).toBeInTheDocument();
    expect(
      screen.getByText('Only your newest ability scores count, so they replace the ones you had here.'),
    ).toBeInTheDocument();
    // The wizard changed the step by itself, so it shows the new step from the top, with focus on its heading.
    const heading = screen.getByRole('heading', { name: 'Roll abilities', level: 3 });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scrolled).toHaveBeenCalledWith({ block: 'start' });
    expect(api.createCharacter).not.toHaveBeenCalled();
  });

  it('picks up the newest open roll at the table when the wizard opens without a draft', async () => {
    const api = wizardApi();
    api.getCurrentAbilityRoll.mockResolvedValue(ROLL);
    renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
      api,
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    expect(await screen.findByRole('group', { name: /^Strength 15/ })).toBeInTheDocument();
    expect(api.getCurrentAbilityRoll).toHaveBeenCalledWith(TABLE_ID);
    // Scores the player didn't see this wizard roll say where they came from.
    expect(screen.getByText('Your latest ability scores')).toBeInTheDocument();
    expect(screen.queryByText('These are the ability scores you rolled last.')).toBeNull();
  });

  it('holds Roll ability scores until the server says whether an open roll exists', async () => {
    const api = wizardApi();
    let answer: (error: unknown) => void = () => {};
    api.getCurrentAbilityRoll.mockReturnValue(new Promise((_resolve, reject) => (answer = reject)));
    const { user } = renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
      api,
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    const button = await screen.findByRole('button', { name: 'Roll ability scores' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(api.rollAbilities).not.toHaveBeenCalled();
    answer(refusal('not_found'));
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));
    await user.click(button);
    expect(api.rollAbilities).toHaveBeenCalledWith(TABLE_ID);
  });

  it('moves focus to the step heading after a roll, because the button that rolled goes away', async () => {
    const { user } = renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
      api: wizardApi(),
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    const button = await screen.findByRole('button', { name: 'Roll ability scores' });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));
    await user.click(button);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Roll abilities', level: 3 })).toHaveFocus(),
    );
  });

  it('brings Roll again back to a roll made in this wizard when the referee raises the limit', async () => {
    const api = wizardApi();
    api.rollAbilities.mockResolvedValue(rollWith(0, 0));
    const { user, store } = renderWithTable(
      <CharacterWizard open onClose={() => {}} onCreated={() => {}} />,
      { api, snapshot: fixtureSnapshot('lobby', 'player'), preferences: { motion: 'reduce' } },
    );
    const button = await screen.findByRole('button', { name: 'Roll ability scores' });
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'));
    await user.click(button);
    await screen.findByRole('group', { name: /^Strength 15/ });
    expect(screen.queryByRole('button', { name: 'Roll again' })).toBeNull();
    expect(api.getAbilityRoll).not.toHaveBeenCalled();
    api.getAbilityRoll.mockResolvedValue(rollWith(0, 2));
    const table = store.getState().table;
    if (table === null) throw new Error('No table.');
    act(() =>
      store.getState().receiveTable({ ...table, settings: { ...table.settings, ability_score_rerolls: 2 } }),
    );
    expect(await screen.findByRole('button', { name: 'Roll again' })).toHaveAccessibleDescription('2 left');
  });

  it('starts over from a draft whose roll was made before rolls belonged to a table', async () => {
    const { table_id: _table, rules: _rules, rerolls_left: _left, ...old } = ROLL;
    localStorage.setItem(
      legacyDraftKey(null),
      JSON.stringify({ ...emptyDraft(), roll: old, classId: 'fighter', name: 'Wren', step: 'identity' }),
    );
    renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
      api: wizardApi(),
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    expect(await screen.findByText('Your earlier ability scores no longer count')).toBeInTheDocument();
    expect(screen.getByText('This table now sets the rules for new characters.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roll ability scores' })).toBeInTheDocument();
    expect(localStorage.getItem(legacyDraftKey(null))).toBeNull();
  });
});

describe('the creation house rules', () => {
  const FOUR_D6 = { ...RULES, ability_score_method: '4d6_drop_lowest', max_hp_at_first_level: true } as const;

  it('shows the die bxapi dropped from each ability, marked', async () => {
    const dropped = { str: 1, int: 1, wis: 1, dex: 2, con: 1, cha: 1 };
    const roll: AbilityRoll = {
      ...ROLL,
      ability_score_method: '4d6_drop_lowest',
      rules: FOUR_D6,
      rolls: { ...ROLL.rolls, dropped },
    };
    const api = wizardApi();
    api.getAbilityRoll.mockResolvedValue(roll);
    openOn({ step: 'roll', roll }, api);
    const strength = await screen.findByRole('group', { name: 'Strength roll' });
    const faces = Array.from(strength.querySelectorAll('[data-value]')).map((el) =>
      el.getAttribute('data-value'),
    );
    expect(faces).toEqual(['6', '6', '3', '1']);
    expect(strength.querySelector('[data-dropped]')).toHaveAttribute('data-value', '1');
    expect(
      within(strength).getByText('Strength: rolled 6, 6, 3, and 1 on 4d6 and dropped the 1.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Roll 4d6 in order for each ability score, and keep the highest three.'),
    ).toBeInTheDocument();
  });

  it('takes the maximum hit points instead of rolling them', async () => {
    const api = wizardApi({
      rolls: {
        status: { rules: FOUR_D6 },
        hitPoints: { rolls: [3], hit_points: 8, maximized: true },
      },
    });
    const { user } = openOn({ step: 'hp_gold', roll: { ...ROLL, rules: FOUR_D6 } }, api);
    const take = await screen.findByRole('button', { name: 'Take the maximum' });
    expect(screen.getByText('Maximum hit points')).toBeInTheDocument();
    // The house rule takes no roll, so its button shows no dice.
    expect(take.querySelector('svg')).toBeNull();
    await user.click(take);
    const maximum = await screen.findByRole('group', { name: 'Maximum hit die' });
    expect(within(maximum).getByRole('img', { name: 'd8 showing 8' })).toBeInTheDocument();
    // The total sits beside the die, as a rolled die's does. Constitution 11 adds nothing.
    expect(maximum).toHaveTextContent('Maximum8=8');
    expect(screen.getByText('You start with 8 hit points.')).toBeInTheDocument();
  });

  it('says on the review step that the table gave the maximum, without a rolled face', async () => {
    const api = wizardApi({
      rolls: {
        status: { class_id: 'fighter', rules: FOUR_D6, gold_rolled: true },
        hitPoints: { rolls: [3], hit_points: 8, maximized: true },
      },
    });
    openOn({ step: 'review', roll: { ...ROLL, rules: FOUR_D6 } }, api);
    const sentence = await screen.findByText(/Your table gives the maximum on 1d8\.$/);
    expect(sentence).toHaveTextContent('8 hit points. Your table gives the maximum on 1d8.');
    expect(screen.queryByText(/You rolled 3/)).toBeNull();
  });

  it('adds the Constitution modifier to the maximum on the review step', async () => {
    const scores = { ...SCORES, con: 16 };
    const roll = { ...ROLL, scores, rolls: { ...ROLL.rolls, scores }, rules: FOUR_D6 };
    const api = wizardApi({
      rolls: {
        status: { class_id: 'fighter', rules: FOUR_D6, gold_rolled: true },
        hitPoints: { rolls: [3], hit_points: 10, maximized: true },
      },
    });
    api.getAbilityRoll.mockResolvedValue(roll);
    openOn({ step: 'review', roll }, api);
    const sentence = await screen.findByText(/Your table gives the maximum on 1d8/);
    expect(sentence).toHaveTextContent(
      '10 hit points. Your table gives the maximum on 1d8, +2 for Constitution.',
    );
  });

  it('offers Start again for a sub-par roll, outside the rerolls', async () => {
    const roll: AbilityRoll = {
      ...rollWith(0, 0),
      rules: { ...RULES, ability_score_rerolls: 0, sub_par_restart: true },
      rolls: { ...ROLL.rolls, sub_par: true },
    };
    const api = wizardApi();
    api.getAbilityRoll.mockResolvedValue(roll);
    const { user } = openOn({ step: 'roll', roll }, api);
    const again = await screen.findByRole('button', { name: 'Start again' });
    expect(again).toHaveAccessibleDescription('Sub-par');
    expect(screen.queryByRole('button', { name: 'Roll again' })).toBeNull();
    await user.click(again);
    expect(api.rollAbilities).toHaveBeenCalledWith(TABLE_ID);
  });

  it('lets a player start over from a sub-par roll with no rerolls left, at no cost', async () => {
    const roll: AbilityRoll = {
      ...rollWith(0, 0),
      rules: { ...RULES, ability_score_rerolls: 0, sub_par_restart: true },
      rolls: { ...ROLL.rolls, sub_par: true },
    };
    const api = wizardApi();
    api.getAbilityRoll.mockResolvedValue(roll);
    const { user } = openOn({ step: 'class', roll }, api);
    await user.click(await screen.findByRole('button', { name: 'Start over' }));
    expect(
      await screen.findByText(
        'This clears your ability scores and every choice so you can roll a new character.',
      ),
    ).toBeInTheDocument();
  });
});

describe('AdjustStep', () => {
  it("gates each control by bxapi's limits and shows each refusal next to its score", () => {
    const detail = catalog.details.magic_user as unknown as ClassDetail;
    const fixture = limitFixtures.magic_user_1832;
    const props = {
      scores: fixture.scores,
      onChange: vi.fn(),
      detail,
      tables: null,
      limits: { status: 'ready', limits: fixture.limits as AdjustmentLimits } as const,
      onRetry: () => {},
      classId: 'magic_user',
    };
    const { rerender } = renderWithTable(
      <AdjustStep {...props} adjustment={{ lowered: {}, raised: {} }} check={{ status: 'idle' }} />,
    );
    expect(screen.getByRole('button', { name: 'Lower Intelligence' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Lower Intelligence' })).toHaveAccessibleDescription(
      "Intelligence is a prime requisite, so it can't be lowered.",
    );
    expect(screen.getByRole('button', { name: 'Lower Strength' })).toBeEnabled();
    // bxapi's answer to an elf that lowers Wisdom by 4 and raises Strength by 1, captured in adjust-trades.json.
    const captured = trades.cases.find((c) => c.label === 'elf lowers Wisdom by 4 and raises Strength by 1');
    if (captured === undefined) throw new Error('No captured elf trade.');
    rerender(
      <AdjustStep
        {...props}
        scores={captured.scores}
        detail={trades.details.elf as unknown as ClassDetail}
        classId="elf"
        limits={{ status: 'loading' }}
        adjustment={captured.adjustment}
        check={explainAdjustCheck(
          {
            type: 'about:blank',
            title: 'Unprocessable Entity',
            status: 422,
            code: 'character_invalid',
            detail: 'The ability adjustment breaks the rules.',
            rejections: captured.rejections,
          },
          'elf',
        )}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Lowering Wisdom by 4 takes it below the lowest score a trade allows.',
    );
  });
});
