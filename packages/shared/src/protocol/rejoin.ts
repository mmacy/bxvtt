import { z } from 'zod';
import { Role, TableId, Timestamp, UserColor, UserId } from './common';
import { User } from './users';

/**
 * Rejoining a table as an existing member, approved by a referee.
 *
 * A browser keeps a user's token for one address. When the server's public address changes, as a quick tunnel's
 * does each run, a returning player arrives with no token and would become a new user. Instead, the player asks
 * to rejoin as the member they were, and a referee who knows who is at the table approves:
 *
 * 1. With the invite code and no token, the visitor calls `POST /api/rejoin/lookup` and reads the table's name
 *    and the members who are offline ({@link RejoinLookup}).
 * 2. The visitor picks one and calls `POST /api/rejoin` ({@link CreateRejoinRequest}). The server makes a pending
 *    request that lasts a few minutes, and tells the table's referees with a `rejoin_requests` message. The
 *    visitor keeps the {@link RejoinTicket}, whose `secret` only it has.
 * 3. The visitor polls `POST /api/rejoin/{request_id}/status` with the secret ({@link RejoinStatus}) every few
 *    seconds. A request with no poll for 20 seconds is abandoned. `POST /api/rejoin/{request_id}/cancel` ends it at
 *    once, also from `navigator.sendBeacon` on a closing page.
 * 4. A referee approves with `POST /api/tables/{table_id}/rejoin-requests/{request_id}/approve`, or declines.
 * 5. The visitor's next poll claims the approval: only then does the server give the existing user a new token,
 *    which that answer carries once, and retire the old token everywhere. An approval nobody claims soon lapses,
 *    and the old token keeps working. The member's seats, characters, and roles stay theirs. A browser that still
 *    presents the retired token gets 401 `token_retired`.
 *
 * A referee can't approve a request for themselves, so reclaiming a referee needs another referee. A request ends
 * when it's declined, when it expires, or when the member comes online. The host of a table keeps their own
 * sign-in by opening the server at its stable local address, `http://127.0.0.1:<port>`, so the last referee is
 * never the one who needs this.
 */

/** Body of `POST /api/rejoin/lookup`. Needs no token. Counts as an invite code attempt. */
export const RejoinLookupRequest = z.strictObject({
  invite_code: z.string().min(1).max(64),
});
/** Body of `POST /api/rejoin/lookup`. */
export type RejoinLookupRequest = z.infer<typeof RejoinLookupRequest>;

/** A member a visitor may ask to rejoin as: one who is offline now. */
export const RejoinCandidate = z.object({
  user_id: UserId,
  name: z.string(),
  color: UserColor,
});
/** A member a visitor may ask to rejoin as. */
export type RejoinCandidate = z.infer<typeof RejoinCandidate>;

/**
 * Response of `POST /api/rejoin/lookup`: the table's name and its offline members, and nothing else. A member who
 * is online can't be reclaimed, and nobody could approve a request for the table's only referee, so the list
 * leaves both out.
 */
export const RejoinLookup = z.object({
  table_name: z.string(),
  members: z.array(RejoinCandidate),
});
/** Response of `POST /api/rejoin/lookup`. */
export type RejoinLookup = z.infer<typeof RejoinLookup>;

/** Body of `POST /api/rejoin`: ask to rejoin a table as one of its offline members. Needs no token. */
export const CreateRejoinRequest = z.strictObject({
  invite_code: z.string().min(1).max(64),
  user_id: UserId,
});
/** Body of `POST /api/rejoin`. */
export type CreateRejoinRequest = z.infer<typeof CreateRejoinRequest>;

/**
 * Response of `POST /api/rejoin`: the pending request. Keep `secret`, which only this browser has, and poll
 * `POST /api/rejoin/{request_id}/status` with it every few seconds until the status isn't `pending`.
 */
export const RejoinTicket = z.object({
  request_id: z.string(),
  secret: z.string(),
  expires_at: Timestamp,
  /** How many referees who may approve the request are online now. With none, tell the visitor to wait. */
  approvers_online: z.number().int(),
});
/** Response of `POST /api/rejoin`. */
export type RejoinTicket = z.infer<typeof RejoinTicket>;

/** Body of `POST /api/rejoin/{request_id}/status`. Needs no token. */
export const RejoinStatusRequest = z.strictObject({
  secret: z.string().min(1).max(200),
});
/** Body of `POST /api/rejoin/{request_id}/status`. */
export type RejoinStatusRequest = z.infer<typeof RejoinStatusRequest>;

/**
 * Where a rejoin request stands:
 *
 * - `pending`: a referee hasn't decided yet.
 * - `approved`: a referee approved. This answer carries the new `token` and the `user`, once.
 * - `claimed`: approved, and the token was already handed out. A request is used once.
 * - `declined`: a referee declined.
 * - `expired`: nobody decided in time, or nobody claimed an approval in time.
 * - `cancelled`: the visitor cancelled or stopped polling, or the member came online or left the table first.
 */
export const RejoinState = z.enum(['pending', 'approved', 'claimed', 'declined', 'expired', 'cancelled']);
/** Where a rejoin request stands. */
export type RejoinState = z.infer<typeof RejoinState>;

/**
 * Why a rejoin request was cancelled. Each says only what a visitor with the invite code can already learn from
 * `POST /api/rejoin/lookup`, which lists the members who are offline and could be approved:
 *
 * - `member_returned`: the member came online at the table.
 * - `member_left`: the member is no longer at the table. It doesn't say whether they left or a referee removed
 *   them, or whether the table was deleted.
 * - `no_referee`: no referee other than the member is left to approve.
 * - `visitor`: the visitor's browser stopped waiting, stopped polling, or asked again.
 */
export const RejoinCancelReason = z.enum(['member_returned', 'member_left', 'no_referee', 'visitor']);
/** Why a rejoin request was cancelled. */
export type RejoinCancelReason = z.infer<typeof RejoinCancelReason>;

/** Response of `POST /api/rejoin/{request_id}/status`. */
export const RejoinStatus = z.object({
  status: RejoinState,
  expires_at: Timestamp,
  /** The table to open once approved. */
  table_id: TableId,
  /** The new token of the member, on the `approved` answer alone. Store it as the browser's sign-in. */
  token: z.string().nullable(),
  /** The member, on the `approved` answer alone. */
  user: User.nullable(),
  /**
   * Why the request was cancelled, on the `cancelled` answer, and `null` otherwise. Optional in the type so that
   * older fixtures still compile. This server always sends it.
   */
  cancel_reason: RejoinCancelReason.nullable().optional(),
});
/** Response of `POST /api/rejoin/{request_id}/status`. */
export type RejoinStatus = z.infer<typeof RejoinStatus>;

/** A pending rejoin request, as the table's referees see it. */
export const RejoinRequestSummary = z.object({
  id: z.string(),
  table_id: TableId,
  /** The member the visitor asks to be. */
  user_id: UserId,
  name: z.string(),
  color: UserColor,
  role: Role,
  created_at: Timestamp,
  expires_at: Timestamp,
});
/** A pending rejoin request, as referees see it. */
export type RejoinRequestSummary = z.infer<typeof RejoinRequestSummary>;

/** Response of the referee routes under `/api/tables/{table_id}/rejoin-requests`: the pending requests. */
export const RejoinRequestList = z.object({ items: z.array(RejoinRequestSummary) });
/** The pending rejoin requests of a table. */
export type RejoinRequestList = z.infer<typeof RejoinRequestList>;
