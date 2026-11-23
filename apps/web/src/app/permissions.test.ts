import type { GameState, TableSettings } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import {
  canActForParty,
  canControlMember,
  canDeclare,
  canResolveRound,
  canSendCommand,
  type PermissionContext,
} from './permissions';
import { fixtureSnapshot, type FixtureRole, type FixtureStage } from './testing/fixtures';

/** A permission context from a fixture: Sam (player) owns Brenna and Wren and is the caller. */
function context(
  stage: FixtureStage,
  role: FixtureRole,
  overrides: { settings?: Partial<TableSettings>; lens?: boolean; userId?: string } = {},
): PermissionContext {
  const snapshot = fixtureSnapshot(stage, role);
  return {
    userId: overrides.userId ?? snapshot.user.id,
    role: snapshot.role,
    lens: overrides.lens ?? true,
    game: snapshot.game,
    settings: { ...snapshot.table.settings, ...overrides.settings },
    members: snapshot.table.members,
    catalog: [
      { command_type: 'enter_dungeon', kind: 'play', allowed_modes: ['town'] },
      { command_type: 'rest', kind: 'play', allowed_modes: ['exploring', 'town'] },
      { command_type: 'advance_time', kind: 'referee', allowed_modes: ['exploring', 'town'] },
    ],
  };
}

function memberId(ctx: PermissionContext, name: string): string {
  const seat = (ctx.game as GameState).seats.find((s) => s.name === name);
  if (seat === undefined) throw new Error(`No seat for ${name}.`);
  return seat.member_id;
}

describe('canSendCommand', () => {
  it('lets the caller send a party command', () => {
    const sam = context('exploring', 'player');
    expect(sam.game?.caller_user_id).toBe(sam.userId);
    expect(canSendCommand(sam, 'move_party').allowed).toBe(true);
  });

  it("refuses a party command to a player who isn't the caller, unless anyone may", () => {
    const ruth = context('exploring', 'referee');
    const notCaller = context('exploring', 'player', { settings: { caller_user_id: ruth.userId } });
    expect(canSendCommand(notCaller, 'move_party')).toEqual({
      allowed: false,
      reason: 'Only the caller can move the party. Ruth is the caller.',
    });
    const sam = context('exploring', 'player', { settings: { caller_user_id: null } });
    const denied = canSendCommand(sam, 'move_party');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe(
      'The party has no caller, so only a referee can move the party. A referee can change this under Seats and caller.',
    );
    const anyone = context('exploring', 'player', {
      settings: { caller_user_id: null, party_control: 'anyone' },
    });
    expect(canSendCommand(anyone, 'move_party').allowed).toBe(true);
  });

  it("allows a member command for the player's own seat only", () => {
    const sam = context('exploring', 'player');
    expect(canSendCommand(sam, 'light_source', memberId(sam, 'Brenna')).allowed).toBe(true);
    const osric = canSendCommand(sam, 'light_source', memberId(sam, 'Osric'));
    expect(osric).toEqual({
      allowed: false,
      reason:
        'Only Ruth, who plays Osric, can have Osric light a torch or lantern. A referee can change this under Seats and caller.',
    });
  });

  it('lets a referee act for any member and send referee commands while the lens is on', () => {
    const ruth = context('exploring', 'referee');
    expect(canSendCommand(ruth, 'light_source', memberId(ruth, 'Brenna')).allowed).toBe(true);
    expect(canSendCommand(ruth, 'advance_time').allowed).toBe(true);
    const lensOff = canSendCommand(context('exploring', 'referee', { lens: false }), 'advance_time');
    expect(lensOff).toEqual({ allowed: false, reason: 'Turn on the referee lens to advance time.' });
  });

  it("refuses a command that isn't legal now, and a referee command to a player", () => {
    const sam = context('exploring', 'player');
    expect(canSendCommand(sam, 'enter_dungeon')).toEqual({
      allowed: false,
      reason: 'You can enter a dungeon only in town. The party is exploring a dungeon now.',
    });
    expect(canSendCommand(sam, 'advance_time')).toEqual({
      allowed: false,
      reason: 'Only a referee can advance time.',
    });
    // Before the catalog loads, the reason names the action and what the party is doing.
    expect(canSendCommand({ ...sam, catalog: null }, 'enter_dungeon')).toEqual({
      allowed: false,
      reason: "You can't enter a dungeon while the party is exploring a dungeon.",
    });
  });

  it('sends nobody to resolve_battle_round directly', () => {
    const ruth = context('battle', 'referee');
    const result = canSendCommand(ruth, 'resolve_battle_round');
    expect(result.allowed).toBe(false);
  });
});

describe('member and party checks', () => {
  it('lets a referee control an empty seat', () => {
    const ruth = context('exploring', 'referee');
    const game = ruth.game as GameState;
    const empty = { ...ruth, game: { ...game, seats: game.seats.map((s) => ({ ...s, user_id: null })) } };
    expect(canControlMember(empty, memberId(ruth, 'Brenna')).allowed).toBe(true);
  });

  it('lets a seated player act for the party when anyone may', () => {
    const ruth = context('exploring', 'referee');
    const sam = context('exploring', 'player', {
      settings: { party_control: 'anyone', caller_user_id: ruth.userId },
    });
    expect(canActForParty(sam).allowed).toBe(true);
  });
});

describe('battle checks', () => {
  it("lets a player declare for a declarer in their seat, and not for another player's member", () => {
    const sam = context('battle', 'player');
    expect(canDeclare(sam, memberId(sam, 'Brenna')).allowed).toBe(true);
    expect(canDeclare(sam, memberId(sam, 'Tamsin')).allowed).toBe(false);
  });

  it('keeps resolving early for referees', () => {
    expect(canResolveRound(context('battle', 'player'), { early: true }).allowed).toBe(false);
    expect(canResolveRound(context('battle', 'player')).allowed).toBe(true);
    expect(canResolveRound(context('battle', 'referee'), { early: true }).allowed).toBe(true);
  });
});

describe('reasons', () => {
  it('says why when no game runs or the game has ended', () => {
    const sam = context('exploring', 'player');
    expect(canSendCommand({ ...sam, game: null }, 'move_party').reason).toBe(
      'No game is running. A referee starts one from the lobby.',
    );
    const ended = { ...sam, game: { ...(sam.game as GameState), ended: true, commands: [] } };
    expect(canSendCommand(ended, 'move_party').reason).toBe(
      'The game has ended. A referee can return the table to the lobby to start again.',
    );
  });

  it('names the empty seat and the player without a character', () => {
    const sam = context('exploring', 'player');
    const game = sam.game as GameState;
    const emptied = { ...sam, game: { ...game, seats: game.seats.map((s) => ({ ...s, user_id: null })) } };
    expect(canControlMember(emptied, memberId(sam, 'Osric')).reason).toBe(
      'Nobody plays Osric, so only a referee can act for Osric. A referee can change this under Seats and caller.',
    );
    expect(canSendCommand(emptied, 'light_source').reason).toBe(
      'You need a character in the party to light a torch or lantern. A referee can change this under Seats and caller.',
    );
  });

  it('asks a seatless player for a character, and says who may resolve a round early', () => {
    const ruth = context('exploring', 'referee');
    const game = ruth.game as GameState;
    const seatless = {
      ...context('exploring', 'player', { settings: { party_control: 'anyone', caller_user_id: null } }),
      game: { ...game, seats: game.seats.map((s) => ({ ...s, user_id: null })) },
    };
    expect(canActForParty(seatless).reason).toBe(
      'Only players with a character in the party can act for the party. A referee can change this under Seats and caller.',
    );
    expect(canResolveRound(context('battle', 'player'), { early: true }).reason).toBe(
      'Wait until every character has declared an action. Only a referee can resolve the round sooner.',
    );
  });

  it("says that a character who can't act has nothing to declare", () => {
    const ruth = context('battle', 'referee');
    const game = ruth.game as GameState;
    const encounter = game.view.encounter;
    if (encounter === null || encounter === undefined) throw new Error('No encounter in the battle fixture.');
    const brenna = memberId(ruth, 'Brenna');
    const declarers = encounter.declarers.filter((id) => id !== brenna);
    const resting = {
      ...ruth,
      game: { ...game, view: { ...game.view, encounter: { ...encounter, declarers } } },
    };
    expect(canDeclare(resting, brenna).reason).toBe(
      "Brenna can't act this round, so there is no action to declare.",
    );
  });
});
