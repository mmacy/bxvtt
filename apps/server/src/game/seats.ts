import type { PlayerView, Seat } from '@bxvtt/shared/protocol';
import type { Database } from '../db';
import { str, strOrNull } from '../db';

/**
 * Reads the seats of a session in marching order.
 *
 * @param db - The database.
 * @param tableId - The table ID.
 * @param sessionId - The session ID.
 */
export function readSeats(db: Database, tableId: string, sessionId: string): Seat[] {
  return db
    .all(
      'SELECT * FROM seats WHERE table_id = ? AND session_id = ? ORDER BY position, member_id',
      tableId,
      sessionId,
    )
    .map((row) => ({
      member_id: str(row, 'member_id'),
      name: str(row, 'name'),
      user_id: strOrNull(row, 'user_id'),
    }));
}

/**
 * Writes the seats of a new session.
 *
 * @param db - The database.
 * @param tableId - The table ID.
 * @param sessionId - The session ID.
 * @param seats - The seats in marching order.
 */
export function writeSeats(db: Database, tableId: string, sessionId: string, seats: Seat[]): void {
  db.transaction(() => {
    db.run('DELETE FROM seats WHERE table_id = ? AND session_id = ?', tableId, sessionId);
    seats.forEach((seat, position) => {
      db.run(
        'INSERT INTO seats (table_id, session_id, member_id, user_id, name, position) VALUES (?, ?, ?, ?, ?, ?)',
        tableId,
        sessionId,
        seat.member_id,
        seat.user_id,
        seat.name,
        position,
      );
    });
  });
}

/**
 * Makes the seats match the party in a player view: a new member gets an empty seat, a member who left the
 * party loses theirs, and each seat takes the member's current name and place in the marching order.
 *
 * @param db - The database.
 * @param tableId - The table ID.
 * @param sessionId - The session ID.
 * @param view - The player view.
 * @returns Whether any seat changed.
 */
export function reconcileSeats(db: Database, tableId: string, sessionId: string, view: PlayerView): boolean {
  const current = readSeats(db, tableId, sessionId);
  const byMember = new Map(current.map((seat) => [seat.member_id, seat]));
  const next: Seat[] = view.party.map((member) => ({
    member_id: member.id,
    name: member.name,
    user_id: byMember.get(member.id)?.user_id ?? null,
  }));
  const same =
    next.length === current.length &&
    next.every(
      (seat, index) =>
        seat.member_id === current[index]?.member_id &&
        seat.name === current[index]?.name &&
        seat.user_id === current[index]?.user_id,
    );
  if (same) return false;
  writeSeats(db, tableId, sessionId, next);
  return true;
}

/**
 * Builds the seats of a new game from the roster and the session's first player view. bxapi numbers the members
 * in marching order, so `character-0001` should be the first roster entry. The function checks each member's
 * name against the roster entry at the same place, and falls back to matching names when the order differs.
 *
 * @param roster - The roster entries in marching order: the character's name and its owner.
 * @param view - The session's first player view.
 * @returns The seats, and whether the order matched the roster.
 */
export function seatsFromRoster(
  roster: { name: string; owner_user_id: string }[],
  view: PlayerView,
): { seats: Seat[]; matchedByOrder: boolean } {
  const matchedByOrder =
    roster.length === view.party.length &&
    view.party.every((member, index) => member.name === roster[index]?.name);
  if (matchedByOrder) {
    return {
      seats: view.party.map((member, index) => ({
        member_id: member.id,
        name: member.name,
        user_id: roster[index]?.owner_user_id ?? null,
      })),
      matchedByOrder,
    };
  }
  const unused = [...roster];
  const seats = view.party.map((member) => {
    const index = unused.findIndex((entry) => entry.name === member.name);
    const entry = index >= 0 ? unused.splice(index, 1)[0] : undefined;
    return { member_id: member.id, name: member.name, user_id: entry?.owner_user_id ?? null };
  });
  return { seats, matchedByOrder };
}

/**
 * Copies the seat owners of one session to another by member ID, for a restored save.
 *
 * @param db - The database.
 * @param tableId - The table ID.
 * @param fromSessionId - The session the save came from.
 * @param toSessionId - The new session.
 * @param view - The new session's player view.
 */
export function copySeats(
  db: Database,
  tableId: string,
  fromSessionId: string,
  toSessionId: string,
  view: PlayerView,
): void {
  const owners = new Map(readSeats(db, tableId, fromSessionId).map((seat) => [seat.member_id, seat.user_id]));
  const members = new Set(
    db.all('SELECT user_id FROM members WHERE table_id = ?', tableId).map((row) => str(row, 'user_id')),
  );
  writeSeats(
    db,
    tableId,
    toSessionId,
    view.party.map((member) => {
      const owner = owners.get(member.id) ?? null;
      return {
        member_id: member.id,
        name: member.name,
        user_id: owner !== null && members.has(owner) ? owner : null,
      };
    }),
  );
}
