import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameEntry, GameState } from '@bxvtt/shared/protocol';
import { describeEvent, describeEvents, emptyContext, extendContextWithEntryNames } from '@bxvtt/shared/text';
import { findRepoRoot } from '../src/config';
import type { TestServer, TestUser } from './helpers';
import { createCharacter, createTable, createUser, findRefereeData, startServer } from './helpers';

/** Fights until the battle ends: each member closes on the nearest group and then attacks it. */
async function fight(user: TestUser, tableId: string, start: GameState): Promise<GameState> {
  let game = start;
  for (let round = 0; game.mode === 'battle' && round < 30; round += 1) {
    const group = game.view.encounter?.groups.find((candidate) => !candidate.fled && candidate.count > 0);
    for (const memberId of game.view.encounter?.declarers ?? []) {
      const far = (group?.member_distance_feet?.[memberId] ?? 0) > 5;
      // Only the front rank can reach the group in melee. The rest wait their turn.
      const front = group?.front_rank?.includes(memberId) === true;
      await user.client.declare(
        tableId,
        memberId,
        group === undefined || (!front && !far)
          ? { action: 'hold' }
          : far
            ? { action: 'move', move: 'close', target_group_id: group.id }
            : { action: 'attack', target_group_id: group.id },
      );
    }
    game = await user.client.getGame(tableId);
  }
  return game;
}

/** The player's copies of the battle rounds in the feed. */
async function battleEntries(user: TestUser, tableId: string): Promise<GameEntry[]> {
  const page = await user.client.getFeed(tableId, { limit: 200 });
  return page.entries.filter(
    (entry): entry is GameEntry => entry.kind === 'game' && entry.command_type === 'resolve_battle_round',
  );
}

/** Every monster ID that an entry's events name as an attacker, a defender, or a target. */
function monsterIdsIn(entry: GameEntry): string[] {
  const ids = new Set<string>();
  for (const event of entry.events as unknown as Record<string, unknown>[]) {
    for (const field of ['attacker_id', 'defender_id', 'target_id']) {
      const value = event[field];
      if (typeof value === 'string' && value.startsWith('monster-')) ids.add(value);
    }
  }
  return [...ids];
}

describe('names on feed entries', () => {
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

  async function table(adventureId: string, seed: number): Promise<string> {
    const tableId = (await createTable(referee, [alice], `${adventureId} ${seed}`)).id;
    for (const id of characterIds) await alice.client.addToRoster(tableId, id);
    await referee.client.startGame(tableId, { adventure_id: adventureId, seed });
    return tableId;
  }

  it('narrates a finished battle from the feed history as it read live', async () => {
    const tableId = await table('builtin-barrow', 7);
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'barrow' });
    for (const direction of ['east', 'east']) {
      await alice.client.sendCommand(tableId, { command_type: 'move_party', direction });
    }
    const engaged = await alice.client.sendCommand(tableId, { command_type: 'engage_battle' });
    const game = await fight(alice, tableId, engaged.game);
    expect(game.mode).toBe('exploring');
    expect(game.view.encounter).toBeNull();

    const entries = await battleEntries(alice, tableId);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      for (const monsterId of monsterIdsIn(entry)) {
        // Two goblins: each has its group's label and its number in the encounter, from the player view.
        expect(entry.names?.monsters[monsterId]).toEqual({
          label: 'goblin',
          label_plural: 'goblins',
          name: monsterId === 'monster-0001' ? 'Goblin 1' : 'Goblin 2',
        });
      }
      expect(Object.values(entry.names?.members ?? {}).every((name) => name.startsWith('Fighter'))).toBe(
        true,
      );
    }
    // A new browser has only the entry itself: the encounter is gone from the player view.
    const lines = entries.flatMap((entry) =>
      describeEvents(entry.events, extendContextWithEntryNames(emptyContext(), entry.names), {
        only: 'player',
      }),
    );
    const attacks = lines.filter((line) => line.category === 'damage' || /hits|misses/.test(line.text));
    expect(attacks.some((line) => /goblin/i.test(line.text))).toBe(true);
    expect(lines.some((line) => /\ba monster\b/i.test(line.text))).toBe(false);

    // An entry stored before the server recorded names gets them back from what the server knows now.
    for (const column of ['data_json', 'referee_json']) {
      server.server.ctx.db.run(
        `UPDATE feed SET ${column} = json_remove(${column}, '$.names') WHERE table_id = ? AND kind = 'game'`,
        tableId,
      );
    }
    const backfilled = await battleEntries(alice, tableId);
    // The server still knows the members and each monster's label. The groups of an encounter that has ended,
    // which only an entry written at the time holds, are gone.
    const known = (entry: GameEntry) => ({ members: entry.names?.members, monsters: entry.names?.monsters });
    expect(backfilled.map(known)).toEqual(entries.map(known));
  });

  it('stores the label players see for a disguised monster, never its true name', async () => {
    const tableId = await table('sample:the-drowned-bell', 7);
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'priory' });
    await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: {
        kind: 'dungeon',
        dungeon_id: 'priory',
        level_number: 3,
        position: [13, 17],
        facing: 'south',
      },
    });
    const met = await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'south' });
    expect(met.game.view.encounter?.groups.map((group) => group.label)).toContain('robed corpse');
    let game = met.game;
    if (game.mode === 'encounter') {
      game = (await alice.client.sendCommand(tableId, { command_type: 'engage_battle' })).game;
    }
    for (let round = 0; game.mode === 'battle' && round < 3; round += 1) {
      for (const memberId of game.view.encounter?.declarers ?? []) {
        await alice.client.declare(tableId, memberId, { action: 'hold' });
      }
      game = await alice.client.getGame(tableId);
    }
    const page = await alice.client.getFeed(tableId, { limit: 200 });
    const names = page.entries.flatMap((entry) =>
      entry.kind === 'game' && entry.names ? [entry.names] : [],
    );
    const labels = names.flatMap((entry) => Object.values(entry.monsters).map((label) => label.label));
    expect(labels).toContain('robed corpse');
    const stored = JSON.stringify(names);
    expect(stored).not.toMatch(/drowned[ _]prior/i);
    expect(findRefereeData([stored, ...alice.received], ['Drowned Prior'])).toEqual([]);
  });

  it('writes an interrupted rest at the gatehouse stair in plain sentences', async () => {
    const tableId = await table('sample:the-drowned-bell', 7);
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'priory' });
    await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: {
        kind: 'dungeon',
        dungeon_id: 'priory',
        level_number: 1,
        position: [14, 21],
        facing: 'north',
      },
    });
    const rested = await alice.client.sendCommand(tableId, { command_type: 'rest', kind: 'night' });
    expect(rested.accepted).toBe(true);
    const event = rested.events.find((candidate) => candidate.event_type === 'rested');
    expect(event?.code).toBe('exploration.rest.interrupted');
    if (event === undefined) return;
    expect(describeEvent(event, emptyContext()).text).toBe(
      "The party's rest is interrupted. It had planned to rest for a night.",
    );
  });
});
