import type { BattleDeclaration } from '../bxapi';
import type {
  AbilityRoll,
  AbilityRollRequest,
  AdventureDocument,
  AdventureList,
  AdventureListing,
  AdventureValidation,
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
    if (this.token !== null) headers.Authorization = `Bearer ${this.token}`;
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const response = await this.fetchImpl(url, { method, headers, body });
    if (response.status === 204) return null as T;
    const text = await response.text();
    const parsed: unknown = text === '' ? null : JSON.parse(text);
    if (!response.ok) {
      throw new BxvttProblemError(toProblem(parsed, response.status));
    }
    return parsed as T;
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

/** Turns an error response body into a problem document, inventing one when the body isn't a problem. */
function toProblem(body: unknown, status: number): Problem {
  if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string') {
    return body as Problem;
  }
  return {
    type: 'about:blank',
    title: 'Error',
    status,
    code: status >= 500 ? 'internal_error' : 'bad_request',
    detail: `The server answered with status ${status}.`,
  };
}
