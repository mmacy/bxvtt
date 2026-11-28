import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { BxvttClient, TableConnection } from '@bxvtt/shared/client';
import type { CharacterChoices, GameState, ServerMessage, StoredCharacter } from '@bxvtt/shared/protocol';
import { RefereeTableDetail } from '@bxvtt/shared/protocol';
import { createServer } from '../src/app';
import type { Server } from '../src/app';
import type { Config } from '../src/config';
import { loadConfig } from '../src/config';

/** The bxapi the tests use. Never the one on port 8640. */
export const BXAPI_URL = process.env.BXAPI_URL ?? 'http://127.0.0.1:8651';

/** Settings a test changes. Rate limits and quotas merge with the test defaults. */
export type ServerOverrides = Omit<Partial<Config>, 'rateLimits' | 'quotas'> & {
  rateLimits?: Partial<Config['rateLimits']>;
  quotas?: Partial<Config['quotas']>;
};

/** A server started for one test file, on a free port with its own data directory. */
export interface TestServer {
  server: Server;
  url: string;
  wsUrl: string;
  config: Config;
  /**
   * Stops the server. It first deletes what the server stored in bxapi, unless `keepInBxapi` is set for a test
   * that starts another server on the same data directory. It removes the data directory only when it made it.
   */
  close: (options?: { keepInBxapi?: boolean }) => Promise<void>;
}

/**
 * Starts a bxvtt server in-process on port 0, with a temporary data directory and an empty sample directory.
 *
 * @param overrides - Settings to change, such as a host key or rate limits.
 * @param samples - Sample adventure files to put in the sample directory, by file name.
 */
export async function startServer(
  overrides: ServerOverrides = {},
  samples: Record<string, string> = {},
): Promise<TestServer> {
  const keep = overrides.dataDir !== undefined;
  const dataDir = overrides.dataDir ?? (await mkdtemp(join(tmpdir(), 'bxvtt-test-')));
  const adventuresDir = join(dataDir, 'adventures');
  await mkdir(adventuresDir, { recursive: true });
  for (const [name, text] of Object.entries(samples)) await writeFile(join(adventuresDir, name), text);
  const base = loadConfig({
    BXAPI_URL,
    BXVTT_PORT: '0',
    BXVTT_DATA_DIR: dataDir,
    BXVTT_WEB_DIST: join(dataDir, 'web'),
  });
  const generous = { capacity: 10_000, windowMs: 60_000 };
  const config: Config = {
    ...base,
    adventuresDir,
    logLevel: process.env.BXVTT_TEST_LOG ?? 'silent',
    allowCharacterSeeds: true,
    ...overrides,
    rateLimits: {
      createUser: generous,
      join: generous,
      failedAuth: generous,
      failedHostKey: generous,
      userWrites: generous,
      userPosts: generous,
      characterChecks: generous,
      rejoin: generous,
      rejoinPolls: generous,
      ...overrides.rateLimits,
    },
    quotas: { ...base.quotas, ...overrides.quotas },
  };
  const server = await createServer(config);
  await server.app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = server.app.server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}/ws`,
    config,
    close: async (options = {}) => {
      if (options.keepInBxapi !== true) await removeFromBxapi(server);
      await server.app.close();
      if (!keep) await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Deletes what a test server stored in the shared development bxapi: its tables' sessions, saves, and uploads,
 * its users' characters, and its sample uploads. Without this, test runs fill bxapi's per-client storage.
 *
 * @param server - The server.
 */
async function removeFromBxapi(server: Server): Promise<void> {
  const { ctx } = server;
  try {
    for (const row of ctx.db.all('SELECT id FROM tables')) await ctx.game.deleteTable(String(row.id));
    for (const row of ctx.db.all('SELECT id FROM characters'))
      await ctx.janitor.remove('character', String(row.id));
    for (const row of ctx.db.all('SELECT adventure_id FROM samples')) {
      await ctx.janitor.remove('adventure', String(row.adventure_id));
    }
  } catch {
    // A test that stopped bxapi, or closed the database already, has nothing more to clean.
  }
}

/** A user with an SDK client whose HTTP response bodies are recorded. */
export interface TestUser {
  client: BxvttClient;
  id: string;
  name: string;
  token: string;
  /** Every HTTP response body the user received, as text. */
  received: string[];
}

/**
 * Creates a user on the server.
 *
 * @param server - The server.
 * @param name - The display name.
 */
export async function createUser(server: TestServer, name: string): Promise<TestUser> {
  const received: string[] = [];
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const text = await response.clone().text();
    received.push(text);
    return response;
  };
  const client = new BxvttClient({ baseUrl: server.url, fetch: recordingFetch });
  const created = await client.createUser(name);
  return { client, id: created.user.id, name, token: created.token, received };
}

/** A WebSocket connection that records every message it receives. */
export interface TestConnection {
  connection: TableConnection;
  /** Every message, as the server sent it. */
  messages: ServerMessage[];
  close: () => void;
}

/**
 * Opens a table connection and waits for its first snapshot.
 *
 * @param server - The server.
 * @param user - The user.
 * @param tableId - The table.
 */
export async function connect(server: TestServer, user: TestUser, tableId: string): Promise<TestConnection> {
  const connection = new TableConnection({
    url: server.wsUrl,
    token: user.token,
    tableId,
    reconnectInitialMs: 50,
    reconnectMaxMs: 500,
  });
  const messages: ServerMessage[] = [];
  connection.onAny((message) => messages.push(message));
  const snapshot = connection.next('snapshot');
  connection.connect();
  await snapshot;
  return { connection, messages, close: () => connection.close() };
}

/**
 * Creates a fighter-like character with a fixed seed for a user, the way the wizard does: an ability roll at a
 * table, the hit points and the gold, then the character with its kit. bxapi derives every roll from the seed, so
 * the same seed gives the same character as before rolls belonged to tables.
 *
 * @param user - The owner.
 * @param name - The character's name.
 * @param classId - The class.
 * @param seed - The seed for the scores and rolls.
 * @param tableId - The table to roll at. Defaults to the user's newest table.
 */
export async function createCharacter(
  user: TestUser,
  name: string,
  classId = 'fighter',
  seed = 1,
  tableId?: string,
): Promise<StoredCharacter> {
  const kits: Record<string, string[]> = {
    fighter: ['leather', 'sword'],
    cleric: ['leather', 'mace'],
    thief: ['leather', 'dagger'],
  };
  const kit = kits[classId] ?? [];
  return createFromRoll(
    user,
    {
      name,
      class_id: classId,
      alignment: 'lawful',
      purchases: kit.map((item_id) => ({ item_id })),
      equip_item_ids: kit,
    },
    seed,
    tableId,
  );
}

/**
 * Creates a character from choices with a fixed seed: rolls ability scores at a table, rolls the hit points and
 * the gold for the class, and creates the character from the roll.
 *
 * @param user - The owner.
 * @param choices - The character's choices, without `ability_roll_id`.
 * @param seed - The seed for the scores and rolls.
 * @param tableId - The table to roll at. Defaults to the user's newest table.
 */
export async function createFromRoll(
  user: TestUser,
  choices: CharacterChoices,
  seed = 1,
  tableId?: string,
): Promise<StoredCharacter> {
  const table = tableId ?? (await user.client.listTables()).items[0]?.id;
  if (table === undefined) throw new Error(`${user.name} has no table to roll at. Create or join one first.`);
  const roll = await user.client.rollAbilities(table, { seed });
  const starting = {
    class_id: choices.class_id,
    ...(choices.starting_spell_ids === undefined ? {} : { starting_spell_ids: choices.starting_spell_ids }),
  };
  await user.client.rollHitPoints(roll.id, starting);
  await user.client.rollStartingGold(roll.id, starting);
  return user.client.createCharacter({ ...choices, ability_roll_id: roll.id });
}

/**
 * Creates a table with a referee, and has each player join it.
 *
 * @param referee - The referee.
 * @param players - The players.
 * @param name - The table's name.
 */
export async function createTable(
  referee: TestUser,
  players: TestUser[],
  name = 'Test table',
): Promise<RefereeTableDetail> {
  const table = await referee.client.createTable({ name });
  for (const player of players) await player.client.joinTable(table.invite_code);
  return RefereeTableDetail.parse(await referee.client.getTable(table.id));
}

/**
 * Waits until a condition holds, checking every 20 ms.
 *
 * @param condition - The condition.
 * @param timeoutMs - How long to wait.
 */
export async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('The condition did not hold in time.');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * The strings that must never appear in anything a player receives. Each one marks referee-only data: a referee
 * event or feed entry, a referee pin, the referee view's dynamic and static parts, or a secret roll.
 */
export const REFEREE_MARKERS = [
  '"visibility":"referee',
  '"secret":true',
  '"dungeon_state"',
  '"command_log"',
  '"event_log"',
  '"listener_state"',
  '"allocator"',
  '"ledger"',
  '"fired_triggers"',
  '"treasure_snapshot_cp"',
  '"defeated_monsters"',
  '"monster_ids"',
  '"feature_handles"',
  '"referee_notes"',
  'hoard_generated',
  'surprise_rolled',
  'reaction_rolled',
];

/**
 * Finds referee-only data in what a player received.
 *
 * @param texts - The player's HTTP bodies and WebSocket messages, as text.
 * @param extraMarkers - More strings that must not appear, such as the text of the referee notes.
 * @returns Each marker found, with a little context.
 */
export function findRefereeData(texts: string[], extraMarkers: string[] = []): string[] {
  const found: string[] = [];
  for (const text of texts) {
    for (const marker of [...REFEREE_MARKERS, ...extraMarkers]) {
      const index = text.indexOf(marker);
      if (index >= 0) found.push(`${marker}: …${text.slice(Math.max(0, index - 80), index + 80)}…`);
    }
    if (/"referee":\{/.test(text)) found.push('"referee":{ (a referee state)');
  }
  return found;
}

/**
 * Finds monster and NPC IDs in what a player received that bxapi's player projection hadn't shown the player. A
 * player may receive a creature's ID only once the player view listed it in `encounter.groups[].members`, or a
 * player-visibility event named it, in that message or an earlier one. Every event a player receives must have
 * player visibility.
 *
 * Pass one stream at a time, in the order the player received it, such as the HTTP bodies or the WebSocket
 * messages, so an ID counts as shown only after the message that showed it.
 *
 * @param texts - The player's HTTP bodies or WebSocket messages, as text, in order.
 * @param creatureIds - The monster and NPC IDs of the session, from the referee state.
 * @returns Each ID found before the player could know it, and each event without player visibility, with a
 *   little context.
 */
export function findUnshownCreatureIds(texts: string[], creatureIds: string[]): string[] {
  const shown = new Set<string>();
  const found: string[] = [];
  const learn = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(learn);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.members) && typeof record.label === 'string') {
      // An encounter group of the player view.
      for (const member of record.members as { id?: unknown }[]) {
        if (typeof member.id === 'string') shown.add(member.id);
      }
    }
    if (Array.isArray(record.events)) {
      for (const event of record.events as Record<string, unknown>[]) {
        if (event.visibility !== 'player') {
          found.push(
            `an event with ${String(event.visibility)} visibility: ${JSON.stringify(event).slice(0, 160)}`,
          );
          continue;
        }
        const text = JSON.stringify(event);
        for (const id of creatureIds) if (text.includes(`"${id}"`)) shown.add(id);
      }
    }
    Object.values(record).forEach(learn);
  };
  for (const text of texts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    learn(parsed);
    for (const id of creatureIds) {
      const index = text.indexOf(`"${id}"`);
      if (index >= 0 && !shown.has(id)) {
        found.push(`${id}: …${text.slice(Math.max(0, index - 80), index + 80)}…`);
      }
    }
  }
  return found;
}

/**
 * Waits until a connection has received a message of one type that passes a test, including messages that
 * arrived before the call.
 *
 * @param ws - The connection.
 * @param type - The message type.
 * @param predicate - The test.
 * @param timeoutMs - How long to wait.
 * @returns The first matching message.
 */
export async function received<T extends ServerMessage['type']>(
  ws: TestConnection,
  type: T,
  predicate: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  timeoutMs = 5000,
): Promise<Extract<ServerMessage, { type: T }>> {
  const find = () =>
    ws.messages.find(
      (message): message is Extract<ServerMessage, { type: T }> =>
        message.type === type && predicate(message as Extract<ServerMessage, { type: T }>),
    );
  await waitFor(() => find() !== undefined, timeoutMs);
  const match = find();
  if (match === undefined) throw new Error(`No ${type} message arrived.`);
  return match;
}

/**
 * Reads where the party stands from a game's player view: the level, the entered area that covers the party's
 * cell, and the features the party can reach there. A feature on a cell is reachable from that cell, and an
 * area-wide feature from anywhere in its area.
 *
 * @param game - The game state.
 * @returns `null` in town.
 */
export function viewHere(game: GameState): {
  level: GameState['view']['explored'][number];
  area: GameState['view']['explored'][number]['areas'][number] | null;
  features: GameState['view']['explored'][number]['features'];
} | null {
  const location = game.view.location;
  if (location.kind !== 'dungeon' || location.position == null) return null;
  const [x, y] = location.position;
  const level = game.view.explored.find(
    (entry) => entry.dungeon_id === location.dungeon_id && entry.level_number === location.level_number,
  );
  if (level === undefined) return null;
  const area =
    level.areas.find((entry) => entry.cells.some((cell) => cell[0] === x && cell[1] === y)) ?? null;
  const features = level.features.filter((feature) =>
    feature.cell != null
      ? feature.cell[0] === x && feature.cell[1] === y
      : feature.area_id != null && feature.area_id === area?.id,
  );
  return { level, area, features };
}

/** One request the server sent bxapi. */
export interface BxapiCall {
  method: string;
  path: string;
  /** The JSON body as sent, from `body` or `rawBody`, or `undefined` for none. */
  body: string | undefined;
}

/**
 * Records every request the server sends bxapi, from now until `stop`. It wraps `BxapiClient.request`, which every
 * call goes through: `get` and `post` call it, and the command pipeline calls it directly with `rawBody`. A test
 * that wraps `post` alone never sees a command.
 *
 * @param server - The test server.
 * @returns The calls so far, a count of POSTs whose path ends with a suffix, and `stop` to unwrap.
 */
export function recordBxapi(server: TestServer): {
  calls: BxapiCall[];
  posts: (suffix: string) => BxapiCall[];
  stop: () => void;
} {
  const bxapi = server.server.ctx.bxapi;
  const original = bxapi.request;
  const calls: BxapiCall[] = [];
  bxapi.request = (async (method: string, path: string, options?: Parameters<typeof original>[2]) => {
    const body = options?.rawBody ?? (options?.body === undefined ? undefined : JSON.stringify(options.body));
    calls.push({ method, path, body });
    return original.call(bxapi, method, path, options);
  }) as typeof bxapi.request;
  return {
    calls,
    posts: (suffix) => calls.filter((call) => call.method === 'POST' && call.path.endsWith(suffix)),
    stop: () => {
      bxapi.request = original;
    },
  };
}
