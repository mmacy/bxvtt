/**
 * Puts a party of The Drowned Bell back in Hollin Ferry with treasure to sell and a wounded member, through the
 * SDK, so the town spec starts where a party returns from its first delve.
 *
 * bxapi has no command that grants a gem or jewellery, so the referee places the party in the chapel, where the
 * altar holds two silver candlesticks, and then in front of the scriptorium, whose room trap wounds Flarg under
 * the fixed session seed.
 */
import type { GameState } from '@bxvtt/shared/protocol';
import type { Actor } from './fixtures';
import { ADVENTURES, placeParty, send, setupTable, type SetupResult } from './table';

/** A town table: Ruth referees, Sam plays Flarg and Tinks, and Alice plays Clarence. */
export interface TownTable extends SetupResult {
  ruth: Actor;
  sam: Actor;
  alice: Actor;
}

/** The party's state after {@link returnToTown}, under session seed 1981. */
export const AFTER_DELVE = {
  flargHp: 7,
  flargMaxHp: 10,
  candlestickGp: 60,
  purses: { Flarg: 19, Tinks: 74, Clarence: 20 },
} as const;

/**
 * Sets up the table and starts the game in town.
 *
 * @param ruth - The referee.
 * @param sam - The player who owns Flarg and Tinks, and the caller.
 * @param alice - The player who owns Clarence.
 */
export async function townTable(ruth: Actor, sam: Actor, alice: Actor): Promise<TownTable> {
  const setup = await setupTable({
    name: 'Hollin Ferry',
    referee: ruth,
    players: [sam, alice],
    adventure: ADVENTURES.bell,
    party: [
      { owner: sam, name: 'Flarg', classId: 'fighter' },
      { owner: sam, name: 'Tinks', classId: 'thief' },
      { owner: alice, name: 'Clarence', classId: 'cleric' },
    ],
  });
  return { ...setup, ruth, sam, alice };
}

/**
 * Takes the party into the priory, takes the chapel's candlesticks, springs the scriptorium trap on Flarg, and
 * brings the party back to town.
 */
export async function returnToTown(table: TownTable): Promise<void> {
  const id = table.table.id;
  const { ruth, sam } = table;
  const at = (x: number, y: number, facing: 'north' | 'east' = 'north') =>
    placeParty(ruth.client, id, { dungeon: 'priory', level: 1, x, y, facing });
  await send(sam.client, id, { command_type: 'enter_dungeon', dungeon_id: 'priory' });
  const chapel = await at(17, 12, 'east');
  // A player names a cache by the handle in the player view, not by its ID in the adventure.
  const altar = chapel.view.explored
    .flatMap((level) => level.features)
    .find((feature) => feature.kind === 'treasure_cache' && feature.area_id === 'chapel');
  if (!altar) throw new Error("The player view lists no treasure cache in the priory's chapel.");
  await send(sam.client, id, { command_type: 'take_treasure', feature_id: altar.id });
  await at(8, 3, 'east');
  await send(sam.client, id, { command_type: 'open_door', direction: 'east' });
  await send(sam.client, id, { command_type: 'move_party', direction: 'east' });
  await at(14, 23);
  await send(sam.client, id, { command_type: 'travel_to_town' });
}

/** The gold pieces in a party member's purse, from the player view. */
export function purseOf(game: GameState, name: string): number | undefined {
  const member = game.view.party.find((entry) => entry.name === name);
  const inventory = member?.inventory as { purse?: { gp?: number } } | undefined;
  return inventory?.purse?.gp;
}
