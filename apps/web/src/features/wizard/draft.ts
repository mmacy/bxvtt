/**
 * The wizard's choices, kept in this browser so a dialog closed by accident loses nothing, and the request body
 * that turns them into a character.
 */
import type { AbilityRoll, CharacterRequest } from '@bxvtt/shared/protocol';
import { ABILITIES, isAbility, readScores, type Ability, type Scores } from './tables';
import type { CartLine } from './kits';

/** The wizard's steps, in order. */
export const STEP_IDS = ['roll', 'class', 'adjust', 'identity', 'outfit', 'review'] as const;
/** A step of the wizard. */
export type StepId = (typeof STEP_IDS)[number];

/** An alignment as bxapi spells it. */
export type Alignment = 'lawful' | 'neutral' | 'chaotic';
export const ALIGNMENTS: readonly Alignment[] = ['lawful', 'neutral', 'chaotic'];

/** A trade of ability points: how many points to take off and add to each ability. */
export interface Adjustment {
  lowered: Partial<Record<Ability, number>>;
  raised: Partial<Record<Ability, number>>;
}

/** Everything the player chose so far. */
export interface WizardDraft {
  version: 1;
  step: StepId;
  roll: AbilityRoll | null;
  /** How many times the player rolled this session, to say so honestly on the roll step. */
  rolls: number;
  classId: string | null;
  hpReroll: boolean;
  adjustment: Adjustment;
  name: string;
  alignment: Alignment | null;
  languages: string[];
  spells: string[];
  cart: CartLine[];
  equip: string[];
  /** The starting gold the server reported for the choices in `key` (see {@link goldKey}). */
  gold: { key: string; gp: number } | null;
}

/** A draft with nothing chosen. */
export function emptyDraft(): WizardDraft {
  return {
    version: 1,
    step: 'roll',
    roll: null,
    rolls: 0,
    classId: null,
    hpReroll: false,
    adjustment: { lowered: {}, raised: {} },
    name: '',
    alignment: null,
    languages: [],
    spells: [],
    cart: [],
    equip: [],
    gold: null,
  };
}

/** Whether the adjustment trades any points. */
export function hasAdjustment(adjustment: Adjustment): boolean {
  return ABILITIES.some((a) => (adjustment.lowered[a] ?? 0) > 0 || (adjustment.raised[a] ?? 0) > 0);
}

/**
 * The scores after the player's trade, as the player arranged them. The server checks the trade; this only adds
 * and subtracts the points the player moved, to show the result.
 *
 * @param scores - The rolled scores.
 * @param adjustment - The trade.
 */
export function adjustedScores(scores: Scores, adjustment: Adjustment): Scores {
  const result = { ...scores };
  for (const ability of ABILITIES) {
    result[ability] =
      scores[ability] - (adjustment.lowered[ability] ?? 0) + (adjustment.raised[ability] ?? 0);
  }
  return result;
}

function cleanMap(map: Partial<Record<Ability, number>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const ability of ABILITIES) {
    const value = map[ability] ?? 0;
    if (value > 0) result[ability] = value;
  }
  return result;
}

/** Options for {@link requestFromDraft}. */
export interface RequestOptions {
  /** Leaves out the cart and the items to equip, to ask about the steps before the outfit. */
  withoutOutfit?: boolean;
  /** Fills a missing name and alignment, to check an early step before the player reaches the identity step. */
  placeholderIdentity?: boolean;
}

/**
 * The body of `POST /api/characters` for a draft.
 *
 * @param draft - The draft. It must have a roll and a class.
 * @param options - What to leave out or fill in.
 */
export function requestFromDraft(draft: WizardDraft, options: RequestOptions = {}): CharacterRequest {
  const name = draft.name.trim();
  const body: CharacterRequest = {
    name: name === '' && options.placeholderIdentity ? 'Adventurer' : name,
    class_id: draft.classId ?? '',
    alignment: draft.alignment ?? 'neutral',
  };
  if (draft.roll) body.ability_roll_id = draft.roll.id;
  if (hasAdjustment(draft.adjustment)) {
    body.adjustment = {
      lowered: cleanMap(draft.adjustment.lowered),
      raised: cleanMap(draft.adjustment.raised),
    };
  }
  if (draft.spells.length > 0) body.starting_spell_ids = [...draft.spells];
  if (draft.languages.length > 0) body.extra_languages = [...draft.languages];
  if (draft.hpReroll) body.hp_reroll_at_first_level = true;
  if (!options.withoutOutfit) {
    const purchases = draft.cart.filter((line) => line.quantity > 0);
    if (purchases.length > 0) {
      body.purchases = purchases.map((line) =>
        line.quantity === 1 ? { item_id: line.itemId } : { item_id: line.itemId, quantity: line.quantity },
      );
    }
    const bought = new Set(purchases.map((line) => line.itemId));
    const equip = draft.equip.filter((id) => bought.has(id));
    if (equip.length > 0) body.equip_item_ids = equip;
  }
  return body;
}

/**
 * The choices that decide the starting gold. bxapi rolls hit points and then gold from the roll's seed, so the
 * gold can change with the class (its hit die) and the hit point reroll rule.
 */
export function goldKey(draft: WizardDraft): string | null {
  if (!draft.roll || !draft.classId) return null;
  return `${draft.roll.id}:${draft.classId}:${draft.hpReroll ? 'reroll' : 'plain'}`;
}

// Storage ------------------------------------------------------------------------------------------------------

const STORAGE_PREFIX = 'bxvtt.wizard.';

/** The storage key of a user's draft. */
export function draftKey(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}${userId ?? 'anonymous'}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function abilityMap(value: unknown): Partial<Record<Ability, number>> {
  const result: Partial<Record<Ability, number>> = {};
  if (!isRecord(value)) return result;
  for (const [key, amount] of Object.entries(value)) {
    if (isAbility(key) && typeof amount === 'number' && amount > 0) result[key] = amount;
  }
  return result;
}

function readRoll(value: unknown): AbilityRoll | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const scores = readScores(isRecord(value.scores) ? (value.scores as Record<string, number>) : null);
  if (!scores) return null;
  return {
    id: value.id,
    scores,
    eligible_class_ids: stringList(value.eligible_class_ids),
    used: value.used === true,
    created_at: typeof value.created_at === 'string' ? value.created_at : '',
  };
}

/**
 * Reads a stored draft, checking each field, so a damaged or older entry starts a fresh draft.
 *
 * @param raw - The parsed JSON from storage.
 */
export function parseDraft(raw: unknown): WizardDraft | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const draft = emptyDraft();
  draft.roll = readRoll(raw.roll);
  if (draft.roll === null) return null;
  draft.step = STEP_IDS.find((id) => id === raw.step) ?? 'roll';
  draft.rolls = typeof raw.rolls === 'number' ? raw.rolls : 1;
  draft.classId = typeof raw.classId === 'string' ? raw.classId : null;
  draft.hpReroll = raw.hpReroll === true;
  if (isRecord(raw.adjustment)) {
    draft.adjustment = {
      lowered: abilityMap(raw.adjustment.lowered),
      raised: abilityMap(raw.adjustment.raised),
    };
  }
  draft.name = typeof raw.name === 'string' ? raw.name.slice(0, 100) : '';
  draft.alignment = ALIGNMENTS.find((a) => a === raw.alignment) ?? null;
  draft.languages = stringList(raw.languages);
  draft.spells = stringList(raw.spells);
  draft.cart = Array.isArray(raw.cart)
    ? raw.cart.flatMap((line: unknown) =>
        isRecord(line) && typeof line.itemId === 'string' && typeof line.quantity === 'number'
          ? [{ itemId: line.itemId, quantity: Math.max(1, Math.floor(line.quantity)) }]
          : [],
      )
    : [];
  draft.equip = stringList(raw.equip);
  if (isRecord(raw.gold) && typeof raw.gold.key === 'string' && typeof raw.gold.gp === 'number') {
    draft.gold = { key: raw.gold.key, gp: raw.gold.gp };
  }
  return draft;
}

/** Reads the user's stored draft, or `null`. */
export function loadDraft(userId: string | null | undefined): WizardDraft | null {
  try {
    const raw = globalThis.localStorage?.getItem(draftKey(userId));
    return raw ? parseDraft(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Stores the user's draft, or removes it with `null`. Storage that refuses is ignored. */
export function saveDraft(userId: string | null | undefined, draft: WizardDraft | null): void {
  try {
    if (draft === null || draft.roll === null) globalThis.localStorage?.removeItem(draftKey(userId));
    else globalThis.localStorage?.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    // Storage is full or blocked. The draft lives in memory while the page is open.
  }
}
