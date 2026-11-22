/**
 * Helpers for the encounter and battle specs: a Drowned Bell party for two players, the SDK steps that bring it
 * to a fight, and locators for the encounter panel and the battle board.
 */
import type { BxvttClient } from '@bxvtt/shared/client';
import type { GameState } from '@bxvtt/shared/protocol';
import { expect, type Locator, type Page } from '@playwright/test';
import type { Actor, Crew } from './fixtures';
import { enterDungeon, placeParty, send, setupTable, waitForGame, type MemberSpec } from './table';

/** A table with a referee (Ruth) and two players (Sam and Ann) in a game of The Drowned Bell. */
export interface CombatTable {
  ruth: Actor;
  sam: Actor;
  ann: Actor;
  tableId: string;
  path: string;
  /** The party member ID of a character, such as `character-0004` for Tamsin. Throws for an unknown name. */
  memberId(name: string): string;
}

/** Options for {@link combatTable}. */
export interface CombatTableOptions {
  /**
   * `strong` is Brenna (fighter) and Wren (thief) for Sam, and Osric (cleric) and Tamsin (magic-user with
   * *magic missile* memorized) for Ann. `weak` is Brenna and Tamsin with 1 hit point each, one for each player.
   */
  party?: 'strong' | 'weak';
  /** The session seed. */
  seed?: number;
  autoResolve?: boolean;
  /** Takes the party into the priory. Defaults to `true`. */
  enter?: boolean;
}

/**
 * Sets up a Drowned Bell table for a fight through the SDK. Sam owns the first seat, so he is the caller. With
 * the strong party, the party rests a night in town and Tamsin memorizes *magic missile* before it sets out.
 */
export async function combatTable(crew: Crew, options: CombatTableOptions = {}): Promise<CombatTable> {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const ann = await crew.person('Ann');
  const strong = (options.party ?? 'strong') === 'strong';
  const party: MemberSpec[] = strong
    ? [
        { owner: sam, name: 'Brenna', classId: 'fighter' },
        { owner: sam, name: 'Wren', classId: 'thief', buy: ['leather', 'sword'] },
        { owner: ann, name: 'Osric', classId: 'cleric' },
        { owner: ann, name: 'Tamsin', classId: 'magic_user', buy: ['dagger'], spells: ['magic_missile'] },
      ]
    : [
        {
          owner: sam,
          name: 'Brenna',
          classId: 'fighter',
          seed: 106,
          buy: ['leather', 'sword'],
          equip: ['leather', 'sword'],
        },
        {
          owner: ann,
          name: 'Tamsin',
          classId: 'magic_user',
          seed: 110,
          buy: ['dagger'],
          spells: ['magic_missile'],
        },
      ];
  const setup = await setupTable({
    name: 'Fight night',
    referee: ruth,
    players: [sam, ann],
    party,
    seed: options.seed ?? 1981,
    settings: { auto_resolve: options.autoResolve ?? true },
  });
  const tableId = setup.table.id;
  const game = setup.game as GameState;
  const memberId = (name: string): string => {
    const seat = game.seats.find((candidate) => candidate.name === name);
    if (seat === undefined) throw new Error(`Nobody named ${name} is in the party.`);
    return seat.member_id;
  };
  if (strong) {
    await send(sam.client, tableId, { command_type: 'rest', kind: 'night' });
    await send(ann.client, tableId, {
      command_type: 'prepare_spells',
      character_id: memberId('Tamsin'),
      selections: [{ spell_id: 'magic_missile' }],
    });
  }
  if (options.enter ?? true) await enterDungeon(sam.client, tableId, 'priory');
  return { ruth, sam, ann, tableId, path: setup.path, memberId };
}

/** Walks the party from the priory's entrance three cells north into the guardroom, where two goblins wait. */
export async function walkIntoGuardroom(caller: BxvttClient, tableId: string): Promise<GameState> {
  let game = await caller.getGame(tableId);
  for (let step = 0; step < 3 && game.mode === 'exploring'; step += 1) {
    game = await send(caller, tableId, { command_type: 'move_party', direction: 'north' });
  }
  expect(game.mode).toBe('encounter');
  return game;
}

/**
 * Brings the party to Gashnak One-Ear in the warden's cell: the referee places it in the dorter, north of the
 * cell's stuck door, Brenna forces the door until it gives way, and the party steps south into the cell, where
 * Gashnak and two goblins wait.
 */
export async function walkIntoWardensCell(table: CombatTable): Promise<GameState> {
  const { ruth, sam, tableId, memberId } = table;
  await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 26, y: 15, facing: 'south' });
  let game = await sam.client.getGame(tableId);
  for (let attempt = 0; attempt < 10 && game.mode === 'exploring'; attempt += 1) {
    const result = await sam.client.sendCommand(
      tableId,
      { command_type: 'force_door', direction: 'south', character_id: memberId('Brenna') },
      game.revision,
    );
    game = result.game;
    if (result.accepted && doorOpen(game, 26, 16, 'north')) break;
  }
  expect(game.mode).toBe('exploring');
  game = await send(sam.client, tableId, { command_type: 'move_party', direction: 'south' });
  expect(game.mode).not.toBe('exploring');
  return game;
}

/** Whether the party's map shows a door open on one edge of a cell. */
function doorOpen(game: GameState, x: number, y: number, side: string): boolean {
  const location = game.view.location;
  if (location.kind !== 'dungeon') return false;
  const level = game.view.explored.find(
    (candidate) =>
      candidate.dungeon_id === location.dungeon_id && candidate.level_number === location.level_number,
  );
  return level?.edges[`${x},${y}:${side}`]?.door_open === true;
}

/**
 * Moves the party one cell with an arrow key on the map, and waits until the map's position text shows the new
 * cell. The client drops a key press while the previous move is still settling, as it should, so this presses
 * again only when the map still shows the old cell after two seconds.
 */
export async function stepParty(
  page: Page,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
  to: readonly [number, number],
): Promise<void> {
  const arrived = page.getByText(new RegExp(`The party is at ${to[0]}, ${to[1]}, facing`));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('application', { name: /^Dungeon map/ }).focus();
    await page.keyboard.press(key);
    try {
      await expect(arrived).toBeAttached({ timeout: 2000 });
      return;
    } catch {
      // The press arrived while the last move was settling. Press again.
    }
  }
  await expect(arrived).toBeAttached();
}

/** The encounter panel over the map. */
export function encounterPanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Encounter' });
}

/** The battle board over the map. */
export function battleBoard(page: Page): Locator {
  return page.getByRole('region', { name: /^Battle, round \d+/ });
}

/** One party member's row on the battle board. */
export function declarationRow(page: Page, name: string): Locator {
  return battleBoard(page)
    .getByRole('list', { name: 'Declarations this round' })
    .getByRole('listitem')
    .filter({ hasText: name });
}

/**
 * Runs an action that saves a declaration, and waits for the server to answer. The round can resolve the moment
 * the last declaration arrives, so checking the row afterwards would race the next round.
 */
export async function declaring(page: Page, action: () => Promise<void>): Promise<void> {
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().includes('/game/declarations/'),
  );
  await action();
  expect((await saved).ok()).toBe(true);
}

/**
 * Declares a member's suggested action, the first button in the member's row. The board opens the next
 * undeclared member's choices after each declaration, which hides that member's suggestion, so this closes any
 * open choices first. Does nothing for a member who can't act or has declared.
 *
 * @returns Whether it declared.
 */
export async function declareSuggested(page: Page, name: string): Promise<boolean> {
  const row = declarationRow(page, name);
  const close = page.getByRole('button', { name: `Close ${name}'s choices` });
  if ((await close.count()) > 0) {
    await close.click();
    await expect(close).toHaveCount(0);
  }
  const quick = row.getByRole('button', { name: /^(Close in|Attack|Shoot|Throw)/ }).first();
  try {
    await quick.waitFor({ timeout: 2000 });
  } catch {
    return false;
  }
  if (!(await quick.isEnabled())) return false;
  await declaring(page, () => quick.click());
  return true;
}

/** The dock tab that shows the feed, and the feed's entries. */
export async function openFeed(page: Page): Promise<Locator> {
  await page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: /^Feed/ }).click();
  return page.getByRole('region', { name: 'Feed entries' });
}

/**
 * Plays battle rounds through the SDK until the battle ends or `until` holds: each living declarer closes in on
 * the first group still standing, or attacks it once within 5 feet. Each player declares for their own seats, so
 * the server resolves each round by itself when `auto_resolve` is on.
 *
 * @returns The game state when the loop stops.
 */
export async function fightThroughSdk(
  table: CombatTable,
  until: (game: GameState) => boolean = () => false,
  maxRounds = 12,
): Promise<GameState> {
  const { tableId } = table;
  const clients = new Map([
    [table.sam.id, table.sam.client],
    [table.ann.id, table.ann.client],
  ]);
  let game = await table.ruth.client.getGame(tableId);
  for (let round = 0; round < maxRounds && game.mode === 'battle' && !until(game); round += 1) {
    const encounter = game.view.encounter;
    const group = encounter?.groups.find((candidate) => !candidate.fled && candidate.count > 0);
    if (encounter === null || encounter === undefined || group === undefined) break;
    const before = game.revision;
    for (const memberId of encounter.declarers) {
      const owner = game.seats.find((seat) => seat.member_id === memberId)?.user_id ?? null;
      const client = (owner !== null ? clients.get(owner) : undefined) ?? table.ruth.client;
      const distance = group.member_distance_feet?.[memberId] ?? group.distance_feet;
      await client.declare(
        tableId,
        memberId,
        distance > 5
          ? { action: 'move', move: 'close', target_group_id: group.id }
          : { action: 'attack', target_group_id: group.id },
      );
    }
    game = await waitForGame(
      table.ruth.client,
      tableId,
      (next) => next.revision > before,
      'the round to resolve',
    );
  }
  return game;
}
