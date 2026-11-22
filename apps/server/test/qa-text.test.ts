import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameEntry } from '@bxvtt/shared/protocol';
import { describeGameEntry, emptyContext, extendContextWithScene } from '@bxvtt/shared/text';
import { findRepoRoot } from '../src/config';
import type { TestServer, TestUser } from './helpers';
import { createCharacter, createTable, createUser, findRefereeData, startServer } from './helpers';

/** The player's game entries, newest last. */
async function gameEntries(user: TestUser, tableId: string): Promise<GameEntry[]> {
  const page = await user.client.getFeed(tableId, { limit: 200 });
  return page.entries.filter((entry): entry is GameEntry => entry.kind === 'game');
}

/** The text of an entry for a player who has only the entry and the scene. */
function narrate(
  entry: GameEntry,
  scene: { names: Record<string, string>; dungeon_names?: Record<string, string> },
) {
  return describeGameEntry(entry, extendContextWithScene(emptyContext(), scene), { only: 'player' }).map(
    (line) => line.text,
  );
}

describe('text from the QA pass', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  const characterIds: string[] = [];

  beforeAll(async () => {
    const root = findRepoRoot();
    server = await startServer(
      {},
      {
        'the-drowned-bell.json': await readFile(`${root}/adventures/the-drowned-bell.json`, 'utf8'),
        'the-toll-bridge.json': await readFile(`${root}/adventures/the-toll-bridge.json`, 'utf8'),
      },
    );
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    for (const [name, seed] of [
      ['Brenna', 60],
      ['Mira', 61],
      ['Osric', 62],
    ] as const) {
      characterIds.push((await createCharacter(alice, name, 'fighter', seed)).id);
    }
  });

  afterAll(async () => {
    await server.close();
  });

  async function table(adventureId: string): Promise<string> {
    const tableId = (await createTable(referee, [alice], adventureId)).id;
    for (const id of characterIds) await alice.client.addToRoster(tableId, id);
    await referee.client.startGame(tableId, { adventure_id: adventureId, seed: 7 });
    return tableId;
  }

  it("names the dungeon for players once the party enters it, and reads a leading 'The' as 'the' (D-210, D-404, D-208)", async () => {
    const tableId = await table('sample:the-drowned-bell');
    const entered = await alice.client.sendCommand(tableId, {
      command_type: 'enter_dungeon',
      dungeon_id: 'priory',
    });
    expect(entered.game.scene.dungeon_names).toEqual({ priory: "The priory on Corvane's Holm" });
    const [entry] = (await gameEntries(alice, tableId)).slice(-1);
    if (entry === undefined) throw new Error('no game entry');
    expect(entry.names?.dungeons).toEqual({ priory: "The priory on Corvane's Holm" });
    // A new browser that has only the entry names the dungeon too.
    expect(narrate(entry, { names: {} })[0]).toBe("The party enters the priory on Corvane's Holm, level 1.");
    const saves = await alice.client.listSaves(tableId);
    expect(saves.items.map((save) => save.label)).toContain("Autosave: Entered the priory on Corvane's Holm");
  });

  it('names the speaker of a talk and states one bearing (D-304)', async () => {
    const tableId = await table('sample:the-drowned-bell');
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
    const met = await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'north' });
    expect(met.game.mode).toBe('encounter');
    const talked = await alice.client.sendCommand(tableId, {
      command_type: 'parley',
      character_id: 'character-0003',
    });
    expect(talked.accepted).toBe(true);
    const entries = await gameEntries(alice, tableId);
    const talk = entries.find((entry) => entry.command_type === 'parley');
    expect(talk?.actor_id).toBe('character-0003');
    expect(talk?.names?.groups).toEqual({
      'group-0001': { label: 'goblin', label_plural: 'goblins', count: 2 },
    });
    if (talk === undefined) throw new Error('no talk entry');
    expect(narrate(talk, met.game.scene)[0]).toMatch(/^Osric talks to the goblins\. They .+ now\.$/);
    const meeting = entries.find(
      (entry) => entry.command_type === 'move_party' && entry.revision === met.revision,
    );
    if (meeting === undefined) throw new Error('no meeting entry');
    const opening = narrate(meeting, met.game.scene);
    expect(opening).toContain('The party meets 2 goblins, 30 feet away.');
    expect(opening.filter((line) => line.startsWith('The monsters '))).toHaveLength(1);
  });

  it('lists Mag Corrie and her bodyguard by name when the party meets them', async () => {
    const tableId = await table('sample:the-toll-bridge');
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'bridge' });
    await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: { kind: 'dungeon', dungeon_id: 'bridge', level_number: 1, position: [21, 1], facing: 'east' },
    });
    const met = await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'east' });
    expect(met.game.mode).toBe('encounter');
    const entries = await gameEntries(alice, tableId);
    const meeting = entries.find((entry) => entry.revision === met.revision);
    if (meeting === undefined) throw new Error('no meeting entry');
    // osrlib's event names only Mag Corrie and counts both: "Encounter: 2 Mag Corries".
    expect(narrate(meeting, met.game.scene)).toContain(
      "The party meets Mag Corrie and Mag's bodyguard, 20 feet away.",
    );
    expect(findRefereeData(alice.received)).toEqual([]);
  });
});
