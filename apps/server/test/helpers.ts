import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { BxvttClient, TableConnection } from '@bxvtt/shared/client';
import type { ServerMessage, StoredCharacter, TableDetail } from '@bxvtt/shared/protocol';
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
  close: () => Promise<void>;
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
    close: async () => {
      await server.app.close();
      if (!keep) await rm(dataDir, { recursive: true, force: true });
    },
  };
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
 * Creates a fighter-like character with a fixed seed for a user.
 *
 * @param user - The owner.
 * @param name - The character's name.
 * @param classId - The class.
 * @param seed - The seed for the scores and rolls.
 */
export async function createCharacter(
  user: TestUser,
  name: string,
  classId = 'fighter',
  seed = 1,
): Promise<StoredCharacter> {
  const kits: Record<string, string[]> = {
    fighter: ['leather', 'sword'],
    cleric: ['leather', 'mace'],
    thief: ['leather', 'dagger'],
  };
  const kit = kits[classId] ?? [];
  return user.client.createCharacter({
    name,
    class_id: classId,
    alignment: 'lawful',
    purchases: kit.map((item_id) => ({ item_id })),
    equip_item_ids: kit,
    seed,
  });
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
): Promise<TableDetail> {
  const table = await referee.client.createTable({ name });
  for (const player of players) await player.client.joinTable(table.invite_code);
  return referee.client.getTable(table.id);
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
 * Finds monster IDs in what a player received, outside bxapi's own player events and messages, which may name a
 * monster by ID. The server names a monster to a player only by its target handle, except in a feed entry's
 * `names`, which may hold labels for the monster IDs of that entry's own events.
 *
 * @param texts - The player's HTTP bodies and WebSocket messages, as text.
 * @param monsterIds - The monster IDs of the session, from the referee state.
 * @returns Each ID found, with a little context.
 */
export function findMonsterIds(texts: string[], monsterIds: string[]): string[] {
  // A feed entry's `names` may name the monster IDs of its own events, and nothing more.
  const namesOnlyFromEvents = (record: Record<string, unknown>): boolean => {
    const names = record.names as { monsters?: Record<string, unknown> } | undefined;
    if (!Array.isArray(record.events) || names === undefined) return false;
    const events = JSON.stringify(record.events);
    return Object.keys(names.monsters ?? {}).every((id) => events.includes(`"${id}"`));
  };
  const withoutEvents = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutEvents);
    if (typeof value !== 'object' || value === null) return value;
    const record = value as Record<string, unknown>;
    const dropNames = namesOnlyFromEvents(record);
    return Object.fromEntries(
      Object.entries(record)
        .filter(([key, entry]) => !((key === 'events' || key === 'messages') && Array.isArray(entry)))
        .filter(([key]) => !(key === 'names' && dropNames))
        .map(([key, entry]) => [key, withoutEvents(entry)]),
    );
  };
  const found: string[] = [];
  for (const text of texts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const rest = JSON.stringify(withoutEvents(parsed));
    for (const id of monsterIds) {
      const index = rest.indexOf(`"${id}"`);
      if (index >= 0) found.push(`${id}: …${rest.slice(Math.max(0, index - 80), index + 80)}…`);
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
