import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '@bxvtt/shared/protocol';
import type { TestConnection, TestServer, TestUser } from './helpers';
import { connect, createCharacter, createTable, createUser, received, startServer } from './helpers';

/**
 * What stays when a member leaves in the middle of a battle round (#27). The leaver's characters stay in the
 * battle in empty seats, which a referee controls, so the declarations the leaver saved for them stay too, and a
 * referee can change or replace them.
 */
describe('a member who leaves during a battle round', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let tableId: string;
  let refereeWs: TestConnection;
  let game: GameState;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    tableId = (await createTable(referee, [alice, bob])).id;
    await alice.client.addToRoster(tableId, (await createCharacter(alice, 'Brenna', 'fighter', 11)).id);
    await bob.client.addToRoster(tableId, (await createCharacter(bob, 'Tomas', 'cleric', 12)).id);
    await referee.client.addToRoster(tableId, (await createCharacter(referee, 'Wren', 'thief', 13)).id);
    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    refereeWs = await connect(server, referee, tableId);
    game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
    for (const command of [
      { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
      { command_type: 'move_party', direction: 'east' },
      { command_type: 'move_party', direction: 'east' },
      { command_type: 'engage_battle' },
    ]) {
      const result = await alice.client.sendCommand(tableId, command, game.revision);
      expect(result.accepted).toBe(true);
      game = result.game;
    }
    expect(game.mode).toBe('battle');
  });

  afterAll(async () => {
    refereeWs.close();
    await server.close();
  });

  it("keeps the leaver's declaration, and lets a referee replace or clear it", async () => {
    await bob.client.declare(tableId, 'character-0002', {
      action: 'attack',
      target_group_id: 'group-0001',
      move: 'close',
    });
    await bob.client.leaveTable(tableId);
    const after = await received(refereeWs, 'game', (m) =>
      (m.game?.seats ?? []).some((seat) => seat.member_id === 'character-0002' && seat.user_id === null),
    );
    expect(after.game?.seats.find((seat) => seat.member_id === 'character-0002')?.user_id).toBeNull();

    // The declaration stays, because Tomas is still in the battle.
    const kept = await referee.client.getDeclarations(tableId);
    expect(kept?.declarations['character-0002']).toMatchObject({ action: 'attack' });
    expect(kept?.declared).toContain('character-0002');

    // The referee controls the empty seat, so the referee can replace the declaration and clear it.
    const replaced = await referee.client.declare(tableId, 'character-0002', { action: 'hold' });
    expect(replaced.declarations['character-0002']).toMatchObject({ action: 'hold' });
    expect(replaced.declared_by['character-0002']).toBe(referee.id);
    const cleared = await referee.client.clearDeclaration(tableId, 'character-0002');
    expect(cleared.declared).not.toContain('character-0002');

    // A player who doesn't hold the seat still can't declare for Tomas.
    await expect(alice.client.declare(tableId, 'character-0002', { action: 'hold' })).rejects.toThrow();
  });

  it('resolves the round with a declaration the leaver saved', async () => {
    await alice.client.declare(tableId, 'character-0001', { action: 'hold' });
    await referee.client.declare(tableId, 'character-0002', { action: 'hold' });
    await referee.client.declare(tableId, 'character-0003', { action: 'hold' });
    await alice.client.leaveTable(tableId);
    const before = await referee.client.getDeclarations(tableId);
    expect(before?.declared_by['character-0001']).toBe(alice.id);
    const result = await referee.client.resolveRound(tableId);
    expect(result.accepted).toBe(true);
    expect(result.declarations.declared).toEqual([]);
  });
});
