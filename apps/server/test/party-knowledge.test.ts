import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameEntry, GameState, RefereeState } from '@bxvtt/shared/protocol';
import {
  contextFromPlayerView,
  describeGameEntry,
  emptyContext,
  itemList,
  valuableNames,
  valuablePhrases,
} from '@bxvtt/shared/text';
import { findRepoRoot } from '../src/config';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createTable,
  createUser,
  findRefereeData,
  startServer,
  viewHere,
} from './helpers';

/**
 * Text from the drowned bell that a player must never receive: the contents of caches the party hasn't taken,
 * and trap mechanics. A cache's authored description reaches players through the player view, so it isn't here.
 */
const HIDDEN = [
  'Moonstone',
  'priors_iron_key',
  'Pair of gilt psalter covers',
  'Bloodstone',
  "Abbot's gold ring",
  "Prior's chain of office",
  'Silver chalice',
  'spell_scroll_1',
  '"damage_dice"',
  '"secret"',
];

/**
 * The room traps a player's view states, as `dungeon:level:area` references with their states. The view lists
 * only areas the party entered.
 *
 * @param game - The game state a player received.
 */
function roomTraps(game: GameState): Map<string, string> {
  const traps = new Map<string, string>();
  for (const level of game.view.explored) {
    for (const area of level.areas) {
      if (area.trap_state != null) {
        traps.set(`${level.dungeon_id}:${level.level_number}:${area.id}`, area.trap_state);
      }
    }
  }
  return traps;
}

/**
 * Checks that every room trap the player view states is one the party found or sprang, by the referee state. A
 * room never reads `removed`, because no command removes a room trap.
 *
 * @param game - The game state a player received.
 * @param referee - The referee state at the same revision.
 */
function expectRoomTrapsWithinKnowledge(game: GameState, referee: RefereeState): void {
  const state = referee.dungeon_state;
  for (const [ref, trapState] of roomTraps(game)) {
    expect(['found', 'sprung']).toContain(trapState);
    expect((trapState === 'sprung' ? state.sprung_traps : state.found_traps) ?? []).toContain(ref);
  }
}

/** The emptied flags of the treasure caches a player's view lists, by handle. */
function emptiedCaches(game: GameState): string[] {
  return game.view.explored.flatMap((level) =>
    level.features.filter((feature) => feature.emptied).map((feature) => feature.id),
  );
}

describe('what the party knows of the dungeon', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;

  const place = async (x: number, y: number, level = 1) => {
    const result = await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: {
        kind: 'dungeon',
        dungeon_id: 'priory',
        level_number: level,
        position: [x, y],
        facing: 'north',
      },
    });
    expect(result.accepted).toBe(true);
    if (result.game.mode !== 'exploring') {
      // The referee settles a keyed group for good, so it doesn't reappear on the next step.
      const ended = await referee.client.sendCommand(tableId, {
        command_type: 'end_encounter',
        outcome: 'departed',
        resolve_area: true,
      });
      expect(ended.accepted).toBe(true);
    }
    return alice.client.getGame(tableId);
  };

  beforeAll(async () => {
    const root = findRepoRoot();
    const bell = await readFile(`${root}/adventures/the-drowned-bell.json`, 'utf8');
    server = await startServer({}, { 'the-drowned-bell.json': bell });
    referee = await createUser(server, 'Ref');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
    const fighter = await createCharacter(alice, 'Brenna', 'fighter', 51);
    const thief = await createCharacter(alice, 'Wren', 'thief', 52);
    await alice.client.addToRoster(tableId, fighter.id);
    await alice.client.addToRoster(tableId, thief.id);
    aliceWs = await connect(server, alice, tableId);
    await referee.client.startGame(tableId, { adventure_id: 'sample:the-drowned-bell', seed: 5 });
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  it('shows no emptied cache and no room trap in town', async () => {
    const town = await alice.client.getGame(tableId);
    expect(town).not.toHaveProperty('scene');
    expect(emptiedCaches(town)).toEqual([]);
    expect(roomTraps(town).size).toBe(0);
  });

  it('marks a cache emptied once a player takes it, and bxapi refuses to take it again', async () => {
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'priory' });
    const game = await place(17, 12);
    const altar = viewHere(game)?.features.find(
      (feature) => feature.kind === 'treasure_cache' && feature.area_id === 'chapel',
    );
    expect(altar?.id).toMatch(/^feature:/);
    expect(game.view.features_here).toContain(altar?.id);
    expect(emptiedCaches(game)).toEqual([]);
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: altar?.id,
    });
    expect(taken.accepted).toBe(true);
    expect(emptiedCaches(taken.game)).toEqual([altar?.id]);
    // The party's new things have names, and the potion keeps its masked name.
    const names = Object.values(taken.game.view.item_names);
    expect(names).toContain('potion');
    expect(names.some((name) => /holy water/i.test(name))).toBe(true);
    expect(names).not.toContain('potion of healing');
    const again = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: altar?.id,
    });
    expect(again.accepted).toBe(false);
    expect(again.rejections.map((rejection) => rejection.code)).toEqual(['exploration.feature.emptied']);
  });

  it('names the items of a feed entry from the player view, with their plurals', async () => {
    const game = await alice.client.getGame(tableId);
    const page = await alice.client.getFeed(tableId, { limit: 200 });
    const entry = page.entries
      .filter((candidate): candidate is GameEntry => candidate.kind === 'game')
      .findLast((candidate) => candidate.command_type === 'take_treasure');
    if (entry === undefined) throw new Error('no take_treasure entry');
    const items = entry.names?.items ?? {};
    expect(Object.keys(items).length).toBeGreaterThan(0);
    // A valuable reads by its own name, which the inventory shows, and has no plural. Every other item reads
    // by the view's item names.
    const own = valuableNames(game.view);
    const phrases = valuablePhrases(game.view);
    for (const [id, name] of Object.entries(items)) {
      expect(name).toBe(own[id] ?? game.view.item_names[id]);
      // A named valuable also has the phrase that osrlib states for it, for the sentences of the feed.
      expect(entry.names?.valuable_phrases?.[id]).toBe(phrases[id]);
      expect(entry.names?.items_plural?.[id]).toBe(
        own[id] === undefined ? game.view.item_names_plural[id] : undefined,
      );
    }
    expect(Object.values(items)).toContain('potion');
    expect(Object.values(items)).not.toContain('potion of healing');
    expect(Object.values(items)).toContain('Silver altar candlestick');
    const text = describeGameEntry(entry, emptyContext(), { only: 'player' })
      .map((line) => line.text)
      .join(' ');
    expect(Object.values(entry.names?.valuable_phrases ?? {})).toContain('a silver altar candlestick');
    expect(text).toMatch(/takes .*2 silver altar candlesticks|takes .*a silver altar candlestick/);
    expect(text).not.toMatch(/jewellery/);
  });

  it('lists a dropped valuable in its pile by its own name', async () => {
    const game = await alice.client.getGame(tableId);
    const own = valuableNames(game.view);
    const id = Object.entries(own).find(([, name]) => name === 'Silver altar candlestick')?.[0] ?? '';
    expect(id).toMatch(/^valuable-\d+$/);
    const carrier = game.view.party.find((member) => JSON.stringify(member.inventory).includes(`"${id}"`));
    const dropped = await alice.client.sendCommand(tableId, {
      command_type: 'drop_items',
      character_id: carrier?.id,
      item_ids: [id],
    });
    expect(dropped.accepted).toBe(true);
    // The view names the dropped candlestick by its kind, and the pile shows its own name.
    expect(dropped.game.view.item_names[id]).toBe('piece of jewellery');
    expect(valuableNames(dropped.game.view)[id]).toBe('Silver altar candlestick');
    const pile = Object.values(dropped.game.view.piles).find((entry) =>
      entry.contents.some((content) => content.item_id === id),
    );
    expect(pile).toBeDefined();
    const ctx = contextFromPlayerView(dropped.game.view);
    expect(itemList(pile?.contents.map((content) => content.item_id) ?? [], ctx)).toContain(
      'a silver altar candlestick',
    );
    const page = await alice.client.getFeed(tableId, { limit: 200 });
    const entry = page.entries.findLast(
      (candidate): candidate is GameEntry =>
        candidate.kind === 'game' && candidate.command_type === 'drop_items',
    );
    if (entry === undefined) throw new Error('no drop_items entry');
    expect(entry.names?.items[id]).toBe('Silver altar candlestick');
    const text = describeGameEntry(entry, emptyContext(), { only: 'player' })
      .map((line) => line.text)
      .join(' ');
    expect(text).toMatch(/a silver altar candlestick/);
  });

  it('names a potion that the party identifies by drinking it, though no view names it afterwards', async () => {
    const game = await alice.client.getGame(tableId);
    const potion = Object.entries(game.view.item_names).find(([, name]) => name === 'potion')?.[0] ?? '';
    const drinker = game.view.party.find((member) =>
      JSON.stringify(member.inventory).includes(`"${potion}"`),
    );
    expect(drinker).toBeDefined();
    const drunk = await alice.client.sendCommand(tableId, {
      command_type: 'use_item',
      character_id: drinker?.id,
      item_id: potion,
    });
    expect(drunk.accepted).toBe(true);
    expect(drunk.game.view.item_names[potion]).toBeUndefined();
    const page = await alice.client.getFeed(tableId, { limit: 200 });
    const entry = page.entries.findLast(
      (candidate): candidate is GameEntry =>
        candidate.kind === 'game' && candidate.command_type === 'use_item',
    );
    if (entry === undefined) throw new Error('no use_item entry');
    // The use event names the potion by the name its identification gave it, and no view names it after.
    expect(entry.names?.items[potion]).toBe('potion of healing');
    const text = describeGameEntry(entry, emptyContext(), { only: 'player' })
      .map((line) => line.text)
      .join(' ');
    expect(text).toMatch(/turns out to be a potion of healing/);
    expect(text).not.toMatch(/magic-item-\d/);
  });

  it("gives the referee every feature's handle, so the referee's tools send what players send", async () => {
    const state = await referee.client.getRefereeState(tableId);
    const game = await alice.client.getGame(tableId);
    const shown = game.view.explored.flatMap((level) => level.features.map((feature) => feature.id));
    const handles = Object.values(state.feature_handles);
    expect(shown.length).toBeGreaterThan(0);
    for (const handle of shown) expect(handles).toContain(handle);
    // The referee knows every authored feature, found or not, which the players' map doesn't show.
    expect(handles.length).toBeGreaterThan(shown.length);
    const refereeGame = await referee.client.getGame(tableId);
    expect(refereeGame.referee?.feature_handles).toEqual(state.feature_handles);
    expect(game.referee).toBeNull();
  });

  it('draws an undiscovered secret door as a wall', async () => {
    const game = await place(16, 12);
    const level = game.view.explored.find(
      (entry) => entry.dungeon_id === 'priory' && entry.level_number === 1,
    );
    expect(level?.edges['16,12:west']?.kind).toBe('wall');
  });

  it("shows a trapped cache's trap state only once the party finds the trap", async () => {
    await place(26, 17);
    const current = await alice.client.getGame(tableId);
    const chest = viewHere(current)?.features.find(
      (feature) => feature.kind === 'treasure_cache' && feature.area_id === 'wardens_cell',
    );
    expect(chest?.trap_state ?? null).toBeNull();
    const inspected = await alice.client.sendCommand(tableId, {
      command_type: 'inspect_treasure',
      character_id: 'character-0002',
      feature_id: chest?.id,
    });
    const state = await referee.client.getRefereeState(tableId);
    const found = (state.dungeon_state.found_traps ?? []).includes('priory:1:iron_chest');
    const after = viewHere(inspected.game)?.features.find((feature) => feature.id === chest?.id);
    expect(after?.trap_state ?? null).toBe(found ? 'found' : null);
  });

  it('lists a room trap only once the party knows about it, in an area it entered', async () => {
    const placed = await place(10, 3);
    expectRoomTrapsWithinKnowledge(placed, await referee.client.getRefereeState(tableId));
    const searched = await alice.client.sendCommand(tableId, {
      command_type: 'search',
      character_id: 'character-0002',
      kind: 'room_traps',
    });
    const state = await referee.client.getRefereeState(tableId);
    expectRoomTrapsWithinKnowledge(searched.game, state);
    const known = [
      ...(state.dungeon_state.found_traps ?? []),
      ...(state.dungeon_state.sprung_traps ?? []),
    ].includes('priory:1:scriptorium');
    expect(roomTraps(searched.game).has('priory:1:scriptorium')).toBe(known);
  });

  it('tells two caches of one room apart, and lists only the one the party emptied', async () => {
    const game = await place(27, 6, 2);
    const caches = (viewHere(game)?.features ?? []).filter(
      (feature) => feature.kind === 'treasure_cache' && feature.area_id === 'relic_vault',
    );
    expect(caches).toHaveLength(2);
    const chest = caches.find((feature) => /oak chest/.test(feature.description));
    const casket = caches.find((feature) => feature !== chest);
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: chest?.id,
    });
    expect(taken.accepted).toBe(true);
    expect(emptiedCaches(taken.game)).toContain(chest?.id);
    expect(emptiedCaches(taken.game)).not.toContain(casket?.id);
  });

  it('never sends a player an unfound trap, the contents of an untaken cache, a secret door, or the referee feature handles', async () => {
    await alice.client.getGame(tableId);
    const texts = [...alice.received, ...aliceWs.messages.map((message) => JSON.stringify(message))];
    expect(findRefereeData(texts, HIDDEN)).toEqual([]);
  });

  it("names the iron chest's moonstone and the prior's key in the feed when a player takes them", async () => {
    // The party took the chest's contents only after the check above that nothing untaken reached Alice.
    const current = await place(26, 17);
    const chest = viewHere(current)?.features.find(
      (feature) => feature.kind === 'treasure_cache' && feature.area_id === 'wardens_cell',
    );
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: chest?.id,
    });
    expect(taken.accepted).toBe(true);
    const page = await alice.client.getFeed(tableId, { limit: 200 });
    const entry = page.entries.findLast(
      (candidate): candidate is GameEntry =>
        candidate.kind === 'game' && candidate.command_type === 'take_treasure',
    );
    if (entry === undefined) throw new Error('no take_treasure entry');
    const text = describeGameEntry(entry, emptyContext(), { only: 'player' })
      .map((line) => line.text)
      .join(' ');
    expect(text).toMatch(/takes the prior's iron key, a moonstone/);
    expect(text).not.toMatch(/gem\b|jewellery/);
  });
});

describe('a generated cache', () => {
  it('appears after the encounter by its handle, and a player takes it by that handle', async () => {
    const server = await startServer();
    try {
      const referee = await createUser(server, 'Ref');
      const alice = await createUser(server, 'Alice');
      const table = await createTable(referee, [alice]);
      const fighter = await createCharacter(alice, 'Brenna', 'fighter', 11);
      await alice.client.addToRoster(table.id, fighter.id);
      await referee.client.startGame(table.id, { adventure_id: 'builtin-barrow', seed: 7 });
      await alice.client.sendCommand(table.id, { command_type: 'enter_dungeon', dungeon_id: 'barrow' });
      await alice.client.sendCommand(table.id, { command_type: 'move_party', direction: 'east' });
      const met = await alice.client.sendCommand(table.id, { command_type: 'move_party', direction: 'east' });
      expect(met.game.mode).toBe('encounter');
      // While the goblins stand guard, the view shows no cache.
      expect(viewHere(met.game)?.features.filter((f) => f.kind === 'generated_cache')).toEqual([]);
      const ended = await referee.client.sendCommand(table.id, {
        command_type: 'end_encounter',
        outcome: 'departed',
        resolve_area: true,
      });
      expect(ended.accepted).toBe(true);
      const after = await alice.client.getGame(table.id);
      const cache = viewHere(after)?.features.find((f) => f.kind === 'generated_cache');
      expect(cache).toMatchObject({ cell: [2, 0] });
      expect(cache?.id).toMatch(/^feature:/);
      const taken = await alice.client.sendCommand(table.id, {
        command_type: 'take_treasure',
        feature_id: cache?.id,
      });
      expect(taken.accepted).toBe(true);
      expect(viewHere(taken.game)?.features.filter((f) => f.kind === 'generated_cache')).toEqual([]);
      // A generated gem is named only `Gem`, so it reads by its kind.
      const valuables = taken.game.view.party.flatMap((member) => member.inventory.valuables);
      expect(valuables.length).toBeGreaterThan(0);
      expect(valuableNames(taken.game.view)).toEqual({});
      const page = await alice.client.getFeed(table.id, { limit: 200 });
      const entry = page.entries.findLast(
        (candidate): candidate is GameEntry =>
          candidate.kind === 'game' && candidate.command_type === 'take_treasure',
      );
      if (entry === undefined) throw new Error('no take_treasure entry');
      const text = describeGameEntry(entry, emptyContext(), { only: 'player' })
        .map((line) => line.text)
        .join(' ');
      expect(text).toMatch(new RegExp(`${valuables.length} gems`));
    } finally {
      await server.close();
    }
  });
});
