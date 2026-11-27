import type { AbilityTables, EquipmentSummary } from '@bxvtt/shared/bxapi';
import { BxvttProblemError } from '@bxvtt/shared/client';
import type { CharacterRequest, CreationRules, Problem } from '@bxvtt/shared/protocol';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClassDetail, EquipmentDetail } from '@/app';
import { createFakeApi } from '@/app/testing/renderWithTable';
import catalog from './__fixtures__/catalog.json';
import { continueBlock, type ContinueFacts } from './CharacterWizard';
import { autoEquip } from './OutfitStep';
import {
  draftKey,
  emptyDraft,
  hasDraft,
  legacyDraftKey,
  loadDraft,
  parseDraft,
  reconcileDraft,
  requestFromDraft,
  rollBelongsTo,
  saveDraft,
  startingRollRequest,
  type DraftRoll,
  type WizardDraft,
} from './draft';
import { abilityDice, offersNewScores, rerollOffer } from './RollStep';
import { applyKit } from './kits';
import { lotSentence, rowSummary } from './shop';
import { suggestName } from './names';
import { checkChoices, explainCreationError, explainInvalid, oneReasonPerAbility } from './server';
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

const SCORES = { str: 13, int: 9, wis: 10, dex: 12, con: 11, cha: 8 };

const RULES: CreationRules = {
  ability_score_method: '3d6',
  hp_reroll_at_first_level: true,
  max_hp_at_first_level: false,
  ability_score_rerolls: 2,
  sub_par_restart: false,
};

function draftWith(change: Partial<WizardDraft>): WizardDraft {
  return {
    ...emptyDraft(),
    roll: {
      id: 'rol_test',
      scores: SCORES,
      rolls: {
        scores: SCORES,
        rolls: {
          str: [6, 4, 3],
          int: [2, 3, 4],
          wis: [1, 4, 5],
          dex: [5, 5, 2],
          con: [3, 2, 6],
          cha: [1, 1, 6],
        },
        dropped: {},
        sub_par: false,
      },
      eligible_class_ids: ['fighter', 'dwarf'],
      used: false,
      created_at: '',
      table_id: 'tbl_test',
      ability_score_method: '3d6',
      rules: RULES,
      rerolls_left: 2,
    },
    classId: 'fighter',
    ...change,
  };
}

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

  it('fills only a missing name before the review step, with the chosen alignment', () => {
    const unnamed = draftWith({ name: '  ', alignment: 'chaotic' });
    expect(requestFromDraft(unnamed, { placeholderName: true })).toMatchObject({
      name: 'Adventurer',
      alignment: 'chaotic',
    });
    expect(requestFromDraft(draftWith({ name: 'Wren' }), { placeholderName: true }).name).toBe('Wren');
    // Creating the character sends the name as the player typed it.
    expect(requestFromDraft(unnamed).name).toBe('');
  });
});

describe('parseDraft', () => {
  it('keeps a stored draft and refuses damaged ones', () => {
    const draft = draftWith({ step: 'hp_gold', name: 'Wren' });
    expect(parseDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(parseDraft({ version: 1, roll: { id: 'x', scores: { str: 3 } } })).toBeNull();
    expect(parseDraft('nonsense')).toBeNull();
  });

  it('keeps a draft whose roll has no dice, or damaged dice, without them', () => {
    const draft = draftWith({ step: 'identity', name: 'Wren' });
    const stored = JSON.parse(JSON.stringify(draft)) as { roll: Record<string, unknown> };
    const { rolls: _dice, ...withoutDice } = stored.roll;
    const expected = { ...draft, roll: withoutDice };
    expect(parseDraft({ ...stored, roll: withoutDice })).toEqual(expected);
    const badFaces = { ...stored.roll, rolls: { scores: SCORES, rolls: { str: [6, 4, 7] } } };
    const parsed = parseDraft({ ...stored, roll: badFaces });
    expect(parsed).toEqual(expected);
    expect(parsed?.roll).not.toHaveProperty('rolls');
  });

  it('reads a draft from the version that kept a gold count, without the count', () => {
    const old = {
      ...draftWith({ step: 'outfit', name: 'Wren' }),
      gold: { key: 'rol_test:fighter:plain', gp: 90 },
    };
    const parsed = parseDraft(JSON.parse(JSON.stringify(old)));
    expect(parsed).toEqual(draftWith({ step: 'outfit', name: 'Wren' }));
    expect(parsed).not.toHaveProperty('gold');
  });
});

describe('drafts at a table', () => {
  beforeEach(() => localStorage.clear());

  it('keeps one draft for each table', () => {
    const draft = draftWith({ name: 'Wren' });
    saveDraft('usr_a', 'tbl_test', draft);
    expect(loadDraft('usr_a', 'tbl_test')).toEqual(draft);
    expect(loadDraft('usr_a', 'tbl_other')).toBeNull();
    expect(draftKey('usr_a', 'tbl_test')).not.toBe(draftKey('usr_a', 'tbl_other'));
    saveDraft('usr_a', 'tbl_test', null);
    expect(loadDraft('usr_a', 'tbl_test')).toBeNull();
  });

  it('takes the one draft from before tables once, and its roll belongs to no table', () => {
    const {
      table_id: _table,
      rules: _rules,
      rerolls_left: _left,
      ability_score_method: _method,
      ...old
    } = draftWith({ name: 'Wren' }).roll ?? ({} as DraftRoll);
    localStorage.setItem(
      legacyDraftKey('usr_a'),
      JSON.stringify({ ...draftWith({ name: 'Wren' }), roll: old }),
    );
    const loaded = loadDraft('usr_a', 'tbl_test');
    expect(loaded?.name).toBe('Wren');
    expect(loaded?.roll && rollBelongsTo(loaded.roll, 'tbl_test')).toBe(false);
    expect(localStorage.getItem(legacyDraftKey('usr_a'))).toBeNull();
    expect(loadDraft('usr_a', 'tbl_test')).toBeNull();
  });

  it('says whether a table has an unfinished character without touching the draft from before tables', () => {
    expect(hasDraft('usr_a', 'tbl_test')).toBe(false);
    saveDraft('usr_a', 'tbl_test', draftWith({}));
    expect(hasDraft('usr_a', 'tbl_test')).toBe(true);
    expect(hasDraft('usr_a', 'tbl_other')).toBe(false);
    expect(hasDraft('usr_b', 'tbl_test')).toBe(false);
    // A damaged entry, or one without a roll, is no unfinished character.
    localStorage.setItem(draftKey('usr_a', 'tbl_other'), JSON.stringify({ ...emptyDraft(), roll: null }));
    expect(hasDraft('usr_a', 'tbl_other')).toBe(false);
    localStorage.setItem(legacyDraftKey('usr_a'), JSON.stringify(draftWith({})));
    hasDraft('usr_a', 'tbl_other');
    expect(localStorage.getItem(legacyDraftKey('usr_a'))).not.toBeNull();
  });
});

describe('the reroll row', () => {
  const roll = draftWith({}).roll as DraftRoll;

  it('offers Roll again with the rerolls the server says are left, and none at a table that allows none', () => {
    expect(rerollOffer(roll)).toEqual({ kind: 'reroll', left: 2 });
    expect(rerollOffer({ ...roll, rerolls_left: 0 })).toEqual({ kind: 'reroll', left: 0 });
    expect(
      rerollOffer({ ...roll, rerolls_left: null, rules: { ...RULES, ability_score_rerolls: null } }),
    ).toEqual({ kind: 'reroll', left: null });
    const strict = { ...roll, rerolls_left: 0, rules: { ...RULES, ability_score_rerolls: 0 } };
    expect(rerollOffer(strict)).toEqual({ kind: 'none' });
    // A referee who allows rerolls after the roll brings the button back.
    expect(rerollOffer({ ...strict, rerolls_left: 1 })).toEqual({ kind: 'reroll', left: 1 });
  });

  it('offers Start again for a roll bxapi calls sub-par, only when the table allows it', () => {
    const subPar = {
      ...roll,
      rerolls_left: 0,
      rolls: { ...(roll.rolls as NonNullable<DraftRoll['rolls']>), sub_par: true },
    };
    expect(rerollOffer(subPar)).toEqual({ kind: 'reroll', left: 0 });
    const allowed = { ...subPar, rules: { ...RULES, sub_par_restart: true } };
    expect(rerollOffer(allowed)).toEqual({ kind: 'sub_par' });
    expect(offersNewScores(rerollOffer(allowed))).toBe(true);
    expect(offersNewScores(rerollOffer(subPar))).toBe(false);
  });

  it('lets the player roll new scores with rerolls left, no limit, or a sub-par roll to discard', () => {
    expect(offersNewScores(rerollOffer(roll))).toBe(true);
    expect(offersNewScores(rerollOffer({ ...roll, rerolls_left: 0 }))).toBe(false);
    expect(offersNewScores(rerollOffer({ ...roll, rerolls_left: null }))).toBe(true);
  });

  it('shows the dropped die bxapi named after the three that count', () => {
    expect(abilityDice([2, 6, 4], 1)).toEqual([
      { sides: 6, value: 2 },
      { sides: 6, value: 6 },
      { sides: 6, value: 4 },
      { sides: 6, value: 1, dropped: true },
    ]);
    expect(abilityDice([2, 6, 4], undefined)).toHaveLength(3);
  });
});

describe('reconcileDraft', () => {
  const none = { used: false, class_id: null, rules: RULES, gold_rolled: false };

  it("takes the class the server fixed, and clears the class's choices on a change", () => {
    const draft = draftWith({ classId: 'dwarf', spells: ['sleep'], languages: ['elvish'] });
    const fixed = reconcileDraft(draft, { ...none, class_id: 'fighter', gold_rolled: true });
    expect(fixed).toMatchObject({ classId: 'fighter', spells: [], languages: [] });
    const same = draftWith({ classId: 'fighter', spells: ['sleep'] });
    expect(reconcileDraft(same, { ...none, class_id: 'fighter', gold_rolled: true })).toBe(same);
  });

  it('returns to the hit points and gold step until both are rolled', () => {
    expect(reconcileDraft(draftWith({ step: 'outfit' }), none).step).toBe('hp_gold');
    expect(
      reconcileDraft(draftWith({ step: 'review' }), {
        ...none,
        class_id: 'fighter',
      }).step,
    ).toBe('hp_gold');
    const early = draftWith({ step: 'identity' });
    expect(reconcileDraft(early, none)).toBe(early);
  });

  it('asks for the rolls with the fixed class, whatever the draft says', () => {
    const draft = draftWith({ classId: 'dwarf', spells: ['sleep'] });
    expect(startingRollRequest(draft)).toEqual({
      class_id: 'dwarf',
      starting_spell_ids: ['sleep'],
    });
    expect(startingRollRequest(draft, { ...none, class_id: 'fighter' })).toEqual({
      class_id: 'fighter',
      starting_spell_ids: ['sleep'],
    });
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

describe('checkChoices', () => {
  it('asks the check route with the roll the choices name', async () => {
    const api = createFakeApi();
    api.checkCharacter.mockResolvedValue({ valid: true, problem: null });
    const body: CharacterRequest = {
      name: 'Wren',
      class_id: 'fighter',
      alignment: 'lawful',
      ability_roll_id: 'rol_test',
    };
    await expect(checkChoices(api, body)).resolves.toEqual({ valid: true, problem: null });
    expect(api.checkCharacter).toHaveBeenCalledWith(body);
    expect(api.createCharacter).not.toHaveBeenCalled();
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

  it('keeps a failure to store the character on the review step, under a title that names it', () => {
    const offline = explainCreationError(new TypeError('offline'), { name: 'Wren' });
    expect(offline).toMatchObject({ step: 'review', title: "Couldn't create Wren" });
    expect(offline.sentences.join(' ')).not.toMatch(/saved in this browser/);
  });

  it('sends a refused name to the review step, where the player names the character', () => {
    const refused = new BxvttProblemError({
      type: 'about:blank',
      title: 'Unprocessable Entity',
      status: 422,
      code: 'validation_error',
      detail: 'name',
    } as Problem);
    expect(explainCreationError(refused)).toMatchObject({
      step: 'review',
      title: 'Enter a valid character name',
    });
  });

  it('never shows a raw code', () => {
    const text = explainInvalid({
      ...problem({}).problem,
      rejections: [{ code: 'items.purchase.insufficient_funds', params: { item: 'chainmail', cost_gp: 40 } }],
    }).sentences.join(' ');
    expect(text).not.toMatch(/items\.|chainmail_|_/);
  });
});

describe('autoEquip', () => {
  it('puts on the first body armour, shield, and weapon, as a kit would', () => {
    const byId = new Map(
      [
        { id: 'plate_mail', item_type: 'armour', ac: 3, ac_bonus: null },
        { id: 'leather', item_type: 'armour', ac: 7, ac_bonus: null },
        { id: 'shield', item_type: 'armour', ac: null, ac_bonus: 1 },
        { id: 'sword', item_type: 'weapon' },
        { id: 'dagger', item_type: 'weapon' },
        { id: 'torch', item_type: 'gear' },
      ].map((d) => [d.id, d as unknown as EquipmentDetail]),
    );
    expect(autoEquip('plate_mail', [], byId)).toBe(true);
    expect(autoEquip('shield', ['plate_mail'], byId)).toBe(true);
    expect(autoEquip('leather', ['plate_mail', 'shield'], byId)).toBe(false);
    expect(autoEquip('sword', ['plate_mail'], byId)).toBe(true);
    expect(autoEquip('dagger', ['sword'], byId)).toBe(false);
    expect(autoEquip('torch', [], byId)).toBe(false);
  });
});

describe('oneReasonPerAbility', () => {
  it('drops the step-of-two advice for a score that cannot be lowered at all', () => {
    const kept = oneReasonPerAbility([
      { code: 'creation.adjustment.not_lowerable', params: { ability: 'dex' } },
      { code: 'creation.adjustment.reduction_not_even', params: { ability: 'dex', amount: 1 } },
      { code: 'creation.adjustment.points_mismatch', params: { points_available: 0, points_spent: 1 } },
    ]);
    expect(kept.map((r) => r.code)).toEqual([
      'creation.adjustment.not_lowerable',
      'creation.adjustment.points_mismatch',
    ]);
  });
});

describe('continueBlock', () => {
  const facts: ContinueFacts = {
    step: 'roll',
    rolled: true,
    eligible: ['fighter'],
    revealing: false,
    newScores: 'roll_again',
    classId: 'fighter',
    adjust: 'idle',
    goldRolled: true,
    gold: { status: 'known', gp: 110 },
    cart: 'ok',
  };

  it('says why each step blocks, and waits without a reason for the server or the dice', () => {
    expect(continueBlock({ ...facts, eligible: [] })).toEqual({
      reason: "These ability scores don't qualify for any class. Roll again.",
    });
    expect(continueBlock({ ...facts, eligible: [], newScores: 'none' })).toEqual({
      reason: "These ability scores don't qualify for any class. Ask the referee to allow another reroll.",
    });
    expect(continueBlock({ ...facts, eligible: [], newScores: 'start_again' })).toEqual({
      reason: "These ability scores don't qualify for any class. Start again.",
    });
    expect(continueBlock({ ...facts, eligible: [], revealing: true })).toEqual({ reason: null });
    expect(continueBlock({ ...facts, step: 'class', classId: null })).toEqual({
      reason: 'Choose a class first.',
    });
    expect(continueBlock({ ...facts, step: 'adjust', adjust: 'invalid' })).toEqual({
      reason: "This ability trade isn't allowed. Change it, or reset to your rolled scores.",
    });
    expect(continueBlock({ ...facts, step: 'adjust', adjust: 'checking' })).toEqual({ reason: null });
    const unknown = { status: 'unknown', message: 'Roll your starting gold first.' } as const;
    expect(continueBlock({ ...facts, step: 'outfit', gold: unknown })).toEqual({ reason: unknown.message });
    expect(continueBlock({ ...facts, step: 'outfit', cart: 'invalid' })).toEqual({
      reason: 'Change your cart as the note under it says.',
    });
    expect(continueBlock({ ...facts, step: 'outfit', cart: 'checking' })).toEqual({ reason: null });
  });

  it('lets the player continue from a finished step, and from a trade in progress so the step can say why not', () => {
    expect(continueBlock(facts)).toBeNull();
    expect(continueBlock({ ...facts, step: 'adjust', adjust: 'in_progress' })).toBeNull();
    expect(continueBlock({ ...facts, step: 'outfit' })).toBeNull();
    expect(continueBlock({ ...facts, step: 'identity' })).toBeNull();
  });
});

describe('lot phrases in the wizard shop', () => {
  it('words a lot as the town Outfitter does, with the total for several lots', () => {
    const torches = {
      item_type: 'gear',
      id: 'torch',
      name: 'Torches (6)',
      lot_size: 6,
    } as unknown as EquipmentDetail;
    const sword = { item_type: 'weapon', id: 'sword', name: 'Sword' } as unknown as EquipmentDetail;
    expect(lotSentence('torch', 'Torches (6)', torches, 1)).toBe('Comes as 6 torches');
    expect(lotSentence('torch', 'Torches (6)', torches, 2)).toBe('Comes as 12 torches');
    expect(lotSentence('sword', 'Sword', sword, 1)).toBeNull();
    expect(rowSummary('torch', 'Torches (6)', torches)).toBe('Comes as 6 torches');
  });
});
