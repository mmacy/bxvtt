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
    const sam = context('exploring', 'player', { settings: { caller_user_id: null } });
    const denied = canSendCommand(sam, 'move_party');
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('Only the caller or the referee can act for the whole party.');
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
      reason: "Only the player in Osric's seat or the referee can act for Osric.",
    });
  });

  it('lets a referee act for any member and send referee commands while the lens is on', () => {
    const ruth = context('exploring', 'referee');
    expect(canSendCommand(ruth, 'light_source', memberId(ruth, 'Brenna')).allowed).toBe(true);
    expect(canSendCommand(ruth, 'advance_time').allowed).toBe(true);
    const lensOff = canSendCommand(context('exploring', 'referee', { lens: false }), 'advance_time');
    expect(lensOff.allowed).toBe(false);
  });

  it("refuses a command that isn't legal now, and a referee command to a player", () => {
    const sam = context('exploring', 'player');
    expect(canSendCommand(sam, 'enter_dungeon')).toEqual({
      allowed: false,
      reason: "The party can't do that right now.",
    });
    expect(canSendCommand(sam, 'advance_time').allowed).toBe(false);
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
