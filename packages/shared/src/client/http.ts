import type { BattleDeclaration } from '../bxapi';
import type {
  AbilityRoll,
  AbilityRollRequest,
  AdventureDocument,
  AdventureList,
  AdventureListing,
  AdventureValidation,
  CharacterCheck,
  CharacterCheckRequest,
  CharacterList,
  CharacterPreview,
  CharacterRequest,
  Command,
  CommandResult,
  CreateAnnotationRequest,
  CreateTableRequest,
  CreateUserResponse,
  DeclarationBody,
  DeclarationsState,
  DiceRollRequest,
  DiceRollResponse,
  EventPage,
  EventsQuery,
  FeedEntry,
  FeedPage,
  FeedQuery,
  FullCatalog,
  FullCatalogName,
  GameState,
  GeneratorKind,
  Health,
  LevelAnnotations,
  LevelRef,
  Annotation,
  Notes,
  NotesKind,
  PostFeedRequest,
  Problem,
  ProblemCode,
  RefereeState,
  RejoinLookup,
  RejoinRequestList,
  RejoinStatus,
  RejoinTicket,
  ResolveRoundResult,
  Role,
  SaveEntry,
  SaveList,
  SeatList,
  StartGameRequest,
  StoredCharacter,
  TableDetail,
  TableList,
  UpdateTableRequest,
  UpdateUserRequest,
  User,
} from '../protocol';

/** A problem document that the server returned, thrown by every {@link BxvttClient} method on an error status. */
export class BxvttProblemError extends Error {
  /** The problem document. */
  readonly problem: Problem;

  /**
   * @param problem - The problem document from the response body.
   */
  constructor(problem: Problem) {
    super(`${problem.code}: ${problem.detail}`);
    this.name = 'BxvttProblemError';
    this.problem = problem;
  }

  /** The HTTP status. */
  get status(): number {
    return this.problem.status;
  }

  /** The stable problem code. */
  get code(): ProblemCode | string {
    return this.problem.code;
  }
}

/**
 * Whether a value is a {@link BxvttProblemError}, optionally with one code.
 *
 * @param error - The value to test, usually from a `catch`.
 * @param code - The problem code to match.
 */
export function isProblem(error: unknown, code?: ProblemCode): error is BxvttProblemError {
  return error instanceof BxvttProblemError && (code === undefined || error.problem.code === code);
}

/** Options for {@link BxvttClient}. */
export interface BxvttClientOptions {
  /** The server's origin, such as `http://127.0.0.1:8660`. Leave it empty in a browser that loads the client from the server. */
  baseUrl?: string;
  /** The user token from `createUser`. Set it later with {@link BxvttClient.setToken}. */
  token?: string | null;
  /** A `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/** Options for one request. */
interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Return `null` on a 204 response instead of parsing a body. */
  empty?: boolean;
  /** The token to send instead of the client's own. */
  token?: string;
}

/**
 * A typed client for the bxvtt HTTP API. Each method sends one request and returns the parsed response, or throws
 * a {@link BxvttProblemError} with the server's problem document. It works in a browser and in Node 24.
 */
export class BxvttClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private token: string | null;

  /**
   * @param options - The server address, the user token, and an optional `fetch` implementation.
   */
  constructor(options: BxvttClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.token = options.token ?? null;
  }

  /**
   * Sets the user token that later requests send.
   *
   * @param token - The token, or `null` to send none.
   */
  setToken(token: string | null): void {
    this.token = token;
  }

  /** The token the client sends, or `null`. */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Sends a request and parses the JSON response.
   *
   * @param method - The HTTP method.
   * @param path - The path under the server's origin, starting with `/api`.
   * @param options - The body, the query parameters, and whether the response has no body.
   * @returns The parsed body, or `null` for a 204 response.
   * @throws BxvttProblemError when the server answers with an error status.
   */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(this.baseUrl + path, this.baseUrl === '' ? pageLocation()?.href : undefined);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = options.token ?? this.token;
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const response = await this.fetchImpl(url, { method, headers, body });
    if (response.status === 204) return null as T;
    const text = await response.text();
    const parsed = parseJson(text);
    if (!response.ok) {
      throw new BxvttProblemError(toProblem(parsed.ok ? parsed.value : undefined, response.status));
    }
    if (!parsed.ok) {
      throw new BxvttProblemError({
        type: 'about:blank',
        title: 'Invalid response',
        status: response.status,
        code: 'invalid_response',
        detail: 'The server returned an unreadable response. Reload the page or check the server address.',
      });
    }
    return parsed.value as T;
  }

  // Health and users.

  /** Reads the server's status and bxapi's. Needs no token. */
  health(): Promise<Health> {
    return this.request('GET', '/api/health');
  }

  /**
   * Creates a user and stores the new token in this client.
   *
   * @param name - The display name.
   */
  async createUser(name: string): Promise<CreateUserResponse> {
    const result = await this.request<CreateUserResponse>('POST', '/api/users', { body: { name } });
    this.token = result.token;
    return result;
  }

  /** Reads the user the token belongs to. */
  me(): Promise<User> {
    return this.request('GET', '/api/users/me');
  }

  /**
   * Changes the user's display name or color.
   *
   * @param body - The new name, color, or both.
   */
  updateMe(body: UpdateUserRequest): Promise<User> {
    return this.request('PATCH', '/api/users/me', { body });
  }

  /**
   * Deletes the user. The user leaves every table as {@link BxvttClient.leaveTable} would, which deletes a table
   * they are the last member of, and their characters are deleted. What they wrote in a table's feed stays, under
   * a new, unassigned user ID. The token stops working, and the client forgets it.
   *
   * @throws BxvttProblemError `last_referee` when the user is the only referee of a table with other members.
   *   Nothing changes then.
   */
  async deleteMe(): Promise<void> {
    await this.request('DELETE', '/api/users/me');
    this.token = null;
  }

  /**
   * Signs the user out: the server stops accepting the token, and the client forgets it at once, before the
   * server answers. The user and their tables and characters stay. A referee's approval of a rejoin request is the
   * only way to get a token for the user again. Does nothing when the client has no token.
   */
  async signOut(): Promise<void> {
    const token = this.token;
    if (token === null) return;
    this.token = null;
    await this.request('POST', '/api/users/me/sign-out', { token });
  }

  // Tables.

  /** Lists the user's tables. */
  listTables(): Promise<TableList> {
    return this.request('GET', '/api/tables');
  }

  /**
   * Creates a table with the user as its referee.
   *
   * @param body - The name, and the host key when the server needs one.
   */
  createTable(body: CreateTableRequest): Promise<TableDetail> {
    return this.request('POST', '/api/tables', { body });
  }

  /**
   * Reads a table.
   *
   * @param tableId - The table ID.
   */
  getTable(tableId: string): Promise<TableDetail> {
    return this.request('GET', `/api/tables/${enc(tableId)}`);
  }

  /**
   * Renames a table or changes its settings. Referee only.
   *
   * @param tableId - The table ID.
   * @param body - The new name, settings, or both.
   */
  updateTable(tableId: string, body: UpdateTableRequest): Promise<TableDetail> {
    return this.request('PATCH', `/api/tables/${enc(tableId)}`, { body });
  }

  /**
   * Deletes a table and its games. Referee only.
   *
   * @param tableId - The table ID.
   */
  async deleteTable(tableId: string): Promise<void> {
    await this.request('DELETE', `/api/tables/${enc(tableId)}`);
  }

  /**
   * Replaces the invite code, so the old one stops working. Referee only.
   *
   * @param tableId - The table ID.
   */
  regenerateInviteCode(tableId: string): Promise<TableDetail> {
    return this.request('POST', `/api/tables/${enc(tableId)}/invite-code`);
  }

  /**
   * Joins a table as a player.
   *
   * @param inviteCode - The table's invite code.
   */
  joinTable(inviteCode: string): Promise<TableDetail> {
    return this.request('POST', '/api/join', { body: { invite_code: inviteCode } });
  }

  /**
   * Leaves a table.
   *
   * @param tableId - The table ID.
   */
  async leaveTable(tableId: string): Promise<void> {
    await this.request('POST', `/api/tables/${enc(tableId)}/leave`);
  }

  /**
   * Changes a member's role. Referee only.
   *
   * @param tableId - The table ID.
   * @param userId - The member's user ID.
   * @param role - The new role.
   */
  setMemberRole(tableId: string, userId: string, role: Role): Promise<TableDetail> {
    return this.request('PATCH', `/api/tables/${enc(tableId)}/members/${enc(userId)}`, { body: { role } });
  }

  /**
   * Removes a member from a table. Referee only.
   *
   * @param tableId - The table ID.
   * @param userId - The member's user ID.
   */
  removeMember(tableId: string, userId: string): Promise<TableDetail> {
    return this.request('DELETE', `/api/tables/${enc(tableId)}/members/${enc(userId)}`);
  }

  // Rejoining a table.

  /**
   * Reads what a visitor needs to ask to rejoin a table: its name and its offline members. Needs no token. Counts
   * as an invite code attempt.
   *
   * ```ts
   * const { table_name, members } = await client.lookupRejoin(inviteCode);
   * ```
   *
   * @param inviteCode - The table's invite code.
   * @throws BxvttProblemError `invite_invalid` for a wrong code, `rate_limited` after too many attempts.
   */
  lookupRejoin(inviteCode: string): Promise<RejoinLookup> {
    return this.request('POST', '/api/rejoin/lookup', { body: { invite_code: inviteCode } });
  }

  /**
   * Asks to rejoin a table as one of its offline members. Needs no token. The table's referees hear about it, and
   * one of them approves or declines. Keep the ticket's `secret` and poll {@link BxvttClient.rejoinStatus}.
   *
   * ```ts
   * const ticket = await client.requestRejoin(inviteCode, member.user_id);
   * ```
   *
   * @param inviteCode - The table's invite code.
   * @param userId - The member to rejoin as, from {@link BxvttClient.lookupRejoin}.
   * @throws BxvttProblemError `rejoin_member_online`, `rejoin_pending`, `rejoin_no_approver`, `invite_invalid`,
   *   `not_found` for a user who isn't a member, or `rate_limited`.
   */
  requestRejoin(inviteCode: string, userId: string): Promise<RejoinTicket> {
    return this.request('POST', '/api/rejoin', { body: { invite_code: inviteCode, user_id: userId } });
  }

  /**
   * Reads where a rejoin request stands. Needs no token. Call it every few seconds while the status is `pending`
   * or `approved`: a request that goes 20 seconds without a poll counts as abandoned and ends as `cancelled`. The
   * `approved` answer is the claim: it carries the member's new token once, and only then does the member's old
   * token stop working. This client stores the new token, so its next requests act as that member.
   *
   * ```ts
   * const status = await client.rejoinStatus(ticket.request_id, ticket.secret);
   * if (status.status === 'approved') saveToken(status.token);
   * ```
   *
   * @param requestId - The ticket's `request_id`.
   * @param secret - The ticket's `secret`.
   * @throws BxvttProblemError `not_found` for an unknown request or a wrong secret.
   */
  async rejoinStatus(requestId: string, secret: string): Promise<RejoinStatus> {
    const status = await this.request<RejoinStatus>('POST', `/api/rejoin/${enc(requestId)}/status`, {
      body: { secret },
    });
    if (status.token !== null) this.token = status.token;
    return status;
  }

  /**
   * Ends a rejoin request: the visitor stopped waiting. The referees' list drops it at once. Needs no token, and
   * ending a request that already ended does nothing. When the page is closing, send the same body with
   * `navigator.sendBeacon(url, JSON.stringify({ secret }))`, which the server accepts as `text/plain` on this
   * route alone.
   *
   * ```ts
   * await client.cancelRejoin(ticket.request_id, ticket.secret);
   * addEventListener('pagehide', () =>
   *   navigator.sendBeacon(`/api/rejoin/${ticket.request_id}/cancel`, JSON.stringify({ secret: ticket.secret })),
   * );
   * ```
   *
   * @param requestId - The ticket's `request_id`.
   * @param secret - The ticket's `secret`.
   * @throws BxvttProblemError `not_found` for an unknown request or a wrong secret.
   */
  async cancelRejoin(requestId: string, secret: string): Promise<void> {
    await this.request('POST', `/api/rejoin/${enc(requestId)}/cancel`, { body: { secret } });
  }

  /**
   * Lists the table's pending rejoin requests. Referee only. The `rejoin_requests` WebSocket message carries the
   * same list after each change.
   *
   * @param tableId - The table ID.
   */
  listRejoinRequests(tableId: string): Promise<RejoinRequestList> {
    return this.request('GET', `/api/tables/${enc(tableId)}/rejoin-requests`);
  }

  /**
   * Approves a rejoin request: the member gets a new token, which the visitor receives, and the old token stops
   * working. Referee only, and never for a request to rejoin as yourself.
   *
   * @param tableId - The table ID.
   * @param requestId - The request ID.
   * @throws BxvttProblemError `rejoin_not_pending`, `rejoin_member_online`, `forbidden`, or `referee_required`.
   */
  approveRejoin(tableId: string, requestId: string): Promise<RejoinRequestList> {
    return this.request('POST', `/api/tables/${enc(tableId)}/rejoin-requests/${enc(requestId)}/approve`);
  }

  /**
   * Declines a rejoin request. Referee only.
   *
   * @param tableId - The table ID.
   * @param requestId - The request ID.
   * @throws BxvttProblemError `rejoin_not_pending`, `forbidden`, or `referee_required`.
   */
  declineRejoin(tableId: string, requestId: string): Promise<RejoinRequestList> {
    return this.request('POST', `/api/tables/${enc(tableId)}/rejoin-requests/${enc(requestId)}/decline`);
  }

  // Characters.

  /**
   * Rolls ability scores for a new character.
   *
   * @param body - An optional seed, when the server allows one.
   */
  rollAbilities(body: AbilityRollRequest = {}): Promise<AbilityRoll> {
    return this.request('POST', '/api/ability-rolls', { body });
  }

  /**
   * Reads one of the user's ability rolls.
   *
   * @param rollId - The roll ID.
   */
  getAbilityRoll(rollId: string): Promise<AbilityRoll> {
    return this.request('GET', `/api/ability-rolls/${enc(rollId)}`);
  }

  /**
   * Previews a character from a set of choices, storing nothing.
   *
   * @param body - The character choices.
   */
  previewCharacter(body: CharacterRequest): Promise<CharacterPreview> {
    return this.request('POST', '/api/characters/preview', { body });
  }

  /**
   * Checks a set of choices against one of the user's ability rolls, storing nothing and leaving the roll
   * unused, and reads the starting gold the roll gives the chosen class. Use it to check each step of a
   * character wizard, and to show the gold before the player shops.
   *
   * ```ts
   * const check = await client.checkCharacter({ ...choices, ability_roll_id: roll.id });
   * if (!check.valid) showProblem(check.problem); // bxapi's character_invalid problem
   * if (check.gold_gp !== null) showGold(check.gold_gp);
   * ```
   *
   * @param body - The character choices, with `ability_roll_id`.
   * @throws BxvttProblemError `not_found` for a roll the user doesn't own, `ability_roll_used` for a roll that
   *   already made a character, and `rate_limited` after too many checks.
   */
  checkCharacter(body: CharacterCheckRequest): Promise<CharacterCheck> {
    return this.request('POST', '/api/characters/check', { body });
  }

  /**
   * Creates and stores a character that the user owns.
   *
   * @param body - The character choices.
   */
  createCharacter(body: CharacterRequest): Promise<StoredCharacter> {
    return this.request('POST', '/api/characters', { body });
  }

  /** Lists the user's characters. */
  listCharacters(): Promise<CharacterList> {
    return this.request('GET', '/api/characters');
  }

  /**
   * Reads a character the user owns, or one on the roster of a table the user referees.
   *
   * @param characterId - The character ID.
   */
  getCharacter(characterId: string): Promise<StoredCharacter> {
    return this.request('GET', `/api/characters/${enc(characterId)}`);
  }

  /**
   * Deletes one of the user's characters and takes it off every lobby roster.
   *
   * @param characterId - The character ID.
   */
  async deleteCharacter(characterId: string): Promise<void> {
    await this.request('DELETE', `/api/characters/${enc(characterId)}`);
  }

  // Rules, dice, and generators.

  /**
   * Reads a rules catalog page or entry, such as `classes` or `spells/sleep`.
   *
   * @param path - The path under `/api/rules/`.
   * @param query - Query parameters such as `q` or `limit`.
   */
  rules<T = unknown>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    return this.request('GET', `/api/rules/${path.replace(/^\//, '')}`, { query });
  }

  /**
   * Reads every full entry of one rules catalog in one response, such as every monster with its categories, or
   * every equipment item with its weight and damage. Each entry is what `rules('monsters/goblin')` returns.
   *
   * ```ts
   * const { items } = await client.fullCatalog('monsters');
   * const undead = items.filter((monster) => monster.categories.includes('undead'));
   * ```
   *
   * @param catalog - `classes`, `equipment`, `monsters`, `spells`, or `magic-items`.
   */
  fullCatalog<C extends FullCatalogName>(catalog: C): Promise<FullCatalog<C>> {
    return this.request('GET', `/api/catalogs/${catalog}`);
  }

  /**
   * Rolls dice through bxapi without posting to the feed.
   *
   * @param body - The expression, and optionally `times` and `seed`.
   */
  rollDice(body: DiceRollRequest): Promise<DiceRollResponse> {
    return this.request('POST', '/api/dice/roll', { body });
  }

  /**
   * Runs one of bxapi's generators. Referee only.
   *
   * @param tableId - The table ID.
   * @param kind - The generator.
   * @param body - The generator's request body.
   */
  generate<T = unknown>(tableId: string, kind: GeneratorKind, body: Record<string, unknown>): Promise<T> {
    return this.request('POST', `/api/tables/${enc(tableId)}/generate/${kind}`, { body });
  }

  // Adventures.

  /**
   * Lists the adventures a table can play.
   *
   * @param tableId - The table ID.
   */
  listAdventures(tableId: string): Promise<AdventureList> {
    return this.request('GET', `/api/tables/${enc(tableId)}/adventures`);
  }

  /**
   * Checks an adventure document without storing it. Referee only.
   *
   * @param tableId - The table ID.
   * @param document - The adventure document.
   */
  validateAdventure(tableId: string, document: AdventureDocument): Promise<AdventureValidation> {
    return this.request('POST', `/api/tables/${enc(tableId)}/adventures/validate`, { body: document });
  }

  /**
   * Uploads an adventure document for the table. Referee only.
   *
   * @param tableId - The table ID.
   * @param document - The adventure document.
   */
  uploadAdventure(tableId: string, document: AdventureDocument): Promise<AdventureListing> {
    return this.request('POST', `/api/tables/${enc(tableId)}/adventures`, { body: document });
  }

  /**
   * Deletes an adventure the table uploaded. Referee only.
   *
   * @param tableId - The table ID.
   * @param adventureId - The adventure's `id` from the list.
   */
  async deleteAdventure(tableId: string, adventureId: string): Promise<void> {
    await this.request('DELETE', `/api/tables/${enc(tableId)}/adventures/${enc(adventureId)}`);
  }

  // Roster.

  /**
   * Puts one of the user's characters on the roster.
   *
   * @param tableId - The table ID.
   * @param characterId - The character ID.
   */
  addToRoster(tableId: string, characterId: string): Promise<TableDetail> {
    return this.request('POST', `/api/tables/${enc(tableId)}/roster`, {
      body: { character_id: characterId },
    });
  }

  /**
   * Takes a character off the roster. Its owner or a referee may.
   *
   * @param tableId - The table ID.
   * @param entryId - The roster entry ID.
   */
  removeFromRoster(tableId: string, entryId: string): Promise<TableDetail> {
    return this.request('DELETE', `/api/tables/${enc(tableId)}/roster/${enc(entryId)}`);
  }

  /**
   * Sets the roster's marching order. Referee only.
   *
   * @param tableId - The table ID.
   * @param entryIds - Every roster entry ID, front first.
   */
  reorderRoster(tableId: string, entryIds: string[]): Promise<TableDetail> {
    return this.request('PUT', `/api/tables/${enc(tableId)}/roster`, { body: { entry_ids: entryIds } });
  }

  // Game.

  /**
   * Starts a game from the roster. Referee only.
   *
   * @param tableId - The table ID.
   * @param body - The adventure, and optional name, ruleset, and seed.
   */
  startGame(tableId: string, body: StartGameRequest): Promise<GameState> {
    return this.request('POST', `/api/tables/${enc(tableId)}/game`, { body });
  }

  /**
   * Reads the game state for the user's role.
   *
   * @param tableId - The table ID.
   */
  getGame(tableId: string): Promise<GameState> {
    return this.request('GET', `/api/tables/${enc(tableId)}/game`);
  }

  /**
   * Ends the game and returns the table to its lobby. The saves stay. Referee only.
   *
   * @param tableId - The table ID.
   */
  async endGame(tableId: string): Promise<void> {
    await this.request('DELETE', `/api/tables/${enc(tableId)}/game`);
  }

  /**
   * Sends a bxapi command through the server's permission check.
   *
   * @param tableId - The table ID.
   * @param command - The command, with `command_type`.
   * @param expectedRevision - The revision of the state the user acted on.
   */
  sendCommand(tableId: string, command: Command, expectedRevision?: number): Promise<CommandResult> {
    return this.request('POST', `/api/tables/${enc(tableId)}/game/commands`, {
      body: { command, expected_revision: expectedRevision },
    });
  }

  /**
   * Reads a page of the session's event log. A referee may pass `visibility: 'referee'`.
   *
   * @param tableId - The table ID.
   * @param query - `after`, `limit`, and `visibility`.
   */
  listEvents(tableId: string, query: EventsQuery = {}): Promise<EventPage> {
    return this.request('GET', `/api/tables/${enc(tableId)}/game/events`, { query });
  }

  /**
   * Reads the dynamic referee state. Referee only.
   *
   * @param tableId - The table ID.
   */
  getRefereeState(tableId: string): Promise<RefereeState> {
    return this.request('GET', `/api/tables/${enc(tableId)}/game/referee`);
  }

  /**
   * Reads the full adventure of the current game, with its map and key. Referee only.
   *
   * @param tableId - The table ID.
   */
  getAdventureDocument<T = Record<string, unknown>>(tableId: string): Promise<T> {
    return this.request('GET', `/api/tables/${enc(tableId)}/game/adventure`);
  }

  /**
   * Gives a seat to a member, or empties it. Referee only.
   *
   * @param tableId - The table ID.
   * @param memberId - The party member ID, such as `character-0001`.
   * @param userId - The user who takes the seat, or `null`.
   */
  setSeat(tableId: string, memberId: string, userId: string | null): Promise<SeatList> {
    return this.request('PUT', `/api/tables/${enc(tableId)}/game/seats/${enc(memberId)}`, {
      body: { user_id: userId },
    });
  }

  // Battle declarations.

  /**
   * Reads the current round's declarations, or `null` outside a battle.
   *
   * @param tableId - The table ID.
   */
  getDeclarations(tableId: string): Promise<DeclarationsState | null> {
    return this.request('GET', `/api/tables/${enc(tableId)}/game/declarations`);
  }

  /**
   * Saves a declaration for one member.
   *
   * @param tableId - The table ID.
   * @param memberId - The party member ID.
   * @param declaration - The declaration, without `character_id`.
   */
  declare(
    tableId: string,
    memberId: string,
    declaration: DeclarationBody | Partial<BattleDeclaration>,
  ): Promise<DeclarationsState> {
    return this.request('PUT', `/api/tables/${enc(tableId)}/game/declarations/${enc(memberId)}`, {
      body: { declaration },
    });
  }

  /**
   * Clears one member's declaration.
   *
   * @param tableId - The table ID.
   * @param memberId - The party member ID.
   */
  clearDeclaration(tableId: string, memberId: string): Promise<DeclarationsState> {
    return this.request('DELETE', `/api/tables/${enc(tableId)}/game/declarations/${enc(memberId)}`);
  }

  /**
   * Resolves the battle round from the saved declarations.
   *
   * @param tableId - The table ID.
   * @param fillWithHold - Referee only: declare `hold` for each member who hasn't declared.
   */
  resolveRound(tableId: string, fillWithHold = false): Promise<ResolveRoundResult> {
    return this.request('POST', `/api/tables/${enc(tableId)}/game/declarations/resolve`, {
      body: { fill_with_hold: fillWithHold },
    });
  }

  // Saves.

  /**
   * Lists the table's saves.
   *
   * @param tableId - The table ID.
   */
  listSaves(tableId: string): Promise<SaveList> {
    return this.request('GET', `/api/tables/${enc(tableId)}/saves`);
  }

  /**
   * Saves the game.
   *
   * @param tableId - The table ID.
   * @param label - An optional label.
   */
  createSave(tableId: string, label?: string): Promise<SaveEntry> {
    return this.request('POST', `/api/tables/${enc(tableId)}/saves`, {
      body: label === undefined ? {} : { label },
    });
  }

  /**
   * Relabels a save.
   *
   * @param tableId - The table ID.
   * @param saveId - The save ID.
   * @param label - The new label, or `null` to remove it.
   */
  renameSave(tableId: string, saveId: string, label: string | null): Promise<SaveEntry> {
    return this.request('PATCH', `/api/tables/${enc(tableId)}/saves/${enc(saveId)}`, { body: { label } });
  }

  /**
   * Deletes a save.
   *
   * @param tableId - The table ID.
   * @param saveId - The save ID.
   */
  async deleteSave(tableId: string, saveId: string): Promise<void> {
    await this.request('DELETE', `/api/tables/${enc(tableId)}/saves/${enc(saveId)}`);
  }

  /**
   * Restores a save into a new session and moves the table to it. Referee only.
   *
   * @param tableId - The table ID.
   * @param saveId - The save ID.
   */
  restoreSave(tableId: string, saveId: string): Promise<GameState> {
    return this.request('POST', `/api/tables/${enc(tableId)}/saves/${enc(saveId)}/restore`);
  }

  /**
   * Reads bxapi's save document, for export. Referee only.
   *
   * @param tableId - The table ID.
   * @param saveId - The save ID.
   */
  exportSave<T = Record<string, unknown>>(tableId: string, saveId: string): Promise<T> {
    return this.request('GET', `/api/tables/${enc(tableId)}/saves/${enc(saveId)}/document`);
  }

  // Feed.

  /**
   * Reads a page of the feed.
   *
   * @param tableId - The table ID.
   * @param query - `after` to catch up, or `before` to scroll back, and `limit`.
   */
  getFeed(tableId: string, query: FeedQuery = {}): Promise<FeedPage> {
    return this.request('GET', `/api/tables/${enc(tableId)}/feed`, { query });
  }

  /**
   * Posts a chat message, a whisper, or a `/roll` command.
   *
   * @param tableId - The table ID.
   * @param body - The text, and optional recipients or secret flag.
   */
  postFeed(tableId: string, body: PostFeedRequest): Promise<FeedEntry> {
    return this.request('POST', `/api/tables/${enc(tableId)}/feed`, { body });
  }

  // Annotations.

  /**
   * Reads the annotations on one level.
   *
   * @param tableId - The table ID.
   * @param level - The dungeon and level number.
   */
  getAnnotations(tableId: string, level: LevelRef): Promise<LevelAnnotations> {
    return this.request('GET', `/api/tables/${enc(tableId)}/annotations`, { query: level });
  }

  /**
   * Adds a stroke or a pin.
   *
   * @param tableId - The table ID.
   * @param body - The annotation.
   */
  createAnnotation(tableId: string, body: CreateAnnotationRequest): Promise<Annotation> {
    return this.request('POST', `/api/tables/${enc(tableId)}/annotations`, { body });
  }

  /**
   * Erases an annotation. Its author or a referee may.
   *
   * @param tableId - The table ID.
   * @param annotationId - The annotation ID.
   */
  async deleteAnnotation(tableId: string, annotationId: string): Promise<void> {
    await this.request('DELETE', `/api/tables/${enc(tableId)}/annotations/${enc(annotationId)}`);
  }

  /**
   * Erases every annotation on a level. Referee only.
   *
   * @param tableId - The table ID.
   * @param level - The dungeon and level number.
   */
  async clearAnnotations(tableId: string, level: LevelRef): Promise<void> {
    await this.request('POST', `/api/tables/${enc(tableId)}/annotations/clear`, { body: level });
  }

  // Notes.

  /**
   * Reads a notes document.
   *
   * @param tableId - The table ID.
   * @param kind - `party` or `referee`.
   */
  getNotes(tableId: string, kind: NotesKind): Promise<Notes> {
    return this.request('GET', `/api/tables/${enc(tableId)}/notes/${kind}`);
  }

  /**
   * Replaces a notes document.
   *
   * @param tableId - The table ID.
   * @param kind - `party` or `referee`.
   * @param text - The new text.
   * @param version - The version the edit started from.
   */
  updateNotes(tableId: string, kind: NotesKind, text: string, version: number): Promise<Notes> {
    return this.request('PUT', `/api/tables/${enc(tableId)}/notes/${kind}`, { body: { text, version } });
  }
}

/** The page's location in a browser, or `undefined` in Node. */
export function pageLocation(): { href: string; protocol: string; host: string } | undefined {
  return (globalThis as { location?: { href: string; protocol: string; host: string } }).location;
}

/** Encodes one path segment. */
function enc(segment: string): string {
  return encodeURIComponent(segment);
}

/** Parses a response body, empty as `null`, without throwing. */
function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  if (text === '') return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** The problem code for an error status whose body isn't a problem document. */
const FALLBACK_CODES: Record<number, ProblemCode> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'content_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
  502: 'server_unavailable',
  503: 'server_unavailable',
  504: 'server_unavailable',
};

/**
 * Turns an error response body into a problem document, inventing one when the body isn't a problem: for
 * example the HTML page a proxy sends when the bxvtt server is down, which becomes `server_unavailable`.
 */
function toProblem(body: unknown, status: number): Problem {
  if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string') {
    return body as Problem;
  }
  const code = FALLBACK_CODES[status] ?? (status >= 500 ? 'internal_error' : 'bad_request');
  return {
    type: 'about:blank',
    title: 'Error',
    status,
    code,
    detail:
      code === 'server_unavailable'
        ? `The server isn't responding (HTTP ${status}). It may be starting or restarting.`
        : `The server returned an unexpected error (HTTP ${status}).`,
  };
}
