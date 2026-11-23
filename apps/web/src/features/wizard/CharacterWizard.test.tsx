import { BxvttProblemError } from '@bxvtt/shared/client';
import type {
  CharacterCheckRequest,
  CharacterRequest,
  Problem,
  StartingRolls,
  StartingRollsStatus,
  StoredCharacter,
} from '@bxvtt/shared/protocol';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import catalog from './__fixtures__/catalog.json';
import stored from './__fixtures__/stored.json';
import type { ClassDetail } from '@/app';
import { AdjustStep } from './AdjustStep';
import { CharacterWizard } from './CharacterWizard';
import { draftKey, emptyDraft, type WizardDraft } from './draft';

const ROLL = {
  id: 'rol_test',
  scores: { str: 15, int: 9, wis: 10, dex: 12, con: 11, cha: 8 },
  eligible_class_ids: ['fighter', 'dwarf', 'magic_user'],
  used: false,
  created_at: '2026-11-21T00:00:00Z',
};

/** The dice the fake server rolls: a 6 on the hit die, and 4, 6, and 1 for gold. */
const DICE = {
  hit_point_roll: { rolls: [6], hit_points: 6 },
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
    hp_reroll_at_first_level: null,
    gold_rolled: false,
    ...options.rolls?.status,
  };
  const hitPoints = options.rolls?.hitPoints ?? DICE.hit_point_roll;
  const answer = (): StartingRolls => ({
    class_id: server.class_id ?? '',
    hp_reroll_at_first_level: server.hp_reroll_at_first_level === true,
    hit_point_roll: hitPoints,
    gold_roll: server.gold_rolled ? DICE.gold_roll : null,
  });
  api.getStartingRolls.mockImplementation(async () => ({ ...server }));
  api.rollHitPoints.mockImplementation(async (_rollId, body) => {
    if (server.class_id === null) {
      server.class_id = body.class_id;
      server.hp_reroll_at_first_level = body.hp_reroll_at_first_level === true;
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

/** Opens the wizard on a stored draft. */
function openOn(draft: Partial<WizardDraft> & Record<string, unknown>, api: FakeApi) {
  localStorage.setItem(
    draftKey(null),
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
  it('walks from the roll to a stored character', async () => {
    const api = wizardApi();
    const onCreated = vi.fn();
    const { user } = renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={onCreated} />, {
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
    await user.type(await screen.findByRole('textbox', { name: /Name/ }), 'Wren');
    await user.click(screen.getByRole('radio', { name: /Lawful/ }));
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
    await waitFor(() =>
      expect(screen.getByText('Your character can afford and use this equipment.')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Continue/ }));

    expect(await screen.findByText('6 hit points')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Create character' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const body = api.createCharacter.mock.calls.at(-1)?.[0];
    expect(body).toMatchObject({
      name: 'Wren',
      class_id: 'fighter',
      alignment: 'lawful',
      ability_roll_id: 'rol_test',
      purchases: [{ item_id: 'sword' }],
    });
    expect(api.rollHitPoints).toHaveBeenCalledWith('rol_test', { class_id: 'fighter' });
    expect(await screen.findByText('Wren is ready')).toBeInTheDocument();
    expect(localStorage.getItem(draftKey(null))).toBeNull();
  });

  it('takes the player to the step a refusal belongs to', async () => {
    const api = wizardApi({
      refusal: invalid({
        rejections: [
          { code: 'items.equip.armour_not_allowed', params: { class: 'magic_user', item: 'leather' } },
        ],
      }),
      rolls: { status: { class_id: 'fighter', hp_reroll_at_first_level: false, gold_rolled: true } },
    });
    const { user } = openOn({ step: 'review' }, api);
    await user.click(await screen.findByRole('button', { name: 'Create character' }));
    expect(await screen.findByText('Check your starting equipment')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Outfit' })).toBeInTheDocument();
  });

  it('keeps the choices when the dialog closes and reopens', async () => {
    openOn({ step: 'identity' }, wizardApi());
    expect(await screen.findByText('Resumed your unfinished character')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Wren');
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
    expect(roll).toHaveAccessibleDescription(
      'Rolling hit points fixes your class as a fighter and keeps the reroll option off for these ability scores. You can still change your ability trade, identity, and equipment. To play another class after you roll, start over with new ability scores.',
    );
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
      rolls: { status: { class_id: 'fighter', hp_reroll_at_first_level: false, gold_rolled: true } },
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
        status: { class_id: 'fighter', hp_reroll_at_first_level: true, gold_rolled: false },
        hitPoints: { rolls: [1, 2, 5], hit_points: 5 },
      },
    });
    openOn({ step: 'hp_gold', hpReroll: true }, api);
    expect(
      await screen.findByRole('group', { name: 'Set aside by the reroll option: 1 and 2' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The reroll option set aside 1 and 2 and rolled again. You start with 5 hit points.'),
    ).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(api.rollHitPoints).toHaveBeenCalledWith('rol_test', {
      class_id: 'fighter',
      hp_reroll_at_first_level: true,
    });
  });

  it('sends a draft from the version that counted gold back to the rolls before the shop', async () => {
    openOn({ step: 'outfit', gold: { key: 'rol_test:fighter:plain', gp: 90 } }, wizardApi());
    expect(await screen.findByRole('button', { name: 'Roll hit points' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hit points and gold', level: 3 })).toBeInTheDocument();
  });
});

describe('the class step after the hit points are rolled', () => {
  it('shows the class as fixed and says how to play another', async () => {
    const api = wizardApi({
      rolls: { status: { class_id: 'dwarf', hp_reroll_at_first_level: true, gold_rolled: false } },
    });
    openOn({ step: 'class', classId: 'fighter', hpReroll: false }, api);
    expect(await screen.findByText('Your class is fixed as a dwarf')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You rolled hit points for these ability scores, which fixed your class and the reroll option. To play another class, select Start over and roll new ability scores.',
      ),
    ).toBeInTheDocument();
    // The server's record wins over the draft in this browser.
    const dwarf = await screen.findByRole('button', { name: 'Dwarf' });
    expect(dwarf).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fighter' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Fighter' })).toHaveAccessibleDescription(
      /^You rolled hit points for these ability scores/,
    );
    const reroll = screen.getByRole('checkbox', { name: 'Reroll a first hit die of 1 or 2' });
    expect(reroll).toBeChecked();
    expect(reroll).toBeDisabled();
  });
});

describe('AdjustStep', () => {
  it('gates only what the class entry states and shows each refusal next to its score', async () => {
    const detail = catalog.details.magic_user as unknown as ClassDetail;
    const onChange = vi.fn();
    const { rerender } = renderWithTable(
      <AdjustStep
        scores={{ str: 12, int: 12, wis: 12, dex: 12, con: 12, cha: 12 }}
        adjustment={{ lowered: {}, raised: {} }}
        onChange={onChange}
        detail={detail}
        tables={null}
        check={{ status: 'idle' }}
      />,
    );
    // The class entry lists Intelligence as the prime requisite, which the trade can't lower.
    expect(screen.getByRole('button', { name: 'Lower Intelligence' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Lower Intelligence' })).toHaveAccessibleDescription(
      "A magic-user can't lower Intelligence.",
    );
    // Nothing bxapi serves rules out lowering Dexterity, so the player may try and the engine answers.
    expect(screen.getByRole('button', { name: 'Lower Dexterity' })).toBeEnabled();
    rerender(
      <AdjustStep
        scores={{ str: 12, int: 12, wis: 12, dex: 12, con: 12, cha: 12 }}
        adjustment={{ lowered: { dex: 1 }, raised: {} }}
        onChange={onChange}
        detail={detail}
        tables={null}
        check={{
          status: 'invalid',
          sentences: [],
          byAbility: {
            dex: [
              "Dexterity can't be lowered. Only Strength, Intelligence, and Wisdom can be traded for points.",
            ],
          },
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent("Dexterity can't be lowered");
    expect(screen.queryByText(/even number/)).toBeNull();
  });
});
