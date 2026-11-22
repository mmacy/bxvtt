import { z } from 'zod';

/**
 * Every problem `code` the bxvtt server returns, with the HTTP status it comes with. A client branches on
 * `code`, never on `detail`. Codes marked "from bxapi" pass bxapi's problem through with its extra members.
 */
export const PROBLEM_CODES = {
  /** 400: the body isn't JSON, or a query parameter is malformed. */
  bad_request: 400,
  /** 401: the request has no user token, or the token is unknown. */
  unauthorized: 401,
  /** 403: the user isn't allowed to do this, for example a player sending another member's command. `detail` says why. */
  forbidden: 403,
  /** 403: only a referee of this table may do this. */
  referee_required: 403,
  /** 403: creating a table needs the host key, and the request had none or a wrong one. */
  host_key_required: 403,
  /** 403: a player sent a referee command. Extra member: `command_type`. */
  referee_command: 403,
  /** 404: no resource the user can read has that ID, or no route has that path. Extra members: `resource`, `id`. */
  not_found: 404,
  /** 404: the invite code matches no table. */
  invite_invalid: 404,
  /** 405: the path exists, but not with that method. */
  method_not_allowed: 405,
  /** 409: the change would leave the table without a referee. */
  last_referee: 409,
  /** 409: the table is playing a game, so the lobby can't change. End the game first. */
  game_active: 409,
  /** 409: the table has no game in progress. */
  no_game: 409,
  /** 409: the character is already on the roster. */
  duplicate_character: 409,
  /** 409: the roster is empty, so a game can't start. */
  roster_empty: 409,
  /** 409: the game moved on since the client's `expected_revision`. Extra member: `revision`. The server pushes the new state. */
  revision_conflict: 409,
  /** 409: a notes edit started from an old version. Extra member: `notes`, the current document. */
  stale_version: 409,
  /** 409: the party isn't in a battle, so there's no round to declare for. */
  not_in_battle: 409,
  /** 409: the member doesn't have to declare this round. */
  not_a_declarer: 409,
  /** 409: some declarers have no declaration yet, and only a referee can resolve the round early. Extra member: `missing`. */
  declarations_incomplete: 409,
  /** 409: `resolve_battle_round` goes through the declarations routes, not the command route. */
  use_declarations: 409,
  /** 409 (from bxapi): a character was already created from that ability roll. */
  ability_roll_used: 409,
  /** 409 (from bxapi): a document is newer than bxapi's osrlib. */
  version_unsupported: 409,
  /** 409: bxapi kept the session locked, or the command's outcome is unknown after retries. Read the game state again. */
  session_busy: 409,
  /** 403 (from bxapi): an adventure that comes with bxapi can't be deleted. */
  adventure_read_only: 403,
  /** 413: the request body or WebSocket message is too large. */
  content_too_large: 413,
  /** 415: the request body isn't JSON. */
  unsupported_media_type: 415,
  /** 422: the body or query doesn't match the route's schema. Extra member: `errors`, each with `path` and `message`. */
  validation_error: 422,
  /** 422: the command type isn't one bxapi knows. Extra member: `command_type`. */
  unknown_command: 422,
  /** 422 (from bxapi): a document or value is malformed, such as a dice expression bxapi can't parse. */
  content_invalid: 422,
  /** 422 (from bxapi): character choices break a rule. Extra members: `rejections`, or `field`, `index`, and `id`. */
  character_invalid: 422,
  /** 422 (from bxapi): the roster's characters can't form a party. */
  party_invalid: 422,
  /**
   * 422: a command or declaration names a target handle (`tgt_...`) that isn't one of the handles in
   * `game.scene.targets`, for example a handle from an encounter that has ended. Extra members: `field`, the
   * field that holds it, and `id`, the handle. Read the scene again and pick a target from it.
   */
  target_unknown: 422,
  /** 429: too many requests from this address. The `Retry-After` header and the `retry_after` member give the seconds to wait. */
  rate_limited: 429,
  /** 500: a bug in bxvtt. The server logs the cause. */
  internal_error: 500,
  /** 502: bxapi answered with an error that bxvtt didn't expect. */
  bxapi_error: 502,
  /** 503: bxvtt can't reach bxapi. Start bxapi and try again. */
  bxapi_unavailable: 503,
  /**
   * 502, 503, or 504, made by the SDK rather than the server: something between the browser and the bxvtt
   * server, such as the Vite proxy or a tunnel, answered with an error page instead of a problem document,
   * usually because the bxvtt server is down. `status` is the status the proxy sent.
   */
  server_unavailable: 503,
  /**
   * Made by the SDK rather than the server: a response the SDK expected to be JSON wasn't, such as an HTML page
   * where an API response belongs. `status` is the response's status.
   */
  invalid_response: 502,
} as const;

/** A stable problem code. */
export type ProblemCode = keyof typeof PROBLEM_CODES;

/** A list of the problem codes, for a zod enum. */
const PROBLEM_CODE_LIST = Object.keys(PROBLEM_CODES) as [ProblemCode, ...ProblemCode[]];

/** A stable problem code, as a zod schema. */
export const ProblemCodeSchema = z.enum(PROBLEM_CODE_LIST);

/** One validation error: where in the request it is and what is wrong. */
export const ValidationIssue = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
/** One validation error. */
export type ValidationIssue = z.infer<typeof ValidationIssue>;

/**
 * An RFC 9457 problem document, sent with the media type `application/problem+json` for every error. A client
 * reads `code` and ignores members it doesn't know. The optional members appear only with the codes that
 * {@link PROBLEM_CODES} lists for them.
 */
export const Problem = z.looseObject({
  type: z.literal('about:blank'),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string(),
  request_id: z.string().optional(),
  errors: z.array(ValidationIssue).optional(),
  resource: z.string().optional(),
  id: z.unknown().optional(),
  revision: z.number().int().optional(),
  retry_after: z.number().int().optional(),
  command_type: z.string().optional(),
  missing: z.array(z.string()).optional(),
  rejections: z
    .array(z.looseObject({ code: z.string(), params: z.record(z.string(), z.unknown()) }))
    .optional(),
  field: z.string().optional(),
  index: z.number().int().optional(),
});
/** An RFC 9457 problem document. */
export type Problem = z.infer<typeof Problem>;
