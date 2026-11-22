import { z } from 'zod';
import type { RollResult } from '../bxapi';
import { LIMITS, Timestamp, UserId } from './common';
import type { GameEvent } from './game';

/**
 * Who can read a feed entry: `everyone` at the table, `referees` only, or the `users` named in `to` (a
 * whisper, which its sender can read too).
 */
export const FeedVisibility = z.enum(['everyone', 'referees', 'users']);
/** Who can read a feed entry. */
export type FeedVisibility = z.infer<typeof FeedVisibility>;

/** The fields every feed entry has. `seq` increases with each entry of the table, and is the pagination cursor. */
const FeedEntryBase = z.object({
  seq: z.number().int(),
  created_at: Timestamp,
  /** The user who wrote the entry or sent the command, or `null` for the server. */
  user_id: UserId.nullable(),
  visibility: FeedVisibility,
  /** The recipients of a whisper. Empty for other visibilities. */
  to: z.array(UserId),
});

/** A chat message, or a whisper when `visibility` is `users`. */
export const ChatEntry = FeedEntryBase.extend({
  kind: z.literal('chat'),
  text: z.string(),
});

/**
 * A dice roll from a `/roll` or `/r` message. bxapi rolls it. A referee's secret roll (`/roll secret 1d20` or
 * `secret: true`) has `visibility: referees`.
 */
export const RollEntry = FeedEntryBase.extend({
  kind: z.literal('roll'),
  expression: z.string(),
  /** Text after the expression, such as `for initiative`. */
  comment: z.string(),
  total: z.number(),
  rolls: z.array(z.custom<RollResult>()),
  seed: z.number().int(),
  secret: z.boolean(),
});

/**
 * The result of an accepted command. `events` and `messages` are projected for the reader: a player's copy
 * holds only player events. `command_type` is `null` in a player's copy of a referee command.
 */
export const GameEntry = FeedEntryBase.extend({
  kind: z.literal('game'),
  command_type: z.string().nullable(),
  revision: z.number().int(),
  session_id: z.string(),
  events: z.array(z.custom<GameEvent>()),
  messages: z.array(z.string()),
});

/** What a system notice reports. The client writes the sentence from `code` and `params`. */
export const SystemNoticeCode = z.enum([
  'member_joined',
  'member_left',
  'member_removed',
  'role_changed',
  'game_started',
  'game_ended',
  'save_created',
  'save_restored',
  'seat_changed',
  'caller_changed',
  'adventure_uploaded',
]);
/** What a system notice reports. */
export type SystemNoticeCode = z.infer<typeof SystemNoticeCode>;

/** A system notice, such as a member joining or a save being restored. `params` holds IDs and labels. */
export const SystemEntry = FeedEntryBase.extend({
  kind: z.literal('system'),
  code: SystemNoticeCode,
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

/** One entry of the table's feed. */
export const FeedEntry = z.discriminatedUnion('kind', [ChatEntry, RollEntry, GameEntry, SystemEntry]);
/** One entry of the table's feed. */
export type FeedEntry = z.infer<typeof FeedEntry>;
/** A chat entry. */
export type ChatEntry = z.infer<typeof ChatEntry>;
/** A dice roll entry. */
export type RollEntry = z.infer<typeof RollEntry>;
/** A game entry. */
export type GameEntry = z.infer<typeof GameEntry>;
/** A system notice entry. */
export type SystemEntry = z.infer<typeof SystemEntry>;

/**
 * Query of `GET /api/tables/{table_id}/feed`. With `after`, the page holds the entries after that `seq`, oldest
 * first, for catching up. Otherwise it holds the newest entries before `before` (or the newest of all), also in
 * order oldest first, for scrolling back.
 */
export const FeedQuery = z.strictObject({
  after: z.coerce.number().int().min(0).optional(),
  before: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(LIMITS.feedPage).optional(),
});
/** Query of `GET /api/tables/{table_id}/feed`. */
export type FeedQuery = z.infer<typeof FeedQuery>;

/** A page of the feed, oldest first. `has_more` says whether more entries lie past the page in its direction. */
export const FeedPage = z.object({
  entries: z.array(FeedEntry),
  has_more: z.boolean(),
});
/** A page of the feed. */
export type FeedPage = z.infer<typeof FeedPage>;

/**
 * Body of `POST /api/tables/{table_id}/feed`. Text that starts with `/roll ` or `/r ` is a dice roll, such as
 * `/roll 2d6+1 for damage`. `to` makes the message a whisper to those members. `secret` makes a roll visible to
 * referees only, and only a referee may set it.
 */
export const PostFeedRequest = z.strictObject({
  text: z.string().trim().min(1).max(LIMITS.feedText),
  to: z.array(UserId).min(1).max(LIMITS.whisperRecipients).optional(),
  secret: z.boolean().optional(),
});
/** Body of `POST /api/tables/{table_id}/feed`. */
export type PostFeedRequest = z.infer<typeof PostFeedRequest>;

/**
 * Splits a feed message into a dice command, or returns `null` for chat. `/roll secret 1d20` asks for a secret
 * roll.
 *
 * @param text - The message text.
 * @returns The expression, the comment after it, and whether the roll is secret, or `null`.
 */
export function parseRollCommand(
  text: string,
): { expression: string; comment: string; secret: boolean } | null {
  const match = /^\/(?:roll|r)\s+(.*)$/is.exec(text.trim());
  if (!match) return null;
  let rest = (match[1] ?? '').trim();
  let secret = false;
  const secretMatch = /^(?:secret|s)\s+(.*)$/is.exec(rest);
  if (secretMatch) {
    secret = true;
    rest = (secretMatch[1] ?? '').trim();
  }
  const [expression = '', ...comment] = rest.split(/\s+/);
  if (expression === '') return null;
  return { expression, comment: comment.join(' '), secret };
}
