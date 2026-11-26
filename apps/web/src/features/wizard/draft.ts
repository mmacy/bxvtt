/**
 * The wizard's choices, kept in this browser so a dialog closed by accident loses nothing, and the request body
 * that turns them into a character.
 */
import {
  CreationRules,
  type AbilityRoll,
  type CharacterRequest,
  type StartingRollRequest,
  type StartingRollsStatus,
} from '@bxvtt/shared/protocol';
import { ABILITIES, isAbility, readScores, type Ability, type Scores } from './tables';
import type { CartLine } from './kits';

/**
 * The wizard's steps, in order. The hit points and gold come after the identity, because an arcane caster's
 * first spell is chosen there and bxapi checks it before it rolls hit points, and before the outfit, because the
 * player shops with the gold.
 */
export const STEP_IDS = ['roll', 'class', 'adjust', 'identity', 'hp_gold', 'outfit', 'review'] as const;
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

/**
 * The ability roll a draft holds, as the server answered it. A stored draft can lack some members:
 *
 * - `rolls`, the dice behind each score, is absent when the stored dice are damaged. The wizard fetches the roll
 *   again, and the draft keeps its scores until the dice arrive.
 * - `table_id`, `rules`, `rerolls_left`, and `ability_score_method` are absent for a roll made before ability rolls
 *   belonged to a table. The wizard can't continue such a roll, so the player rolls again.
 */
export type DraftRoll = Omit<
  AbilityRoll,
  'rolls' | 'table_id' | 'rules' | 'rerolls_left' | 'ability_score_method'
> &
  Partial<Pick<AbilityRoll, 'rolls' | 'table_id' | 'rules' | 'rerolls_left' | 'ability_score_method'>>;

/**
 * Everything the player chose so far. The draft holds no rolled hit points or gold: the server keeps which rolls
 * the player made, and the wizard reads them from it. A draft from an older version that has a `gold` member
 * reads the same way, without it.
 */
export interface WizardDraft {
  version: 1;
  step: StepId;
  roll: DraftRoll | null;
  classId: string | null;
  adjustment: Adjustment;
  name: string;
  alignment: Alignment | null;
  languages: string[];
  spells: string[];
  cart: CartLine[];
  equip: string[];
}

/** A draft with nothing chosen. */
export function emptyDraft(): WizardDraft {
  return {
    version: 1,
    step: 'roll',
    roll: null,
    classId: null,
    adjustment: { lowered: {}, raised: {} },
    name: '',
    alignment: null,
    languages: [],
    spells: [],
    cart: [],
    equip: [],
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
    ability_roll_id: draft.roll?.id ?? '',
  };
  if (hasAdjustment(draft.adjustment)) {
    body.adjustment = {
      lowered: cleanMap(draft.adjustment.lowered),
      raised: cleanMap(draft.adjustment.raised),
    };
  }
  if (draft.spells.length > 0) body.starting_spell_ids = [...draft.spells];
  if (draft.languages.length > 0) body.extra_languages = [...draft.languages];
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
 * The body of `POST /api/ability-rolls/{roll_id}/hit-points` and `.../gold` for a draft: the class and an arcane
 * caster's first spell, which are the choices the hit points and the gold depend on. The rules recorded on the roll
 * decide the rest.
 *
 * @param draft - The draft. It must have a class, unless `status` fixes one.
 * @param status - The server's record of the roll. When the hit points are rolled, its class replaces the draft's.
 */
export function startingRollRequest(
  draft: WizardDraft,
  status: StartingRollsStatus | null = null,
): StartingRollRequest {
  const fixed = status?.class_id ?? null;
  const body: StartingRollRequest = { class_id: fixed ?? draft.classId ?? '' };
  if (draft.spells.length > 0) body.starting_spell_ids = [...draft.spells];
  return body;
}

/**
 * Brings a draft in line with the server's record of its roll. The draft lives in the browser and the record on
 * the server, so the record wins: once the hit points are rolled, the draft takes their class, and a draft on a
 * step after the hit points and gold returns to that step until both are rolled. A change of class also clears
 * the choices that depend on the class, as choosing another class does.
 *
 * @param draft - The draft.
 * @param status - The server's record of the draft's roll.
 * @returns The same draft when nothing changes.
 */
export function reconcileDraft(draft: WizardDraft, status: StartingRollsStatus): WizardDraft {
  let next = draft;
  const fixed = status.class_id;
  if (fixed !== null && draft.classId !== fixed) {
    next = {
      ...next,
      classId: fixed,
      adjustment: { lowered: {}, raised: {} },
      spells: [],
      languages: [],
    };
  }
  const rolled = fixed !== null && status.gold_rolled;
  if (!rolled && STEP_IDS.indexOf(next.step) > STEP_IDS.indexOf('hp_gold'))
    next = { ...next, step: 'hp_gold' };
  return next;
}

// Storage ------------------------------------------------------------------------------------------------------

const STORAGE_PREFIX = 'bxvtt.wizard.';

/**
 * The storage key of a user's draft at a table. Each table has its own draft, because an ability roll belongs to
 * the table it was rolled at.
 */
export function draftKey(userId: string | null | undefined, tableId: string): string {
  return `${STORAGE_PREFIX}${userId ?? 'anonymous'}.${tableId}`;
}

/** The storage key of a user's one draft from before drafts belonged to a table. */
export function legacyDraftKey(userId: string | null | undefined): string {
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

/**
 * Reads the three d6 results that count towards each ability from a stored roll, or `null` when one is missing
 * or malformed.
 */
function readDice(value: unknown): AbilityRoll['rolls']['rolls'] | null {
  if (!isRecord(value)) return null;
  const dice: AbilityRoll['rolls']['rolls'] = {};
  for (const ability of ABILITIES) {
    const faces = value[ability];
    if (
      !Array.isArray(faces) ||
      faces.length !== 3 ||
      !faces.every((face) => typeof face === 'number' && Number.isInteger(face) && face >= 1 && face <= 6)
    ) {
      return null;
    }
    dice[ability] = [faces[0] as number, faces[1] as number, faces[2] as number];
  }
  return dice;
}

/**
 * Reads a stored ability roll. A roll saved before bxapi returned the dice has no `rolls` member, or a damaged
 * one. The result then has no `rolls` and the wizard fetches the dice again.
 */
function readRoll(value: unknown): DraftRoll | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const scores = readScores(isRecord(value.scores) ? (value.scores as Record<string, number>) : null);
  if (!scores) return null;
  const roll: DraftRoll = {
    id: value.id,
    scores,
    eligible_class_ids: stringList(value.eligible_class_ids),
    used: value.used === true,
    created_at: typeof value.created_at === 'string' ? value.created_at : '',
  };
  if (isRecord(value.rolls)) {
    const totals = readScores(
      isRecord(value.rolls.scores) ? (value.rolls.scores as Record<string, number>) : null,
    );
    const dice = readDice(value.rolls.rolls);
    if (totals && dice) {
      roll.rolls = {
        scores: totals,
        rolls: dice,
        dropped: readDropped(value.rolls.dropped),
        sub_par: value.rolls.sub_par === true,
      };
    }
  }
  if (typeof value.table_id === 'string') roll.table_id = value.table_id;
  const rules = CreationRules.safeParse(value.rules);
  if (rules.success) roll.rules = rules.data;
  if (value.rerolls_left === null || (typeof value.rerolls_left === 'number' && value.rerolls_left >= 0)) {
    roll.rerolls_left = value.rerolls_left;
  }
  const method = CreationRules.shape.ability_score_method.safeParse(value.ability_score_method);
  if (method.success) roll.ability_score_method = method.data;
  return roll;
}

/** Reads the dropped die of each ability from a stored roll. A die that isn't a d6 face is left out. */
function readDropped(value: unknown): Record<string, number> {
  const dropped: Record<string, number> = {};
  if (!isRecord(value)) return dropped;
  for (const ability of ABILITIES) {
    const face = value[ability];
    if (typeof face === 'number' && Number.isInteger(face) && face >= 1 && face <= 6) dropped[ability] = face;
  }
  return dropped;
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
  draft.classId = typeof raw.classId === 'string' ? raw.classId : null;
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
  return draft;
}

function readStored(key: string): WizardDraft | null {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? parseDraft(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/**
 * Reads the user's stored draft at a table, or `null`. Without one, it takes the user's draft from before drafts
 * belonged to a table, once, and removes it from storage. That draft's roll has no table, so the wizard can't
 * continue it.
 *
 * @param userId - The user.
 * @param tableId - The table the wizard is open at.
 */
export function loadDraft(userId: string | null | undefined, tableId: string): WizardDraft | null {
  const draft = readStored(draftKey(userId, tableId));
  if (draft !== null) return draft;
  const legacy = readStored(legacyDraftKey(userId));
  try {
    globalThis.localStorage?.removeItem(legacyDraftKey(userId));
  } catch {
    // Blocked storage keeps the old draft. It never loads at a table, so it does no harm.
  }
  return legacy;
}

/**
 * Whether the wizard at a table can continue a draft's roll: the roll was made at that table, so the server keeps
 * its recorded rules.
 *
 * @param roll - The draft's roll.
 * @param tableId - The table the wizard is open at.
 */
export function rollBelongsTo(roll: DraftRoll, tableId: string): boolean {
  return roll.table_id === tableId;
}

/** Stores the user's draft at a table, or removes it with `null`. Storage that refuses is ignored. */
export function saveDraft(
  userId: string | null | undefined,
  tableId: string,
  draft: WizardDraft | null,
): void {
  try {
    if (draft === null || draft.roll === null) globalThis.localStorage?.removeItem(draftKey(userId, tableId));
    else globalThis.localStorage?.setItem(draftKey(userId, tableId), JSON.stringify(draft));
  } catch {
    // Storage is full or blocked. The draft lives in memory while the page is open.
  }
}
