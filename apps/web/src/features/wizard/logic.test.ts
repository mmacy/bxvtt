import type { AbilityTables, EquipmentSummary } from '@bxvtt/shared/bxapi';
import { BxvttProblemError } from '@bxvtt/shared/client';
import type { CharacterRequest, Problem } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import type { ClassDetail } from '@/app';
import { createFakeApi } from '@/app/testing/renderWithTable';
import catalog from './__fixtures__/catalog.json';
import { facesForScore } from './dice';
import { emptyDraft, goldKey, parseDraft, requestFromDraft, type WizardDraft } from './draft';
import { applyKit } from './kits';
import { suggestName } from './names';
import { DRY_RUN_SENTINEL, countGold, dryRun, explainCreationError, explainInvalid } from './server';
import { extraLanguageCount, headlineModifier, xpModifierFor, type Scores } from './tables';

const tables = catalog.abilities as unknown as AbilityTables;
const fighter = catalog.details.fighter as unknown as ClassDetail;
const equipment = catalog.equipment.items as EquipmentSummary[];

function problem(body: Partial<Problem>): BxvttProblemError {
  return new BxvttProblemError({
    type: 'about:blank',
    title: 'Unprocessable Entity',
    status: 422,
    code: 'character_invalid',
    detail: 'refused',
    ...body,
  } as Problem);
}

function draftWith(change: Partial<WizardDraft>): WizardDraft {
  return {
    ...emptyDraft(),
    roll: {
      id: 'rol_test',
      scores: { str: 13, int: 9, wis: 10, dex: 12, con: 11, cha: 8 },
      eligible_class_ids: ['fighter', 'dwarf'],
      used: false,
      created_at: '',
    },
    classId: 'fighter',
    ...change,
  };
}

describe('facesForScore', () => {
  it('returns three d6 faces that add up to every score from 3 to 18', () => {
    for (let score = 3; score <= 18; score += 1) {
      for (let salt = 0; salt < 6; salt += 1) {
        const faces = facesForScore(score, salt);
        expect(faces.reduce((a, b) => a + b, 0)).toBe(score);
        for (const face of faces) expect(face >= 1 && face <= 6).toBe(true);
      }
    }
  });
});

describe('requestFromDraft', () => {
  it('sends the roll, the trade, and only bought items to equip', () => {
    const body = requestFromDraft(
      draftWith({
        name: '  Wren ',
        alignment: 'lawful',
        adjustment: { lowered: { int: 2, wis: 0 }, raised: { str: 1 } },
        cart: [
          { itemId: 'sword', quantity: 1 },
          { itemId: 'torch', quantity: 2 },
        ],
        equip: ['sword', 'chainmail'],
      }),
    );
    expect(body).toEqual({
      name: 'Wren',
      class_id: 'fighter',
      alignment: 'lawful',
      ability_roll_id: 'rol_test',
      adjustment: { lowered: { int: 2 }, raised: { str: 1 } },
      purchases: [{ item_id: 'sword' }, { item_id: 'torch', quantity: 2 }],
      equip_item_ids: ['sword'],
    });
  });

  it('fills a placeholder identity and leaves the outfit out when asked', () => {
    const body = requestFromDraft(draftWith({ cart: [{ itemId: 'sword', quantity: 1 }] }), {
      withoutOutfit: true,
      placeholderIdentity: true,
    });
    expect(body.name).toBe('Adventurer');
    expect(body.purchases).toBeUndefined();
  });
});

describe('parseDraft', () => {
  it('keeps a stored draft and refuses damaged ones', () => {
    const draft = draftWith({ step: 'outfit', name: 'Wren', gold: { key: 'k', gp: 90 } });
    expect(parseDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(parseDraft({ version: 1, roll: { id: 'x', scores: { str: 3 } } })).toBeNull();
    expect(parseDraft('nonsense')).toBeNull();
  });

  it('ties the gold to the roll, the class, and the hit point rule', () => {
    expect(goldKey(draftWith({}))).toBe('rol_test:fighter:plain');
    expect(goldKey(draftWith({ hpReroll: true }))).toBe('rol_test:fighter:reroll');
    expect(goldKey(draftWith({ classId: null }))).toBeNull();
  });
});

describe('tables', () => {
  const scores: Scores = { str: 16, int: 9, wis: 10, dex: 12, con: 11, cha: 8 };
  it('reads the experience modifier from the class table', () => {
    expect(xpModifierFor(fighter, scores)).toBe(10);
    expect(xpModifierFor(fighter, { ...scores, str: 5 })).toBe(-20);
  });
  it('reads modifiers and languages from the ability tables', () => {
    expect(headlineModifier(tables, 'str', 16)).toBe(2);
    expect(headlineModifier(tables, 'int', 16)).toBeUndefined();
    expect(extraLanguageCount(tables, 16)).toBe(2);
  });
});

describe('applyKit', () => {
  it('buys in order while the gold lasts and falls back to a cheaper option', () => {
    const result = applyKit('fighter', equipment, 45);
    // Sword (10), then leather (20) because chainmail (40) no longer fits, then a shield (10).
    expect(result.cart.slice(0, 3)).toEqual([
      { itemId: 'sword', quantity: 1 },
      { itemId: 'leather', quantity: 1 },
      { itemId: 'shield', quantity: 1 },
    ]);
    expect(result.equip).toEqual(['sword', 'leather', 'shield']);
    const total = result.cart.reduce(
      (sum, line) => sum + (equipment.find((e) => e.id === line.itemId)?.cost_gp ?? 0) * line.quantity,
      0,
    );
    expect(total).toBeLessThanOrEqual(45);
  });
});

describe('suggestName', () => {
  it('suggests a name for the race that differs from the current one', () => {
    const name = suggestName('dwarf', 'Bardin Coalhand', 0);
    expect(name).not.toBe('Bardin Coalhand');
    expect(suggestName('unknown', '', 0.5).length).toBeGreaterThan(0);
  });
});

describe('dryRun and countGold', () => {
  const body: CharacterRequest = { name: 'Wren', class_id: 'fighter', alignment: 'lawful' };

  it('reads the extra equip refusal as every choice passing', async () => {
    const api = createFakeApi();
    api.createCharacter.mockRejectedValue(
      problem({ field: 'equip_item_ids', id: DRY_RUN_SENTINEL, index: 0 }),
    );
    await expect(dryRun(api, body)).resolves.toEqual({ kind: 'ok' });
    expect(api.createCharacter).toHaveBeenCalledWith({ ...body, equip_item_ids: [DRY_RUN_SENTINEL] });
  });

  it('finds the gold by halving the range of lots', async () => {
    const api = createFakeApi();
    const gold = 73;
    api.createCharacter.mockImplementation(async (request: CharacterRequest) => {
      const lots = request.purchases?.[0]?.quantity ?? 1;
      if (lots > gold) {
        throw problem({
          rejections: [
            { code: 'items.purchase.insufficient_funds', params: { item: 'torch', cost_gp: lots } },
          ],
        });
      }
      throw problem({ field: 'equip_item_ids', id: DRY_RUN_SENTINEL, index: 0 });
    });
    await expect(countGold(api, body, 'torch')).resolves.toEqual({ kind: 'gold', gp: 73 });
    expect(api.createCharacter.mock.calls.length).toBeLessThanOrEqual(12);
  });

  it('reports a choice that stops creation before the gold', async () => {
    const api = createFakeApi();
    api.createCharacter.mockRejectedValue(
      problem({ rejections: [{ code: 'magic.book.capacity_mismatch', params: {} }] }),
    );
    const result = await countGold(api, body, 'torch');
    expect(result.kind).toBe('invalid');
  });
});

describe('explaining refusals', () => {
  it('sends each refusal to the step that fixes it', () => {
    const step = (code: string) =>
      explainInvalid({ ...problem({}).problem, rejections: [{ code, params: {} }] }).step;
    expect(step('creation.class.requirements_not_met')).toBe('class');
    expect(step('creation.adjustment.points_mismatch')).toBe('adjust');
    expect(step('creation.languages.too_many')).toBe('identity');
    expect(step('magic.book.capacity_mismatch')).toBe('identity');
    expect(step('items.purchase.insufficient_funds')).toBe('outfit');
    expect(explainInvalid({ ...problem({}).problem, field: 'equip_item_ids', id: 'sword' }).step).toBe(
      'outfit',
    );
  });

  it('asks for a new roll when the roll is used', () => {
    const used = new BxvttProblemError({
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'ability_roll_used',
      detail: 'used',
    } as Problem);
    expect(explainCreationError(used).step).toBe('roll');
    expect(explainCreationError(new TypeError('offline')).step).toBeNull();
  });

  it('never shows a raw code', () => {
    const text = explainInvalid({
      ...problem({}).problem,
      rejections: [{ code: 'items.purchase.insufficient_funds', params: { item: 'chainmail', cost_gp: 40 } }],
    }).sentences.join(' ');
    expect(text).not.toMatch(/items\.|chainmail_|_/);
  });
});
