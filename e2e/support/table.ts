/**
 * Sets tables up through the SDK, so a spec reaches the state it tests quickly and drives only the thing under
 * test through the interface. Every character uses a fixed seed.
 */
import type { BxvttClient } from '@bxvtt/shared/client';
import type { Command, GameState, StoredCharacter, TableDetail, TableSettings } from '@bxvtt/shared/protocol';
import { expect, type Page } from '@playwright/test';
import type { Actor } from './fixtures';

/** The adventure IDs of the table's adventure list. */
export const ADVENTURES = {
  barrow: 'builtin-barrow',
  bell: 'sample:the-drowned-bell',
  toll: 'sample:the-toll-bridge',
} as const;

/** The seven classes, with a starting kit each can afford on its seed and a seed that gives good hit points. */
export const CLASSES = {
  fighter: {
    seed: 109,
    buy: ['chainmail', 'shield', 'sword', 'torch'],
    equip: ['chainmail', 'shield', 'sword'],
  },
  cleric: {
    seed: 63,
    buy: ['chainmail', 'shield', 'mace', 'holy_symbol'],
    equip: ['chainmail', 'shield', 'mace'],
  },
  magic_user: { seed: 19, buy: ['dagger', 'torch'], equip: ['dagger'], spells: ['sleep'] },
  thief: { seed: 19, buy: ['leather', 'sword', 'thieves_tools', 'torch'], equip: ['leather', 'sword'] },
  dwarf: {
    seed: 63,
    buy: ['chainmail', 'shield', 'war_hammer'],
    equip: ['chainmail', 'shield', 'war_hammer'],
  },
  elf: { seed: 63, buy: ['chainmail', 'sword'], equip: ['chainmail', 'sword'], spells: ['sleep'] },
  halfling: {
    seed: 63,
    buy: ['leather', 'short_sword', 'shield'],
    equip: ['leather', 'short_sword', 'shield'],
  },
} as const satisfies Record<string, { seed: number; buy: string[]; equip: string[]; spells?: string[] }>;

/** A class ID from {@link CLASSES}. */
export type ClassId = keyof typeof CLASSES;

/** One party member to create: its owner, name, class, and optionally a different seed or kit. */
export interface MemberSpec {
  owner: Actor;
  name: string;
  classId: ClassId;
  seed?: number;
  buy?: string[];
  equip?: string[];
  spells?: string[];
}

/**
 * Creates a stored character with a fixed seed.
 *
 * @param client - The owner's SDK client.
 * @param spec - The name, class, and optional overrides.
 */
export async function createCharacter(
  client: BxvttClient,
  spec: Omit<MemberSpec, 'owner'>,
): Promise<StoredCharacter> {
  const kit = CLASSES[spec.classId];
  const spells = spec.spells ?? ('spells' in kit ? [...kit.spells] : undefined);
  return client.createCharacter({
    name: spec.name,
    class_id: spec.classId,
    alignment: 'lawful',
    seed: spec.seed ?? kit.seed,
    purchases: (spec.buy ?? kit.buy).map((item_id) => ({ item_id })),
    equip_item_ids: [...(spec.equip ?? kit.equip)],
    ...(spells === undefined ? {} : { starting_spell_ids: spells }),
  });
}

/** Options for {@link setupTable}. */
export interface TableSetup {
  name?: string;
  referee: Actor;
  players?: Actor[];
  /** The party in marching order. */
  party?: MemberSpec[];
  adventure?: string;
  /** Start the game. Defaults to `true` when the party isn't empty. */
  start?: boolean;
  /** The session seed. Defaults to 1981, so every game's dice repeat. */
  seed?: number;
  settings?: Partial<TableSettings>;
}

/** A table that {@link setupTable} made. */
export interface SetupResult {
  table: TableDetail;
  game: GameState | null;
  characters: StoredCharacter[];
  /** The table page's path, such as `/tables/tbl_…`. */
  path: string;
}

/**
 * Creates a table, has the players join it, creates the party, and starts the game.
 *
 * @param setup - Who sits at the table, the party, the adventure, and the seed.
 */
export async function setupTable(setup: TableSetup): Promise<SetupResult> {
  const { referee } = setup;
  const players = setup.players ?? [];
  const created = await referee.client.createTable({ name: setup.name ?? 'Test table' });
  for (const player of players) await player.client.joinTable(created.invite_code);
  if (setup.settings !== undefined) {
    await referee.client.updateTable(created.id, { settings: setup.settings });
  }
  const characters: StoredCharacter[] = [];
  for (const member of setup.party ?? []) {
    const character = await createCharacter(member.owner.client, member);
    characters.push(character);
    await member.owner.client.addToRoster(created.id, character.id);
  }
  const start = setup.start ?? characters.length > 0;
  const game = start
    ? await referee.client.startGame(created.id, {
        adventure_id: setup.adventure ?? ADVENTURES.bell,
        seed: setup.seed ?? 1981,
      })
    : null;
  const table = await referee.client.getTable(created.id);
  return { table, game, characters, path: `/tables/${created.id}` };
}

/**
 * Sends a command through the SDK at the game's current revision and expects bxapi to accept it.
 *
 * @param client - The sender's SDK client.
 * @param tableId - The table.
 * @param command - The command.
 * @returns The game state after the command.
 */
export async function send(client: BxvttClient, tableId: string, command: Command): Promise<GameState> {
  const game = await client.getGame(tableId);
  const result = await client.sendCommand(tableId, command, game.revision);
  expect(result.rejections, `bxapi should accept ${command.command_type}`).toEqual([]);
  expect(result.accepted).toBe(true);
  return result.game;
}

/** A cell in a dungeon, with the way the party faces. */
export interface Spot {
  dungeon: string;
  level: number;
  x: number;
  y: number;
  facing?: 'north' | 'south' | 'east' | 'west';
}

/**
 * Moves the party to a cell with the referee command `place_party`.
 *
 * @param referee - The referee's SDK client.
 * @param tableId - The table.
 * @param spot - Where to put the party.
 */
export async function placeParty(referee: BxvttClient, tableId: string, spot: Spot): Promise<GameState> {
  return send(referee, tableId, {
    command_type: 'place_party',
    location: {
      kind: 'dungeon',
      dungeon_id: spot.dungeon,
      level_number: spot.level,
      position: [spot.x, spot.y],
      facing: spot.facing ?? 'north',
    },
  });
}

/** Takes the party from town into a dungeon through the SDK. */
export async function enterDungeon(
  client: BxvttClient,
  tableId: string,
  dungeonId: string,
): Promise<GameState> {
  return send(client, tableId, { command_type: 'enter_dungeon', dungeon_id: dungeonId });
}

/**
 * Opens a table page and waits until the table has loaded and its connection is open.
 *
 * @param page - The page.
 * @param path - The table path from {@link setupTable}.
 */
export async function openTable(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByText(/connecting|reconnecting/i)).toHaveCount(0, { timeout: 20_000 });
}

/** Waits until the SDK reads a game state that passes a test. */
export async function waitForGame(
  client: BxvttClient,
  tableId: string,
  test: (game: GameState) => boolean,
  message = 'the game state',
): Promise<GameState> {
  let last: GameState | null = null;
  await expect
    .poll(
      async () => {
        last = await client.getGame(tableId);
        return test(last);
      },
      { message, timeout: 20_000 },
    )
    .toBe(true);
  if (last === null) throw new Error('No game state was read.');
  return last;
}
