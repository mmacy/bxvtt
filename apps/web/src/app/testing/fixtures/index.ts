/**
 * Snapshots captured from a real bxvtt server by `capture-fixtures.mjs`: what a referee's browser and a player's
 * browser receive in each stage of one short game of The Drowned Bell.
 *
 * - `lobby`: four characters on the roster, no game.
 * - `town`: the game has started in town.
 * - `exploring`: the party has entered the priory.
 * - `encounter`: three goblins have appeared 30 feet away.
 * - `battle`: the battle has begun, and Brenna has declared that she closes in and attacks.
 *
 * Sam (the player) owns Brenna and Wren and is the caller. Ruth (the referee) owns Osric and Tamsin.
 */
import { SnapshotMessage, type ServerMessageOf } from '@bxvtt/shared/protocol';
import battlePlayer from './battle-player.json';
import battleReferee from './battle-referee.json';
import encounterPlayer from './encounter-player.json';
import encounterReferee from './encounter-referee.json';
import exploringPlayer from './exploring-player.json';
import exploringReferee from './exploring-referee.json';
import lobbyPlayer from './lobby-player.json';
import lobbyReferee from './lobby-referee.json';
import townPlayer from './town-player.json';
import townReferee from './town-referee.json';

/** A snapshot message. */
export type Snapshot = ServerMessageOf<'snapshot'>;

/** The stages the fixtures cover. */
export type FixtureStage = 'lobby' | 'town' | 'exploring' | 'encounter' | 'battle';

/** Whose browser the snapshot is from. */
export type FixtureRole = 'referee' | 'player';

const RAW: Record<FixtureStage, Record<FixtureRole, unknown>> = {
  lobby: { referee: lobbyReferee, player: lobbyPlayer },
  town: { referee: townReferee, player: townPlayer },
  exploring: { referee: exploringReferee, player: exploringPlayer },
  encounter: { referee: encounterReferee, player: encounterPlayer },
  battle: { referee: battleReferee, player: battlePlayer },
};

/**
 * A fixture snapshot, parsed with the protocol schema. Each call returns a fresh copy, so a test can change it.
 *
 * @param stage - The stage of the game.
 * @param role - Whose browser: `referee` or `player`.
 */
export function fixtureSnapshot(stage: FixtureStage, role: FixtureRole): Snapshot {
  return SnapshotMessage.parse(structuredClone(RAW[stage][role]));
}
