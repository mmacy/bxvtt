import { randomBytes } from 'node:crypto';
import type { RefereeView } from '@bxvtt/shared/bxapi';
import type { PlayerView, SceneTarget } from '@bxvtt/shared/protocol';
import type { Database } from '../db';
import { num, str } from '../db';
import { ApiError } from '../errors';

/** The prefix of every target handle. */
const HANDLE_PREFIX = 'tgt_';

/**
 * The fields of a command or a declaration that can name a monster: lists of targets, or one target. The
 * classifier finds them in each command's schema by these names. The command schemas name monster targets only
 * in `cast_spell.targets`, `use_item.targets`, `use_item.target_id`, and `BattleDeclaration.targets`.
 */
export const TARGET_FIELD_NAMES: readonly string[] = ['targets', 'target_id'];

/** The monsters of a session that have handles: each handle's monster, and each monster's handle. */
export interface TargetBook {
  /** The handles the scene lists now, by handle: the monsters a party member can single out. */
  current: Map<string, string>;
  /** Every handle of the session, by monster ID, for naming a monster in what a player receives. */
  byMonster: Map<string, string>;
  /** Every monster ID of the session, with a handle or without. */
  monsterIds: Set<string>;
  /** The scene's targets. */
  targets: SceneTarget[];
}

/** An empty book, for a game outside an encounter. */
export function emptyTargetBook(): TargetBook {
  return { current: new Map(), byMonster: new Map(), monsterIds: new Set(), targets: [] };
}

/** Writes the first letter of a label in capitals. */
function capitalize(label: string): string {
  return label.length === 0 ? 'Monster' : label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Gives each monster the party can single out in the open encounter an opaque handle, and lists the scene's
 * targets. A handle and its number are stored the first time the party can see the monster, so they stay the
 * same for the rest of the encounter, across a restart of the server, and when the monster moves to another
 * group.
 *
 * A monster can be singled out when its group is in the player view and the monster isn't invisible. A slain
 * monster and the monsters of a fled group keep their handles and are marked.
 *
 * @param db - The database.
 * @param tableId - The table ID.
 * @param sessionId - The session ID.
 * @param view - The player view.
 * @param refereeView - The referee view at the same revision, for each group's monster IDs.
 */
export function syncTargets(
  db: Database,
  tableId: string,
  sessionId: string,
  view: PlayerView,
  refereeView: Pick<RefereeView, 'encounter' | 'monsters'>,
): TargetBook {
  const book = emptyTargetBook();
  for (const row of db.all('SELECT monster_id, handle FROM target_handles WHERE session_id = ?', sessionId)) {
    book.byMonster.set(str(row, 'monster_id'), str(row, 'handle'));
  }
  for (const monster of refereeView.monsters) book.monsterIds.add(monster.id);
  const encounter = refereeView.encounter;
  const seen = view.encounter;
  if (encounter == null || seen == null) return book;
  const firstGroup = encounter.groups[0]?.id ?? '';
  const encounterKey = `${encounter.started_round}:${firstGroup}`;
  const monsters = new Map(refereeView.monsters.map((monster) => [monster.id, monster]));
  db.transaction(() => {
    for (const group of seen.groups) {
      const source = encounter.groups.find((candidate) => candidate.id === group.id);
      if (source === undefined) continue;
      for (const monsterId of source.monster_ids) {
        const monster = monsters.get(monsterId);
        if (monster === undefined) continue;
        const conditions = new Set(monster.conditions.map((condition) => condition.condition));
        if (conditions.has('invisible')) continue;
        let row = db.get(
          'SELECT handle, label, number FROM target_handles WHERE session_id = ? AND monster_id = ?',
          sessionId,
          monsterId,
        );
        if (row === undefined) {
          const label = source.label;
          const last = db.get(
            `SELECT max(number) AS n FROM target_handles
             WHERE session_id = ? AND encounter_key = ? AND label = ?`,
            sessionId,
            encounterKey,
            label,
          );
          const number = (last === undefined || last.n === null ? 0 : num(last, 'n')) + 1;
          const handle = HANDLE_PREFIX + randomBytes(12).toString('base64url');
          db.run(
            `INSERT INTO target_handles (table_id, session_id, encounter_key, monster_id, handle, label, number)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            tableId,
            sessionId,
            encounterKey,
            monsterId,
            handle,
            label,
            number,
          );
          book.byMonster.set(monsterId, handle);
          row = { handle, label, number };
        }
        const handle = str(row, 'handle');
        const number = num(row, 'number');
        book.current.set(handle, monsterId);
        book.targets.push({
          handle,
          group_id: group.id,
          label: str(row, 'label'),
          number,
          defeated: conditions.has('dead'),
          fled: group.fled,
        });
      }
    }
  });
  // A monster alone with its label reads by the label: `Mag Corrie`, or `Ogre`. Two or more with one label read
  // with their numbers: `Goblin 1`, `Goblin 2`. When a second one joins, the first one's label gains its number,
  // and its handle stays the same.
  const shared = new Map<string, number>();
  for (const row of db.all(
    'SELECT label, count(*) AS n FROM target_handles WHERE session_id = ? AND encounter_key = ? GROUP BY label',
    sessionId,
    encounterKey,
  )) {
    shared.set(str(row, 'label'), num(row, 'n'));
  }
  for (const target of book.targets) {
    const name = capitalize(target.label);
    target.label = (shared.get(target.label) ?? 1) > 1 ? `${name} ${target.number}` : name;
  }
  return book;
}

/** Whether a string is shaped like a target handle. */
export function isHandle(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(HANDLE_PREFIX);
}

/**
 * Replaces the target handles in the target fields of a command or a declaration with monster IDs. Member IDs,
 * monster IDs, and cell references pass through unchanged.
 *
 * @param body - The command or the declaration, which this doesn't change.
 * @param fields - The fields that can name a target.
 * @param book - The session's handles.
 * @param path - The path of `body` in the request, for the problem's `field`, such as `command`.
 * @returns A copy with monster IDs.
 * @throws ApiError `target_unknown` for a handle the scene doesn't list now.
 */
export function resolveHandles<T extends Record<string, unknown>>(
  body: T,
  fields: readonly string[],
  book: TargetBook,
  path: string,
): T {
  const copy: Record<string, unknown> = { ...body };
  const resolve = (value: unknown, field: string): unknown => {
    if (!isHandle(value)) return value;
    const monsterId = book.current.get(value);
    if (monsterId === undefined) {
      throw new ApiError(
        'target_unknown',
        "That target isn't one the party can single out now. Pick a target from the scene again.",
        { field, id: value },
      );
    }
    return monsterId;
  };
  for (const field of fields) {
    const value = copy[field];
    const name = path === '' ? field : `${path}.${field}`;
    if (Array.isArray(value)) copy[field] = value.map((entry) => resolve(entry, name));
    else copy[field] = resolve(value, name);
  }
  return copy as T;
}

/**
 * Replaces each monster ID that has a handle with the handle, anywhere in a value, so a rejection, a refusal, or
 * a declaration that a player receives names a monster only by handle.
 *
 * @param value - A rejection's params, a declaration, or any JSON value. It isn't changed.
 * @param book - The session's handles.
 * @returns A copy with handles.
 */
export function toHandles<T>(value: T, book: TargetBook): T {
  if (book.byMonster.size === 0) return value;
  const swap = (current: unknown): unknown => {
    if (typeof current === 'string') return book.byMonster.get(current) ?? current;
    if (Array.isArray(current)) return current.map(swap);
    if (typeof current === 'object' && current !== null) {
      return Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, swap(entry)]));
    }
    return current;
  };
  return swap(value) as T;
}

/**
 * Makes a value safe to send a player: each monster ID becomes its handle, and a monster ID with no handle, such
 * as an invisible monster a referee aimed at, leaves its list or becomes `null`.
 *
 * @param value - A declaration, a refusal, or any JSON value. It isn't changed.
 * @param book - The session's handles.
 * @returns A copy that names no monster by ID.
 */
export function withoutMonsterIds<T>(value: T, book: TargetBook): T {
  const handled = toHandles(value, book);
  if (book.monsterIds.size === 0) return handled;
  const hidden = (entry: unknown) => typeof entry === 'string' && book.monsterIds.has(entry);
  const strip = (current: unknown): unknown => {
    if (hidden(current)) return null;
    if (Array.isArray(current)) return current.filter((entry) => !hidden(entry)).map(strip);
    if (typeof current === 'object' && current !== null) {
      return Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, strip(entry)]));
    }
    return current;
  };
  return strip(handled) as T;
}
