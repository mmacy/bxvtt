import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeclarationBody, GameState, RefereeState, ServerMessage } from '@bxvtt/shared/protocol';
import { creatureNames } from '@bxvtt/shared/text';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createFromRoll,
  createTable,
  createUser,
  findRefereeData,
  findUnshownCreatureIds,
  received,
  startServer,
} from './helpers';

/** The monster and NPC IDs of the session, from the referee state. */
function creatureIds(referee: RefereeState): string[] {
  return [
    ...referee.monsters.map((monster) => monster.id),
    ...referee.npcs.flatMap((npc) => (npc.id == null ? [] : [npc.id])),
  ];
}

/** Starts a barrow game for a fighter and a magic-user who knows *magic missile*. */
async function barrowTable(): Promise<{
  server: TestServer;
  referee: TestUser;
  alice: TestUser;
  tableId: string;
  aliceWs: TestConnection;
  game: GameState;
}> {
  const server = await startServer();
  const referee = await createUser(server, 'Rhea');
  const alice = await createUser(server, 'Alice');
  const tableId = (await createTable(referee, [alice])).id;
  const fighter = await createCharacter(alice, 'Brenna', 'fighter', 11);
  const mage = await createFromRoll(
    alice,
    {
      name: 'Mira',
      class_id: 'magic_user',
      alignment: 'neutral',
      starting_spell_ids: ['magic_missile'],
      purchases: [{ item_id: 'dagger' }],
      equip_item_ids: ['dagger'],
    },
    12,
  );
  await alice.client.addToRoster(tableId, fighter.id);
  await alice.client.addToRoster(tableId, mage.id);
  const aliceWs = await connect(server, alice, tableId);
  const game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
  return { server, referee, alice, tableId, aliceWs, game };
}

/** Rests, prepares *magic missile*, and walks into the barrow's guard room, where two goblins wait. */
async function meetGoblins(alice: TestUser, tableId: string): Promise<GameState> {
  await alice.client.sendCommand(tableId, { command_type: 'rest', kind: 'night' });
  const prepared = await alice.client.sendCommand(tableId, {
    command_type: 'prepare_spells',
    character_id: 'character-0002',
    selections: [{ spell_id: 'magic_missile' }],
  });
  expect(prepared.accepted).toBe(true);
  let state = (
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'barrow' })
  ).game;
  for (const direction of ['east', 'east']) {
    state = (
      await alice.client.sendCommand(tableId, { command_type: 'move_party', direction }, state.revision)
    ).game;
  }
  expect(state.mode).toBe('encounter');
  return state;
}

/** A cast of *magic missile* by the magic-user at one target. */
function castAt(target: string) {
  return {
    command_type: 'cast_spell',
    character_id: 'character-0002',
    spell_id: 'magic_missile',
    mode: 'missiles',
    targets: [target],
  };
}

/**
 * What a player received, with one ID written as `TARGET`, so two answers to the same request with different
 * IDs compare equal exactly when nothing but the echoed ID tells them apart.
 */
function withoutId(value: unknown, id: string): string {
  return JSON.stringify(value).replaceAll(`"${id}"`, '"TARGET"');
}

/**
 * Sends the same request twice, once naming a creature that exists but that the player view doesn't list, and
 * once naming an ID that doesn't exist, and returns what the player received each time: the HTTP body and the
 * WebSocket messages that arrived while the request ran.
 */
async function bothAnswers(
  ws: TestConnection,
  hidden: string,
  missing: string,
  send: (target: string) => Promise<unknown>,
): Promise<{ hidden: string; missing: string; body: unknown }> {
  const answer = async (target: string) => {
    const start = ws.messages.length;
    const body = await send(target);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const messages: ServerMessage[] = ws.messages
      .slice(start)
      .filter((message) => message.type !== 'presence');
    return { text: withoutId({ body, messages }, target), body };
  };
  const first = await answer(hidden);
  const second = await answer(missing);
  return { hidden: first.text, missing: second.text, body: first.body };
}

/**
 * A player's magic-user casts *magic missile* at one goblin by the ID the player view lists, in battle in the
 * barrow's guard room. A player receives a monster's ID only where bxapi's player view or a player event shows it.
 */
describe('monster targets for players', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  let game: GameState;
  let goblins: string[] = [];

  beforeAll(async () => {
    ({ server, referee, alice, tableId, aliceWs, game } = await barrowTable());
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  it('lists no creatures outside an encounter', () => {
    expect(creatureNames(game.view.encounter?.groups)).toEqual([]);
  });

  it('lists each goblin by ID in the player view once the party meets them', async () => {
    const state = await meetGoblins(alice, tableId);
    const group = state.view.encounter?.groups[0];
    expect(group?.members.map((member) => member.status)).toEqual(['alive', 'alive']);
    goblins = group?.members.map((member) => member.id) ?? [];
    expect(goblins.every((id) => /^monster-\d+$/.test(id))).toBe(true);
    // The player view lists the same monsters as the referee view, so the IDs are the ones bxapi uses.
    const refereeState = await referee.client.getRefereeState(tableId);
    expect(refereeState.encounter?.groups[0]?.monster_ids).toEqual(goblins);
    expect(creatureNames(state.view.encounter?.groups).map((creature) => creature.name)).toEqual([
      'Goblin 1',
      'Goblin 2',
    ]);
    game = state;
  });

  it('casts magic missile at one goblin by its ID in battle, and names it in the feed', async () => {
    const engaged = await alice.client.sendCommand(tableId, { command_type: 'engage_battle' }, game.revision);
    expect(engaged.accepted).toBe(true);
    const aimedAt = goblins[1] ?? '';
    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    await alice.client.declare(tableId, 'character-0001', { action: 'hold' });
    const declared = await alice.client.declare(tableId, 'character-0002', {
      action: 'cast',
      spell_id: 'magic_missile',
      spell_mode: 'missiles',
      targets: [aimedAt],
    });
    expect(declared.declarations['character-0002']?.targets).toEqual([aimedAt]);
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
    // The feed records the name the table used, so the entry reads the same after the encounter ends.
    expect(entry.entry.names?.monsters[aimedAt]).toMatchObject({ label: 'goblin', name: 'Goblin 2' });
    // A slain goblin stays in the roster, so the other goblin keeps its number.
    expect(creatureNames(result.game.view.encounter?.groups).map((creature) => creature.name)).toEqual([
      'Goblin 1',
      'Goblin 2',
    ]);
    game = result.game;
    expect(game.mode).toBe('battle');
  });

  it("stores a player's declaration at an ID the player view doesn't list, and the preview refuses it", async () => {
    const declared = await alice.client.declare(tableId, 'character-0002', {
      action: 'cast',
      spell_id: 'magic_missile',
      spell_mode: 'missiles',
      targets: ['monster-0099'],
    });
    expect(declared.declarations['character-0002']?.targets).toEqual(['monster-0099']);
    expect(declared.refusals).toContainEqual({
      member_id: 'character-0002',
      code: 'magic.cast.unknown_target',
      params: expect.objectContaining({ target: 'monster-0099' }),
    });
    await alice.client.clearDeclaration(tableId, 'character-0002');
  });

  it('never sends a player a creature ID before the player view or a player event shows it, or any referee data', async () => {
    await alice.client.getGame(tableId);
    await alice.client.getFeed(tableId, { limit: 200 });
    const ids = creatureIds(await referee.client.getRefereeState(tableId));
    expect(ids).toEqual(expect.arrayContaining(goblins));
    expect(ids).not.toContain('monster-0099');
    const http = alice.received;
    const ws = aliceWs.messages.map((message) => JSON.stringify(message));
    expect(findUnshownCreatureIds(http, ids)).toEqual([]);
    expect(findUnshownCreatureIds(ws, ids)).toEqual([]);
    expect(findRefereeData([...http, ...ws])).toEqual([]);
  });
});

/** The rejection codes of a command result, or the refusal codes of a declarations state. */
function refusalCodes(body: unknown): string[] {
  const record = body as { rejections?: { code: string }[]; refusals?: { code: string }[] };
  return [...(record.rejections ?? []), ...(record.refusals ?? [])].map((entry) => entry.code);
}

/** The codes that refuse a command before it resolves any target, so a case that gets one proves nothing. */
const BEFORE_TARGETS = ['session.command.wrong_mode', 'session.command.unknown_command'];

/**
 * Since osrlib 2.8, a command or a declaration can name only a party member or a creature of the open encounter's
 * groups that haven't fled, and bxapi refuses every other ID, one that exists and one that doesn't, with the same
 * rejection. These tests send bxapi, through the bxvtt server with no target check of its own, a creature that
 * exists but that the player view doesn't list (a goblin, its group, and an NPC adventurer from encounters that
 * ended) and an ID that doesn't exist, in each mode, and check that a player receives the same answer for both,
 * apart from the ID the player sent. Each case reaches the session's target resolution, so its refusal names the
 * target. A difference would let a player probe which creatures exist.
 */
describe('a creature the player view does not list', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  /** A goblin from the first encounter, which exists after the encounter ends. */
  let hidden = '';
  /** The first encounter's goblin group. */
  let hiddenGroup = '';
  /** An NPC adventurer from the second encounter, which exists after the encounter ends. */
  let hiddenNpc = '';
  let wand = '';
  /** A scroll of *charm person*, which names its target in `targets` or `target_id`. */
  let scroll = '';
  const missing = 'monster-0099';
  const missingGroup = 'group-0099';
  const missingNpc = 'npc-0099';

  /** Sends one command for the magic-user, as Alice, with the target in `field`. */
  const useItem = (item: () => string, field: 'targets' | 'target_id') => (target: string) =>
    alice.client.sendCommand(tableId, {
      command_type: 'use_item',
      character_id: 'character-0002',
      item_id: item(),
      ...(field === 'targets' ? { targets: [target] } : { target_id: target }),
    });

  /** Checks that both answers match, and that the session got as far as the target. */
  const expectSame = (answers: { hidden: string; missing: string; body: unknown }) => {
    expect(answers.hidden).toBe(answers.missing);
    expect(answers.body).not.toMatchObject({ accepted: true });
    const codes = refusalCodes(answers.body);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(BEFORE_TARGETS).not.toContain(code);
    return codes;
  };

  beforeAll(async () => {
    ({ server, referee, alice, tableId, aliceWs } = await barrowTable());
    const met = await meetGoblins(alice, tableId);
    const group = met.view.encounter?.groups[0];
    hidden = group?.members[0]?.id ?? '';
    hiddenGroup = group?.id ?? '';
    expect(hidden).toMatch(/^monster-\d+$/);
    const granted = await referee.client.sendCommand(tableId, {
      command_type: 'grant_item',
      character_id: 'character-0002',
      item_id: 'wand_of_cold',
    });
    expect(granted.accepted).toBe(true);
    wand = Object.keys(granted.game.view.item_names).find((id) => /^magic-item-\d+$/.test(id)) ?? '';
    expect(wand).not.toBe('');
    // A first-level scroll holds a spell the session rolls, so the referee grants scrolls until one holds
    // charm person. The session's seed makes the count the same on every run.
    for (let attempt = 0; attempt < 40 && scroll === ''; attempt += 1) {
      await referee.client.sendCommand(tableId, {
        command_type: 'grant_item',
        character_id: 'character-0002',
        item_id: 'spell_scroll_1',
      });
      const state = await referee.client.getRefereeState(tableId);
      const items = (
        state.party as unknown as { members: { inventory: { items: unknown[] } }[] }
      ).members.flatMap((member) => member.inventory.items) as {
        instance_id?: string;
        state?: { spells?: string[] };
      }[];
      scroll = items.find((item) => item.state?.spells?.includes('charm_person'))?.instance_id ?? '';
    }
    expect(scroll).not.toBe('');
    const ended = await referee.client.sendCommand(tableId, {
      command_type: 'end_encounter',
      outcome: 'departed',
    });
    expect(ended.accepted).toBe(true);
    // Reading a scroll takes light.
    for (const item_id of ['torch', 'tinder_box']) {
      await referee.client.sendCommand(tableId, {
        command_type: 'grant_item',
        character_id: 'character-0002',
        item_id,
      });
    }
    const lit = await alice.client.sendCommand(tableId, {
      command_type: 'light_source',
      character_id: 'character-0002',
      item_id: 'torch',
    });
    expect(lit.rejections).toEqual([]);
    const npcs = await referee.client.sendCommand(tableId, {
      command_type: 'spawn_npc_party',
      party_kind: 'basic',
      count_fixed: 1,
      distance_feet: 60,
    });
    expect(npcs.accepted).toBe(true);
    hiddenNpc =
      npcs.game.view.encounter?.groups.flatMap((entry) => entry.members.map((member) => member.id))[0] ?? '';
    expect(hiddenNpc).toMatch(/^npc-\d+$/);
    // Alice reads the game while the adventurers are in view, as her browser would.
    expect(JSON.stringify((await alice.client.getGame(tableId)).view.encounter)).toContain(hiddenNpc);
    const left = await referee.client.sendCommand(tableId, {
      command_type: 'end_encounter',
      outcome: 'departed',
    });
    expect(left.accepted).toBe(true);
    expect(left.game.view.encounter).toBeNull();
    const ids = creatureIds(await referee.client.getRefereeState(tableId));
    expect(ids).toEqual(expect.arrayContaining([hidden, hiddenNpc]));
    expect(ids).not.toContain(missing);
    expect(ids).not.toContain(missingNpc);
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  it('gets the same refusal for a cast at a monster and at an NPC adventurer while exploring', async () => {
    const cast = await bothAnswers(aliceWs, hidden, missing, (target) =>
      alice.client.sendCommand(tableId, castAt(target)),
    );
    expect(expectSame(cast)).toEqual(['magic.cast.unknown_target']);
    const npc = await bothAnswers(aliceWs, hiddenNpc, missingNpc, (target) =>
      alice.client.sendCommand(tableId, castAt(target)),
    );
    expect(expectSame(npc)).toEqual(['magic.cast.unknown_target']);
  });

  it('gets the same refusal for a scroll and a hand-over while exploring', async () => {
    const byTargets = await bothAnswers(
      aliceWs,
      hidden,
      missing,
      useItem(() => scroll, 'targets'),
    );
    expect(expectSame(byTargets)).toEqual(['magic.cast.unknown_target']);
    const byTargetId = await bothAnswers(
      aliceWs,
      hidden,
      missing,
      useItem(() => scroll, 'target_id'),
    );
    expect(expectSame(byTargetId)).toEqual(['magic.cast.unknown_target']);
    const given = await bothAnswers(aliceWs, hidden, missing, (target) =>
      alice.client.sendCommand(tableId, {
        command_type: 'give_items',
        character_id: 'character-0002',
        recipient_id: target,
        item_ids: ['dagger'],
      }),
    );
    expect(expectSame(given)).toEqual(['session.command.unknown_member']);
  });

  it("refuses the referee's identical cast, because osrlib 2.8 checks the target itself", async () => {
    const refused = await referee.client.sendCommand(tableId, castAt(hidden));
    expect(refused.accepted).toBe(false);
    expect(refused.rejections).toEqual([{ code: 'magic.cast.unknown_target', params: { target: hidden } }]);
  });

  it('gets the same refusal for a scroll and a wand in an open encounter', async () => {
    const spawned = await referee.client.sendCommand(tableId, {
      command_type: 'spawn_monsters',
      template_id: 'goblin',
      count_fixed: 1,
      distance_feet: 60,
    });
    expect(spawned.accepted).toBe(true);
    expect(spawned.game.mode).toBe('encounter');
    const listed = spawned.game.view.encounter?.groups.flatMap((entry) => entry.members.map((m) => m.id));
    expect(listed).not.toContain(hidden);
    const cases: [string, string, (target: string) => Promise<unknown>, string][] = [
      [hidden, missing, useItem(() => scroll, 'targets'), 'magic.cast.unknown_target'],
      [hidden, missing, useItem(() => scroll, 'target_id'), 'magic.cast.unknown_target'],
      [hidden, missing, useItem(() => wand, 'target_id'), 'items.use.unknown_target'],
      [hiddenGroup, missingGroup, useItem(() => wand, 'target_id'), 'items.use.unknown_target'],
    ];
    for (const [existing, absent, send, code] of cases) {
      expect(expectSame(await bothAnswers(aliceWs, existing, absent, send))).toEqual([code]);
    }
  });

  it('gets the same declarations state, preview refusal, and round refusal in a battle', async () => {
    const engaged = await alice.client.sendCommand(tableId, { command_type: 'engage_battle' });
    expect(engaged.accepted).toBe(true);
    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    await alice.client.declare(tableId, 'character-0001', { action: 'hold' });
    const declaration = (target: string) =>
      alice.client.declare(tableId, 'character-0002', {
        action: 'cast',
        spell_id: 'magic_missile',
        spell_mode: 'missiles',
        targets: [target],
      });
    const declared = await bothAnswers(aliceWs, hidden, missing, declaration);
    expect(expectSame(declared)).toEqual(['magic.cast.unknown_target']);
    const resolved = await bothAnswers(aliceWs, hidden, missing, async (target) => {
      await declaration(target);
      return alice.client.resolveRound(tableId);
    });
    expect(resolved.hidden).toBe(resolved.missing);
    expect(resolved.body).toMatchObject({ accepted: false });
    const declare = (body: DeclarationBody) => (target: string) =>
      alice.client.declare(tableId, 'character-0002', { ...body, target_group_id: target });
    const atGroup: DeclarationBody[] = [
      { action: 'use_item', item_id: wand },
      { action: 'attack' },
      { action: 'attack', weapon_id: 'dagger' },
      { action: 'move', move: 'close' },
      { action: 'attack', move: 'close' },
    ];
    for (const body of atGroup) {
      const answers = await bothAnswers(aliceWs, hiddenGroup, missingGroup, declare(body));
      expect(expectSame(answers), JSON.stringify(body)).toEqual(['battle.declaration.unknown_group']);
    }
    await alice.client.clearDeclaration(tableId, 'character-0002');
  });

  it('sends the player no creature ID before the player view showed it, and no referee data', async () => {
    const ids = creatureIds(await referee.client.getRefereeState(tableId));
    const ws = aliceWs.messages.map((message) => JSON.stringify(message));
    expect(findUnshownCreatureIds(alice.received, ids)).toEqual([]);
    expect(findUnshownCreatureIds(ws, ids)).toEqual([]);
    expect(findRefereeData([...alice.received, ...ws])).toEqual([]);
  });
});
