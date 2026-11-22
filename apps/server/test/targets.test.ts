import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { GameState, RefereeState, SceneTarget } from '@bxvtt/shared/protocol';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createTable,
  createUser,
  findMonsterIds,
  findRefereeData,
  received,
  startServer,
} from './helpers';

/** The monster IDs of each group in the referee state. */
function monsterIdsByGroup(referee: RefereeState | null): Map<string, string[]> {
  return new Map((referee?.encounter?.groups ?? []).map((group) => [group.id, group.monster_ids]));
}

/**
 * A player's magic-user casts *magic missile* at one goblin by its target handle, in battle in the barrow's guard
 * room. The server swaps the handle for the monster's ID, and nothing a player receives names a monster by ID
 * outside bxapi's own player events.
 */
describe('monster targets for players', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  let game: GameState;
  let targets: SceneTarget[] = [];

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
    const fighter = await createCharacter(alice, 'Brenna', 'fighter', 11);
    const mage = await alice.client.createCharacter({
      name: 'Mira',
      class_id: 'magic_user',
      alignment: 'neutral',
      starting_spell_ids: ['magic_missile'],
      purchases: [{ item_id: 'dagger' }],
      equip_item_ids: ['dagger'],
      seed: 12,
    });
    await alice.client.addToRoster(tableId, fighter.id);
    await alice.client.addToRoster(tableId, mage.id);
    aliceWs = await connect(server, alice, tableId);
    game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  it('lists no targets outside an encounter', () => {
    expect(game.scene.targets).toEqual([]);
  });

  it('gives each goblin a handle and a label once the party meets them', async () => {
    let state = (await alice.client.sendCommand(tableId, { command_type: 'rest', kind: 'night' })).game;
    const prepared = await alice.client.sendCommand(
      tableId,
      {
        command_type: 'prepare_spells',
        character_id: 'character-0002',
        selections: [{ spell_id: 'magic_missile' }],
      },
      state.revision,
    );
    expect(prepared.accepted).toBe(true);
    state = (
      await alice.client.sendCommand(
        tableId,
        { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
        prepared.revision,
      )
    ).game;
    for (const direction of ['east', 'east']) {
      state = (
        await alice.client.sendCommand(tableId, { command_type: 'move_party', direction }, state.revision)
      ).game;
    }
    expect(state.mode).toBe('encounter');
    targets = state.scene.targets ?? [];
    const group = state.view.encounter?.groups[0];
    expect(group).toBeDefined();
    expect(targets).toHaveLength(group?.count ?? 0);
    expect(targets.map((target) => target.label)).toEqual(targets.map((_, index) => `Goblin ${index + 1}`));
    for (const target of targets) {
      expect(target.handle).toMatch(/^tgt_[A-Za-z0-9_-]{16}$/);
      expect(target).toMatchObject({ group_id: group?.id, defeated: false, fled: false });
      expect(Object.keys(target).sort()).toEqual([
        'defeated',
        'fled',
        'group_id',
        'handle',
        'label',
        'number',
      ]);
    }
    game = state;
  });

  it('casts magic missile at one goblin by its handle in battle', async () => {
    const engaged = await alice.client.sendCommand(tableId, { command_type: 'engage_battle' }, game.revision);
    expect(engaged.accepted).toBe(true);
    expect(engaged.game.scene.targets?.map((target) => target.handle)).toEqual(
      targets.map((target) => target.handle),
    );
    const refereeState = await referee.client.getRefereeState(tableId);
    const second = targets[1] ?? targets[0];
    if (second === undefined) throw new Error('no goblin to aim at');
    const groupIds = monsterIdsByGroup(refereeState).get(second.group_id) ?? [];
    const aimedAt = groupIds[second.number - 1];
    expect(aimedAt).toMatch(/^monster-/);

    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    await alice.client.declare(tableId, 'character-0001', { action: 'hold' });
    const declared = await alice.client.declare(tableId, 'character-0002', {
      action: 'cast',
      spell_id: 'magic_missile',
      spell_mode: 'missiles',
      targets: [second.handle],
    });
    // Everyone sees the declaration with the handle, never the monster's ID.
    expect(declared.declarations['character-0002']?.targets).toEqual([second.handle]);
    const result = await alice.client.resolveRound(tableId);
    expect(result.accepted).toBe(true);
    const entry = await received(
      aliceWs,
      'feed',
      (message) => message.entry.kind === 'game' && message.entry.command_type === 'resolve_battle_round',
    );
    if (entry.entry.kind !== 'game') throw new Error('expected a game entry');
    const cast = entry.entry.events.find((event) => event.event_type === 'spell_cast') as
      { target_ids?: string[] } | undefined;
    expect(cast?.target_ids).toEqual([aimedAt]);
    const hits = entry.entry.events.filter(
      (event) =>
        event.event_type === 'damage_dealt' && (event as { target_id?: string }).target_id === aimedAt,
    );
    expect(hits.length).toBeGreaterThan(0);
    // The handles stay the same after the round, and a slain goblin keeps its handle.
    const after = result.game.scene.targets ?? [];
    expect(after.map((target) => target.handle)).toEqual(targets.map((target) => target.handle));
    game = result.game;
  });

  it('refuses an unknown handle in a command or a declaration, and sends nothing to bxapi', async () => {
    if (game.mode !== 'battle') return;
    const stale = 'tgt_AAAAAAAAAAAAAAAA';
    const declaration = await alice.client
      .declare(tableId, 'character-0002', {
        action: 'cast',
        spell_id: 'magic_missile',
        spell_mode: 'missiles',
        targets: [stale],
      })
      .catch((error: BxvttProblemError) => error);
    expect(isProblem(declaration, 'target_unknown')).toBe(true);
    expect((declaration as BxvttProblemError).problem).toMatchObject({
      field: 'declaration.targets',
      id: stale,
    });
    const before = (await alice.client.getGame(tableId)).revision;
    await expect(
      alice.client.sendCommand(tableId, {
        command_type: 'cast_spell',
        character_id: 'character-0002',
        spell_id: 'magic_missile',
        mode: 'missiles',
        targets: [stale],
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'target_unknown'));
    expect((await alice.client.getGame(tableId)).revision).toBe(before);
  });

  it('names a monster by handle in a rejection a player receives', async () => {
    const live = await alice.client.getGame(tableId);
    const target = live.scene.targets?.find((candidate) => !candidate.defeated);
    if (target === undefined) return;
    // Out of battle, cast_spell isn't legal in battle mode, so bxapi refuses it. Whatever the reason, the
    // rejection must not carry the monster's ID.
    const refused = await alice.client.sendCommand(tableId, {
      command_type: 'cast_spell',
      character_id: 'character-0002',
      spell_id: 'magic_missile',
      mode: 'missiles',
      targets: [target.handle],
    });
    expect(refused.accepted).toBe(false);
    const ids = [...monsterIdsByGroup(await referee.client.getRefereeState(tableId)).values()].flat();
    expect(findMonsterIds([JSON.stringify(refused.rejections)], ids)).toEqual([]);
  });

  it('never sends a player a monster ID outside bxapi player events, or any referee data', async () => {
    await alice.client.getGame(tableId);
    await alice.client.getDeclarations(tableId);
    await alice.client.getFeed(tableId, { limit: 200 });
    const ids = [...monsterIdsByGroup(await referee.client.getRefereeState(tableId)).values()].flat();
    expect(ids.length).toBeGreaterThan(0);
    const texts = [...alice.received, ...aliceWs.messages.map((message) => JSON.stringify(message))];
    expect(findMonsterIds(texts, ids)).toEqual([]);
    expect(findRefereeData(texts)).toEqual([]);
  });
});
