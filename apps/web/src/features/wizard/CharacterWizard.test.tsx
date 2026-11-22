import { BxvttProblemError } from '@bxvtt/shared/client';
import type {
  CharacterCheckRequest,
  CharacterRequest,
  Problem,
  StoredCharacter,
} from '@bxvtt/shared/protocol';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { createFakeApi, renderWithTable, type FakeApi } from '@/app/testing/renderWithTable';
import catalog from './__fixtures__/catalog.json';
import stored from './__fixtures__/stored.json';
import type { ClassDetail } from '@/app';
import { AdjustStep } from './AdjustStep';
import { CharacterWizard } from './CharacterWizard';
import { draftKey, emptyDraft } from './draft';

const ROLL = {
  id: 'rol_test',
  scores: { str: 15, int: 9, wis: 10, dex: 12, con: 11, cha: 8 },
  eligible_class_ids: ['fighter', 'dwarf', 'magic_user'],
  used: false,
  created_at: '2026-11-21T00:00:00Z',
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

/** A fake API that serves the catalogs and answers checks with 60 gp of starting gold. */
function wizardApi(options: { refusal?: BxvttProblemError } = {}): FakeApi {
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
    if (lots > 60) {
      return {
        valid: false,
        gold_gp: 60,
        problem: invalid({
          rejections: [
            { code: 'items.purchase.insufficient_funds', params: { item: 'plate_mail', cost_gp: lots } },
          ],
        }).problem,
      };
    }
    if (options.refusal) {
      return { valid: false, gold_gp: 60, problem: options.refusal.problem };
    }
    return { valid: true, problem: null, gold_gp: 60 };
  });
  api.createCharacter.mockImplementation(async (request: CharacterRequest) => ({
    ...(stored as unknown as StoredCharacter),
    name: request.name,
  }));
  return api;
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

    // The wizard counts the gold the roll gives these choices before the shop opens.
    expect(await screen.findByText('60')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add Sword to the cart' }));
    await waitFor(() =>
      expect(screen.getByText('The shop and your class accept this outfit.')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Continue/ }));

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
    expect(api.checkCharacter).toHaveBeenCalled();
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
    });
    localStorage.setItem(
      draftKey(null),
      JSON.stringify({
        ...emptyDraft(),
        roll: ROLL,
        classId: 'fighter',
        name: 'Wren',
        alignment: 'lawful',
        step: 'review',
      }),
    );
    const { user } = renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
      api,
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    await user.click(await screen.findByRole('button', { name: 'Create character' }));
    expect(await screen.findByText('The shopping list needs a change')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Outfit' })).toBeInTheDocument();
  });

  it('keeps the choices when the dialog closes and reopens', async () => {
    localStorage.setItem(
      draftKey(null),
      JSON.stringify({ ...emptyDraft(), roll: ROLL, classId: 'fighter', step: 'identity', name: 'Wren' }),
    );
    renderWithTable(<CharacterWizard open onClose={() => {}} onCreated={() => {}} />, {
      api: wizardApi(),
      snapshot: fixtureSnapshot('lobby', 'player'),
      preferences: { motion: 'reduce' },
    });
    expect(await screen.findByText('Your character is where you left it')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveValue('Wren');
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
    expect(screen.getByRole('button', { name: 'Lower Intelligence' })).toBeDisabled();
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
