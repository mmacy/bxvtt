import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { GameState, ServerMessage } from '@bxvtt/shared/protocol';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createTable,
  createUser,
  findRefereeData,
  received,
  startServer,
  waitFor,
} from './helpers';

/**
 * A complete game at one table: a referee and two players create characters, fill the roster, start
 * builtin-barrow, enter the dungeon, meet the goblins, fight a round with declarations from three users, save,
 * and restore.
 */
describe('a game with a referee and two players', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let tableId: string;
  let refereeWs: TestConnection;
  let aliceWs: TestConnection;
  let bobWs: TestConnection;
  let game: GameState;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    tableId = (await createTable(referee, [alice, bob])).id;
    refereeWs = await connect(server, referee, tableId);
    aliceWs = await connect(server, alice, tableId);
    bobWs = await connect(server, bob, tableId);
  });

  afterAll(async () => {
    refereeWs.close();
    aliceWs.close();
    bobWs.close();
    await server.close();
  });

  it('builds a roster from the characters of each owner', async () => {
    const brenna = await createCharacter(alice, 'Brenna', 'fighter', 11);
    const tomas = await createCharacter(bob, 'Tomas', 'cleric', 12);
    const wren = await createCharacter(referee, 'Wren', 'thief', 13);
    await alice.client.addToRoster(tableId, brenna.id);
    await bob.client.addToRoster(tableId, tomas.id);
    const table = await referee.client.addToRoster(tableId, wren.id);
    expect(table.roster.map((entry) => entry.name)).toEqual(['Brenna', 'Tomas', 'Wren']);

    // Bob can't put Alice's character on the roster, or reorder it.
    await expect(bob.client.addToRoster(tableId, brenna.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    const ids = table.roster.map((entry) => entry.id);
    await expect(bob.client.reorderRoster(tableId, ids)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    const reordered = await referee.client.reorderRoster(tableId, [ids[1] ?? '', ids[0] ?? '', ids[2] ?? '']);
    expect(reordered.roster.map((entry) => entry.name)).toEqual(['Tomas', 'Brenna', 'Wren']);
    const restored = await referee.client.reorderRoster(tableId, ids);
    expect(restored.roster.map((entry) => entry.name)).toEqual(['Brenna', 'Tomas', 'Wren']);
    await received(aliceWs, 'table', (message) => message.table.roster.length === 3);
  });

  it('starts builtin-barrow and seats each member with the owner of the roster entry in that place', async () => {
    await expect(alice.client.startGame(tableId, { adventure_id: 'builtin-barrow' })).rejects.toSatisfy(
      (error) => isProblem(error, 'referee_required'),
    );
    const started = aliceWs.connection.next('notice', (message) => message.code === 'game_started');
    game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
    await started;
    expect(game.mode).toBe('town');
    expect(game.seats).toEqual([
      { member_id: 'character-0001', name: 'Brenna', user_id: alice.id },
      { member_id: 'character-0002', name: 'Tomas', user_id: bob.id },
      { member_id: 'character-0003', name: 'Wren', user_id: referee.id },
    ]);
    expect(game.view.party.map((member) => member.name)).toEqual(['Brenna', 'Tomas', 'Wren']);
    // The caller defaults to the owner of the first seat.
    expect(game.caller_user_id).toBe(alice.id);
    expect(game.referee).not.toBeNull();
    const playerGame = await bob.client.getGame(tableId);
    expect(playerGame.referee).toBeNull();
    expect(playerGame.commands.every((command) => command.kind === 'play')).toBe(true);
    expect(game.commands.some((command) => command.kind === 'referee')).toBe(true);
    const enter = playerGame.commands.find((command) => command.command_type === 'enter_dungeon');
    expect(enter?.class).toBe('party');
    const equip = playerGame.commands.find((command) => command.command_type === 'equip_item');
    expect(equip).toMatchObject({ class: 'member', member_field: 'character_id' });
    const table = await alice.client.getTable(tableId);
    expect(table.phase).toBe('playing');
    await expect(referee.client.addToRoster(tableId, table.roster[0]?.character_id ?? '')).rejects.toSatisfy(
      (error) => isProblem(error, 'game_active'),
    );
  });

  it('enforces who may send each class of command', async () => {
    // A party command from a player who isn't the caller.
    await expect(
      bob.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'barrow' }, game.revision),
    ).rejects.toSatisfy((error) => isProblem(error, 'forbidden'));
    // A member command for another player's member.
    await expect(
      bob.client.sendCommand(tableId, {
        command_type: 'unequip_item',
        character_id: 'character-0001',
        item_id: 'sword',
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'forbidden'));
    // A referee command from a player.
    await expect(
      alice.client.sendCommand(tableId, {
        command_type: 'grant_coins',
        character_id: 'character-0001',
        coins: { gp: 5 },
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_command'));
    // The battle command goes through the declarations routes.
    await expect(
      referee.client.sendCommand(tableId, { command_type: 'resolve_battle_round', declarations: [] }),
    ).rejects.toSatisfy((error) => isProblem(error, 'use_declarations'));
    await expect(alice.client.sendCommand(tableId, { command_type: 'fly_away' })).rejects.toSatisfy((error) =>
      isProblem(error, 'unknown_command'),
    );
    // Bob may act for his own member. A refused command reaches Bob alone.
    const before = aliceWs.messages.length;
    const refused = await bob.client.sendCommand(tableId, {
      command_type: 'equip_item',
      character_id: 'character-0002',
      item_id: 'no-such-item',
    });
    expect(refused.accepted).toBe(false);
    expect(refused.rejections.length).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(aliceWs.messages.slice(before).filter((message) => message.type === 'game')).toEqual([]);
    // With party_control set to anyone, Bob can move the party too. Then the referee sets it back.
    await referee.client.updateTable(tableId, { settings: { party_control: 'anyone' } });
    const turned = await bob.client.sendCommand(tableId, {
      command_type: 'reorder_party',
      order: ['character-0001', 'character-0002', 'character-0003'],
    });
    expect(turned.accepted).toBe(true);
    await referee.client.updateTable(tableId, { settings: { party_control: 'caller' } });
    game = turned.game;
  });

  it('lets the caller enter the dungeon and broadcasts the result', async () => {
    const result = await alice.client.sendCommand(
      tableId,
      { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
      game.revision,
    );
    expect(result.accepted).toBe(true);
    expect(result.mode).toBe('exploring');
    const message = await received(bobWs, 'game', (m) => m.game?.mode === 'exploring');
    expect(message.game?.revision).toBe(result.revision);
    expect(message.game?.referee).toBeNull();
    const entry = await received(
      bobWs,
      'feed',
      (m) => m.entry.kind === 'game' && m.entry.command_type === 'enter_dungeon',
    );
    expect(entry.entry).toMatchObject({ kind: 'game', command_type: 'enter_dungeon', user_id: alice.id });
    // The table setting autosave is on, so entering the dungeon made an autosave.
    const saves = await alice.client.listSaves(tableId);
    expect(saves.items.some((save) => save.autosave && save.label === 'Autosave: Entered the Barrow')).toBe(
      true,
    );
    game = result.game;
  });

  it('moves to the guard room, engages, and resolves a round from the declarations of three users', async () => {
    let state = game;
    for (const direction of ['east', 'east']) {
      const moved = await alice.client.sendCommand(
        tableId,
        { command_type: 'move_party', direction },
        state.revision,
      );
      expect(moved.accepted).toBe(true);
      state = moved.game;
    }
    expect(state.mode).toBe('encounter');
    expect(state.view.encounter?.groups[0]?.family_id).toBe('goblin');
    const engaged = await alice.client.sendCommand(
      tableId,
      { command_type: 'engage_battle' },
      state.revision,
    );
    expect(engaged.accepted).toBe(true);
    state = engaged.game;
    expect(state.mode).toBe('battle');
    const declarers = state.view.encounter?.declarers ?? [];
    expect(declarers).toEqual(['character-0001', 'character-0002', 'character-0003']);

    // Alice may not declare for Bob's member.
    await expect(alice.client.declare(tableId, 'character-0002', { action: 'hold' })).rejects.toSatisfy(
      (error) => isProblem(error, 'forbidden'),
    );
    // A refused round keeps the declarations and names the member bxapi refused: Wren isn't in the front rank.
    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    await alice.client.declare(tableId, 'character-0001', {
      action: 'attack',
      target_group_id: 'group-0001',
      move: 'close',
    });
    await bob.client.declare(tableId, 'character-0002', {
      action: 'attack',
      target_group_id: 'group-0001',
      move: 'close',
    });
    const shared = await received(bobWs, 'declarations', (m) => (m.declarations?.declared.length ?? 0) === 2);
    expect(shared.declarations?.declarations['character-0001']).toMatchObject({ action: 'attack' });
    await referee.client.declare(tableId, 'character-0003', {
      action: 'attack',
      target_group_id: 'group-0001',
      move: 'close',
    });
    const refused = await alice.client.resolveRound(tableId);
    expect(refused.accepted).toBe(false);
    expect(refused.declarations.declared).toHaveLength(3);
    expect(refused.declarations.refusals).toContainEqual(
      expect.objectContaining({ member_id: 'character-0003', code: 'battle.declaration.not_in_front_rank' }),
    );
    // Bob isn't the caller, so he can't ask for the round.
    await expect(bob.client.resolveRound(tableId)).rejects.toSatisfy((error) =>
      isProblem(error, 'forbidden'),
    );

    // The referee fixes Wren's declaration. With auto_resolve on, the last declaration resolves the round.
    await referee.client.clearDeclaration(tableId, 'character-0003');
    await referee.client.updateTable(tableId, { settings: { auto_resolve: true } });
    const after = await referee.client.declare(tableId, 'character-0003', { action: 'hold' });
    await received(
      aliceWs,
      'feed',
      (m) => m.entry.kind === 'game' && m.entry.command_type === 'resolve_battle_round',
    );
    const current = await alice.client.getGame(tableId);
    expect(current.revision).toBe(state.revision + 1);
    expect(after.revision).toBe(current.revision);
    expect(after.declared).toEqual([]);
    expect(after.refusals).toEqual([]);
    game = current;
  });

  it('lets a referee resolve early with hold for the members who did not declare', async () => {
    if (game.mode !== 'battle') return;
    const declarers = game.view.encounter?.declarers ?? [];
    expect(declarers.length).toBeGreaterThan(0);
    await expect(alice.client.resolveRound(tableId)).rejects.toSatisfy((error) =>
      isProblem(error, 'declarations_incomplete'),
    );
    await expect(alice.client.resolveRound(tableId, true)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    const result = await referee.client.resolveRound(tableId, true);
    expect(result.accepted).toBe(true);
    expect(result.game.revision).toBe(game.revision + 1);
    game = result.game;
  });

  it('saves and restores, moving the table to a new session with the same seats', async () => {
    const save = await bob.client.createSave(tableId, 'Mid-battle');
    expect(save).toMatchObject({ label: 'Mid-battle', autosave: false, created_by: bob.id });
    await expect(alice.client.renameSave(tableId, save.id, 'Mine now')).rejects.toSatisfy((error) =>
      isProblem(error, 'forbidden'),
    );
    expect((await bob.client.renameSave(tableId, save.id, 'Round two')).label).toBe('Round two');
    await expect(bob.client.restoreSave(tableId, save.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    const notice = aliceWs.connection.next('notice', (message) => message.code === 'game_restored');
    const restored = await referee.client.restoreSave(tableId, save.id);
    await notice;
    expect(restored.session_id).not.toBe(game.session_id);
    expect(restored.revision).toBe(0);
    expect(restored.mode).toBe(game.mode);
    expect(restored.seats).toEqual(game.seats);
    const table = await alice.client.getTable(tableId);
    expect(table.game?.session_id).toBe(restored.session_id);
    const playerState = await alice.client.getGame(tableId);
    expect(playerState.session_id).toBe(restored.session_id);
    const saves = await alice.client.listSaves(tableId);
    expect(saves.items.map((entry) => entry.id)).toContain(save.id);
    const exported = await referee.client.exportSave<{ kind: string }>(tableId, save.id);
    expect(exported.kind).toBe('save');
    await expect(alice.client.exportSave(tableId, save.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    const feed = await alice.client.getFeed(tableId);
    expect(feed.entries.some((entry) => entry.kind === 'system' && entry.code === 'save_restored')).toBe(
      true,
    );
  });

  it('serves the adventure and the referee state only to a referee', async () => {
    const adventure = await referee.client.getAdventureDocument<{ dungeons: unknown[] }>(tableId);
    expect(adventure.dungeons.length).toBeGreaterThan(0);
    const referee_state = await referee.client.getRefereeState(tableId);
    expect(referee_state).toHaveProperty('dungeon_state');
    expect(referee_state).not.toHaveProperty('adventure');
    expect(referee_state).not.toHaveProperty('event_log');
    await expect(alice.client.getAdventureDocument(tableId)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await expect(alice.client.getRefereeState(tableId)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await expect(alice.client.listEvents(tableId, { visibility: 'referee' })).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    const refereeEvents = await referee.client.listEvents(tableId, { visibility: 'referee' });
    expect(refereeEvents.events.length).toBeGreaterThan(0);
    const playerEvents = await alice.client.listEvents(tableId);
    expect(playerEvents.events.every((event) => event.visibility === 'player')).toBe(true);
  });

  it('keeps every WebSocket push small', () => {
    const sizes = refereeWs.messages
      .filter((message): message is Extract<ServerMessage, { type: 'game' }> => message.type === 'game')
      .map((message) => JSON.stringify(message).length);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThan(64 * 1024);
  });

  it('sends a player nothing that only a referee may see', async () => {
    await waitFor(() => aliceWs.messages.some((message) => message.type === 'game'));
    for (const player of [alice, bob]) {
      const ws = player === alice ? aliceWs : bobWs;
      const texts = [...player.received, ...ws.messages.map((message) => JSON.stringify(message))];
      expect(findRefereeData(texts)).toEqual([]);
    }
    // The referee received referee data, so the scan would have caught it.
    const refereeTexts = refereeWs.messages.map((message) => JSON.stringify(message));
    expect(findRefereeData(refereeTexts).length).toBeGreaterThan(0);
  });
});
