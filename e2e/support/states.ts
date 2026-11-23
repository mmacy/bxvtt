/**
 * Reaches each mode of a game through the SDK, for specs that test every screen rather than one feature: the
 * accessibility and layout spec and the performance spec. Each helper returns a table with a referee (Ruth) and
 * a player (Sam), where Sam owns the first seat and is the caller.
 */
import { USER_COLORS, type GameState } from '@bxvtt/shared/protocol';
import { expect } from '@playwright/test';
import type { Actor, Crew, PersonOptions } from './fixtures';
import {
  ADVENTURES,
  enterDungeon,
  placeParty,
  send,
  setupTable,
  type MemberSpec,
  type SetupResult,
} from './table';

/** The modes a helper can reach. */
export type Stage = 'lobby' | 'town' | 'exploring' | 'encounter' | 'battle' | 'game_over';

/** A table in a known stage. */
export interface StagedTable extends SetupResult {
  ruth: Actor;
  sam: Actor;
  tableId: string;
}

/**
 * Creates a table in a stage of The Drowned Bell.
 *
 * - `lobby`: both characters on the roster, no game.
 * - `town`: the game started in Hollin Ferry.
 * - `exploring`: the party at the priory's entrance.
 * - `encounter`: the indifferent kobolds of the drain warren, 40 feet away.
 * - `battle`: a battle against two goblins.
 * - `game_over`: a one-member party with 1 hit point killed by goblins.
 *
 * @param crew - The crew fixture.
 * @param stage - The stage to reach.
 * @param options - Browser options for both people.
 */
export async function stagedTable(
  crew: Crew,
  stage: Stage,
  options: PersonOptions = {},
): Promise<StagedTable> {
  const ruth = await crew.person('Ruth', options);
  const sam = await crew.person('Sam', options);
  // The server picks each user's color at random. Fixed colors keep screenshots and contrast checks repeatable.
  await ruth.client.updateMe({ color: USER_COLORS[0] });
  await sam.client.updateMe({ color: USER_COLORS[1] });
  const party: MemberSpec[] =
    stage === 'game_over'
      ? [{ owner: sam, name: 'Flarg', classId: 'fighter', seed: 106 }]
      : [
          { owner: sam, name: 'Flarg', classId: 'fighter' },
          { owner: sam, name: 'Tinks', classId: 'thief' },
          { owner: ruth, name: 'Clarence', classId: 'cleric' },
          { owner: ruth, name: 'Mazpar', classId: 'magic_user' },
        ];
  const setup = await setupTable({
    name: 'The bell tolls',
    referee: ruth,
    players: [sam],
    party,
    adventure: ADVENTURES.bell,
    start: stage !== 'lobby',
  });
  const tableId = setup.table.id;
  const staged: StagedTable = { ...setup, ruth, sam, tableId };
  if (stage === 'lobby' || stage === 'town') return staged;

  let game: GameState = await enterDungeon(sam.client, tableId, 'priory');
  if (stage === 'exploring') return { ...staged, game };

  if (stage === 'encounter') {
    // The Drain Folk kobolds are indifferent, so the encounter stays open for talk.
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 25, y: 7, facing: 'north' });
    await send(sam.client, tableId, { command_type: 'open_door', direction: 'north' });
    game = await send(sam.client, tableId, { command_type: 'move_party', direction: 'north' });
    expect(game.mode).toBe('encounter');
    return { ...staged, game };
  }

  // Goblins attack at once, so spawning them starts the battle.
  game = await send(ruth.client, tableId, {
    command_type: 'spawn_monsters',
    template_id: 'goblin',
    count_fixed: stage === 'game_over' ? 6 : 2,
    distance_feet: stage === 'game_over' ? 0 : 40,
  });
  if (game.mode === 'encounter') game = await send(sam.client, tableId, { command_type: 'engage_battle' });
  if (stage === 'battle') {
    expect(game.mode).toBe('battle');
    return { ...staged, game };
  }

  for (let round = 0; round < 30 && game.mode === 'battle'; round += 1) {
    await ruth.client.resolveRound(tableId, true);
    game = await ruth.client.getGame(tableId);
  }
  expect(game.mode).toBe('game_over');
  return { ...staged, game };
}
