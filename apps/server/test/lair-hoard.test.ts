import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameState, RefereeState } from '@bxvtt/shared/protocol';
import { findRepoRoot } from '../src/config';
import type { TestServer, TestUser } from './helpers';
import { createCharacter, createTable, createUser, findRefereeData, startServer, viewHere } from './helpers';

/** The rolled caches the player view shows on every level. */
function shownHoards(game: GameState) {
  return game.view.explored.flatMap((level) =>
    level.features.filter((feature) => feature.kind === 'generated_cache'),
  );
}

/** The drain warren's keyed encounter: 6 kobolds with a lair hoard, rolled on the area's first cell, (24, 2). */
const WARREN = 'priory:1:drain_warren';

/**
 * A table that plays The Drowned Bell with four fighters, all Alice's, so Alice is the caller. Each test
 * starts a game with its own seed, walks into the drain warren, and ends the encounter one way.
 */
describe('the lair hoard of the drain warren', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  const characterIds: string[] = [];

  beforeAll(async () => {
    const bell = await readFile(`${findRepoRoot()}/adventures/the-drowned-bell.json`, 'utf8');
    server = await startServer({}, { 'the-drowned-bell.json': bell });
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    // Alice rolls her characters at a table of their own, before the tables the tests play at.
    await createTable(referee, [alice], 'Characters');
    for (let i = 0; i < 4; i += 1) {
      characterIds.push((await createCharacter(alice, `Fighter ${i + 1}`, 'fighter', 60 + i)).id);
    }
  });

  afterAll(async () => {
    await server.close();
  });

  /** Starts a game, walks from (23, 2) into the warren, and returns the encounter. */
  async function meetTheKobolds(seed: number): Promise<{ tableId: string; game: GameState }> {
    const tableId = (await createTable(referee, [alice], `Warren ${seed}`)).id;
    for (const id of characterIds) await alice.client.addToRoster(tableId, id);
    await referee.client.startGame(tableId, { adventure_id: 'sample:the-drowned-bell', seed });
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'priory' });
    await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: { kind: 'dungeon', dungeon_id: 'priory', level_number: 1, position: [23, 2], facing: 'east' },
    });
    const met = await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'east' });
    expect(met.game.mode).toBe('encounter');
    // While the kobolds stand in their warren, the view shows no hoard.
    expect(shownHoards(met.game)).toEqual([]);
    return { tableId, game: met.game };
  }

  /** Fights until the battle ends: each fighter closes on the nearest group and then attacks it. */
  async function fight(tableId: string): Promise<GameState> {
    let game = (await alice.client.sendCommand(tableId, { command_type: 'engage_battle' })).game;
    for (let round = 0; game.mode === 'battle' && round < 30; round += 1) {
      const group = game.view.encounter?.groups.find((candidate) => !candidate.fled && candidate.count > 0);
      for (const memberId of game.view.encounter?.declarers ?? []) {
        const far = (group?.member_distance_feet?.[memberId] ?? 0) > 5;
        await alice.client.declare(
          tableId,
          memberId,
          group === undefined
            ? { action: 'hold' }
            : far
              ? { action: 'move', move: 'close', target_group_id: group.id }
              : { action: 'attack', target_group_id: group.id },
        );
      }
      const next = await alice.client.getGame(tableId);
      expect(next.revision).toBeGreaterThan(game.revision);
      game = next;
    }
    expect(game.mode).toBe('exploring');
    return game;
  }

  /** The outcome of each kobold, as osrlib recorded it, and the generated caches. */
  async function refereeFacts(tableId: string): Promise<{ outcomes: string[]; state: RefereeState }> {
    const state = await referee.client.getRefereeState(tableId);
    return { outcomes: (state.defeated_monsters ?? []).map((record) => record.outcome), state };
  }

  /** The generated caches on the warren's first cell. */
  function hoardsIn(state: RefereeState): string[] {
    return Object.entries(state.dungeon_state.generated_caches ?? {})
      .filter(([, cache]) => cache.cell_ref === 'cell:priory:1:24,2')
      .map(([id]) => id);
  }

  it('shows the hoard on its cell once every kobold is slain, and lets a player take it', async () => {
    const { tableId } = await meetTheKobolds(75);
    const after = await fight(tableId);
    const { outcomes, state } = await refereeFacts(tableId);
    expect(outcomes).toEqual(['slain', 'slain', 'slain', 'slain', 'slain', 'slain']);
    expect(state.dungeon_state.resolved_encounters).toContain(WARREN);
    const [hoard] = hoardsIn(state);
    expect(hoard).toBeDefined();
    const shown = viewHere(after)?.features.filter((feature) => feature.kind === 'generated_cache') ?? [];
    expect(shown).toEqual([
      expect.objectContaining({ cell: [24, 2], id: expect.stringMatching(/^feature:/) }),
    ]);
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: shown[0]?.id,
    });
    expect(taken.accepted).toBe(true);
    expect(shownHoards(taken.game)).toEqual([]);
  });

  it('shows the hoard once some kobolds are slain and the rest routed, and the routed never come back', async () => {
    const { tableId } = await meetTheKobolds(14);
    const after = await fight(tableId);
    const { outcomes, state } = await refereeFacts(tableId);
    // osrlib counts a routed monster as defeated, so it marks the encounter resolved.
    expect(outcomes).toContain('slain');
    expect(outcomes).toContain('routed');
    expect(state.dungeon_state.resolved_encounters).toContain(WARREN);
    expect(hoardsIn(state)).toHaveLength(1);
    const [shown] = shownHoards(after);
    expect(shown?.cell).toEqual([24, 2]);
    // A resolved keyed encounter never spawns again, so stepping out and back in meets no kobolds.
    await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'west' });
    const back = await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'east' });
    expect(back.game.mode).toBe('exploring');
    expect(shownHoards(back.game).map((feature) => feature.id)).toEqual([shown?.id]);
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: shown?.id,
    });
    expect(taken.accepted).toBe(true);
  });

  it('keeps the hoard hidden after the party evades, though the party still stands on its cell', async () => {
    const { tableId } = await meetTheKobolds(14);
    const evaded = await alice.client.sendCommand(tableId, { command_type: 'evade' });
    expect(evaded.accepted).toBe(true);
    expect(evaded.game.mode).toBe('exploring');
    expect(evaded.game.view.location.position).toEqual([24, 2]);
    const { state } = await refereeFacts(tableId);
    const [hoard] = hoardsIn(state);
    expect(hoard).toBeDefined();
    expect(state.dungeon_state.resolved_encounters ?? []).not.toContain(WARREN);
    expect(shownHoards(evaded.game)).toEqual([]);
    // osrlib refuses the hoard by its raw ID too, though the party stands on its cell. The referee sends the raw
    // ID, because the server refuses a raw ID from a player before bxapi sees it.
    const raw = await referee.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: hoard,
    });
    expect(raw.accepted).toBe(false);
    expect(raw.rejections.map((rejection) => rejection.code)).toEqual(['exploration.feature.unknown']);
    const grab = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: hoard,
    });
    expect(grab.accepted).toBe(false);
    expect(grab.rejections.map((rejection) => rejection.code)).toEqual(['exploration.feature.unknown']);
    // The kobolds are back the next time the party walks in, and the hoard stays out of sight.
    await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'west' });
    const back = await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'east' });
    expect(back.game.mode).toBe('encounter');
    expect(shownHoards(back.game)).toEqual([]);
  });

  it('shows no cache when the hoard roll came up empty, and the dropped coins lie in a pile', async () => {
    // The reported run: kobolds slain and routed, `generated_lair_hoards` lists the warren, but no cache.
    const { tableId } = await meetTheKobolds(11);
    const after = await fight(tableId);
    const { outcomes, state } = await refereeFacts(tableId);
    expect(outcomes).toContain('routed');
    // osrlib records that it rolled the hoard even when the roll gave nothing, and then creates no cache.
    expect(state.dungeon_state.generated_lair_hoards).toContain(WARREN);
    expect(state.dungeon_state.resolved_encounters).toContain(WARREN);
    expect(hoardsIn(state)).toEqual([]);
    expect(shownHoards(after)).toEqual([]);
    // What the slain kobolds carried is in the pile, which `take_treasure` takes as `pile`.
    expect(Object.keys(after.view.piles)).toContain('cell:priory:1:24,2');
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: 'pile',
    });
    expect(taken.accepted).toBe(true);
    expect(Object.keys(taken.game.view.piles)).not.toContain('cell:priory:1:24,2');
  });

  it('sends a player no referee data along the way', () => {
    expect(findRefereeData(alice.received)).toEqual([]);
  });
});
