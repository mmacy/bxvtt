import type {
  CharacterCheck,
  CharacterCheckRequest,
  CharacterRequest,
  Problem,
  StoredCharacter,
  User,
} from '@bxvtt/shared/protocol';
import { BxapiProblem, toApiError } from './bxapi';
import type { BxapiProblemBody } from './bxapi';
import type { Context } from './context';
import { ApiError, problemBody } from './errors';

/**
 * The item a check asks bxapi to equip after every real choice. It isn't an equipment ID, so no purchase can
 * include it, and bxapi always stops creation at it with `character_invalid` (`field: "equip_item_ids"`).
 */
export const CHECK_SENTINEL = 'bxvtt-character-check';

/** The most lots one purchase may buy, as bxapi's `Purchase.quantity` allows. */
const MAX_LOTS = 10_000;
/** The most gold values the server keeps. Each is a few bytes. */
const MAX_GOLD_ENTRIES = 10_000;
/** The most probes one gold count sends. The search needs about three. */
const MAX_PROBES = 12;

/** An equipment item a gold probe can buy: its ID and its whole-gold-piece price per lot. */
interface Lot {
  id: string;
  cost: number;
}

/** What one probe found. */
type ProbeResult =
  /** The gold covered every purchase. */
  | { kind: 'covered' }
  /** The gold ran out at the purchase of this item. */
  | { kind: 'short'; itemId: string }
  /** A choice before the purchases broke a rule, so the gold can't be counted. */
  | { kind: 'invalid' };

/**
 * Counts a roll's starting gold by asking which of several purchases the gold covers. Each probe buys a known
 * amount first (`lo`, with a 1 gp item) and then a run of distinct items that each cost `step` more, so the
 * item where the gold runs out narrows the gold to one step. A few probes find the exact gold, whatever its range.
 *
 * @param lots - The items to buy, with whole-gold-piece prices.
 * @param probe - Sends one probe with these purchases.
 * @returns The gold in gold pieces, or `null` when a choice before the purchases breaks a rule.
 */
export async function countGold(
  lots: Lot[],
  probe: (purchases: { item_id: string; quantity: number }[]) => Promise<ProbeResult>,
): Promise<number | null> {
  const units = lots.filter((lot) => lot.cost === 1);
  const prefix = units[0];
  if (prefix === undefined) return null;
  const steps = lots.filter((lot) => lot.id !== prefix.id);
  // The gold is at least `lo`. Once a probe runs short, it is also less than `hi`.
  let lo = 0;
  let hi = 1024;
  let hiKnown = false;
  for (let attempt = 0; attempt < MAX_PROBES; attempt += 1) {
    if (hiKnown && hi - lo <= 1) return lo;
    if (lo > MAX_LOTS) return null;
    const width = hi - lo;
    // Pick the smallest step that splits the range into parts no wider than the step, with one distinct item
    // for each threshold. A known range must shrink, so its step stays below its width.
    let step = 0;
    let chosen: Lot[] = [];
    const largest = hiKnown ? width - 1 : width;
    for (let size = Math.max(1, Math.ceil(width / (steps.length + 1))); size <= largest; size += 1) {
      const usable = steps.filter((lot) => size % lot.cost === 0 && size / lot.cost <= MAX_LOTS);
      const needed = Math.max(1, Math.ceil(width / size) - 1);
      if (usable.length >= needed) {
        step = size;
        chosen = usable.slice(0, needed);
        break;
      }
    }
    if (chosen.length === 0) return null;
    const purchases = lo > 0 ? [{ item_id: prefix.id, quantity: lo }] : [];
    for (const lot of chosen) purchases.push({ item_id: lot.id, quantity: step / lot.cost });
    const result = await probe(purchases);
    if (result.kind === 'invalid') return null;
    if (result.kind === 'covered') {
      lo += chosen.length * step;
      if (!hiKnown || lo >= hi) {
        hiKnown = false;
        hi = Math.max(hi, lo * 4);
      }
      continue;
    }
    const index = chosen.findIndex((lot) => lot.id === result.itemId);
    if (index < 0) return null;
    hi = lo + (index + 1) * step;
    lo += index * step;
    hiKnown = true;
  }
  return null;
}

/** Whether a bxapi problem is the stop at the check's sentinel, at the index the check put it. */
function stoppedAtSentinel(body: BxapiProblemBody, index: number): boolean {
  return body.field === 'equip_item_ids' && body.id === CHECK_SENTINEL && body.index === index;
}

/**
 * Checks character choices against a stored ability roll without creating the character, and counts the roll's
 * starting gold.
 *
 * Why nothing is stored: bxapi's `POST /v1/characters` runs osrlib's creation steps in a fixed order (class,
 * adjustment, starting spells, hit points, extra languages, gold, purchases, then equipping) and stores the
 * character, marking the roll used, only after the last step passes. Its spec says that a `character_invalid`
 * failure stores nothing and leaves the roll unused. Every request this class sends ends `equip_item_ids` with
 * {@link CHECK_SENTINEL}, which no purchase includes, so the equipping step always fails at it after every real
 * choice has passed. The class also checks that the equipment catalog has no item with the sentinel's ID.
 */
export class CharacterChecker {
  private readonly gold = new Map<string, number>();
  private readonly counting = new Map<string, Promise<number | null>>();
  private lots: Lot[] | null = null;

  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Checks choices against a roll the user owns.
   *
   * @param user - The user, who owns the roll.
   * @param body - The choices, with `ability_roll_id`.
   * @param requestId - The request ID, for bxapi's log.
   * @throws ApiError `ability_roll_used`, `validation_error`, or a bxapi failure.
   */
  async check(user: User, body: CharacterCheckRequest, requestId: string): Promise<CharacterCheck> {
    const lots = await this.purchasable();
    const equip = [...(body.equip_item_ids ?? []), CHECK_SENTINEL];
    const stop = await this.dryRun(user, { ...body, equip_item_ids: equip }, requestId);
    const valid = stoppedAtSentinel(stop, equip.length - 1);
    const problem = valid ? null : toProblemDocument(stop, requestId);
    return { valid, problem, gold_gp: await this.goldFor(user, body, lots, requestId) };
  }

  /** The gold for a roll, class, and reroll option, counted once and then cached. */
  private async goldFor(
    user: User,
    body: CharacterCheckRequest,
    lots: Lot[],
    requestId: string,
  ): Promise<number | null> {
    const key = JSON.stringify([body.ability_roll_id, body.class_id, body.hp_reroll_at_first_level === true]);
    const known = this.gold.get(key);
    if (known !== undefined) return known;
    const running = this.counting.get(key);
    if (running !== undefined) return running;
    // The probes keep only the choices that come before the gold roll and can stop creation: the class and the
    // starting spells. The adjustment and the extra languages draw no dice, so leaving them out can't change
    // the gold, and it lets the gold be counted while one of them is still wrong.
    const base: CharacterRequest = {
      name: body.name,
      class_id: body.class_id,
      alignment: body.alignment,
      ability_roll_id: body.ability_roll_id,
      ...(body.starting_spell_ids === undefined ? {} : { starting_spell_ids: body.starting_spell_ids }),
      ...(body.hp_reroll_at_first_level === undefined
        ? {}
        : { hp_reroll_at_first_level: body.hp_reroll_at_first_level }),
    };
    const task = countGold(lots, async (purchases) => {
      const stop = await this.dryRun(
        user,
        { ...base, purchases, equip_item_ids: [CHECK_SENTINEL] },
        requestId,
      );
      if (stoppedAtSentinel(stop, 0)) return { kind: 'covered' };
      const rejections = Array.isArray(stop.rejections)
        ? (stop.rejections as { code?: unknown; params?: { item?: unknown } }[])
        : [];
      const funds = rejections.find((rejection) => rejection.code === 'items.purchase.insufficient_funds');
      if (funds !== undefined && typeof funds.params?.item === 'string') {
        return { kind: 'short', itemId: funds.params.item };
      }
      return { kind: 'invalid' };
    });
    this.counting.set(key, task);
    try {
      const gp = await task;
      if (gp !== null) {
        this.gold.set(key, gp);
        if (this.gold.size > MAX_GOLD_ENTRIES) {
          const oldest = this.gold.keys().next().value;
          if (oldest !== undefined) this.gold.delete(oldest);
        }
      }
      return gp;
    } finally {
      this.counting.delete(key);
    }
  }

  /**
   * Sends a creation request that must stop with `character_invalid`, and returns bxapi's problem.
   *
   * @throws ApiError for any other answer. If bxapi ever created a character, the server records it as the
   *   user's, so it isn't lost, and fails the check with `bxapi_error`.
   */
  private async dryRun(user: User, body: CharacterRequest, requestId: string): Promise<BxapiProblemBody> {
    let created: StoredCharacter;
    try {
      created = await this.ctx.bxapi.post<StoredCharacter>('/v1/characters', body, { requestId });
    } catch (error) {
      if (error instanceof BxapiProblem && error.code === 'character_invalid') return error.body;
      throw toApiError(error, { passNotFound: true });
    }
    this.ctx.db.run(
      'INSERT INTO characters (id, owner_user_id, name, class_id, level, max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      created.id,
      user.id,
      created.name,
      created.class_id,
      created.level,
      created.character.max_hp,
      created.created_at,
    );
    this.ctx.log.error(
      { character: created.id, user: user.id },
      'bxapi created a character during a check; the character check needs a fix',
    );
    throw new ApiError(
      'bxapi_error',
      'bxapi created the character instead of only checking it. It is in your character list.',
    );
  }

  /**
   * The equipment the gold probes can buy: every item with a whole-gold-piece price, cheapest first.
   *
   * @throws ApiError `internal_error` when the catalog has an item with the sentinel's ID.
   */
  private async purchasable(): Promise<Lot[]> {
    if (this.lots !== null) return this.lots;
    let page: { items: { id: string; cost_gp: number }[] };
    try {
      page = await this.ctx.rules.list<{ id: string; cost_gp: number }>('equipment');
    } catch (error) {
      throw toApiError(error);
    }
    if (page.items.some((item) => item.id === CHECK_SENTINEL)) {
      throw new ApiError('internal_error', 'The equipment catalog has an item with the check sentinel ID.');
    }
    this.lots = page.items
      .filter((item) => Number.isInteger(item.cost_gp) && item.cost_gp >= 1)
      .map((item) => ({ id: item.id, cost: item.cost_gp }))
      .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
    return this.lots;
  }
}

/** Turns bxapi's `character_invalid` problem into a bxvtt problem document with its extra members intact. */
function toProblemDocument(body: BxapiProblemBody, requestId: string): Problem {
  const {
    code,
    detail,
    status,
    type: _type,
    title: _title,
    request_id: _requestId,
    instance: _instance,
    ...extras
  } = body;
  return problemBody(status, code, detail, requestId, extras) as Problem;
}
