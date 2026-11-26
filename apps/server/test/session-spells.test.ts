import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameState, SpellTemplate, StoredCharacter } from '@bxvtt/shared/protocol';
import type { TestServer, TestUser } from './helpers';
import { BXAPI_URL, createTable, createUser, startServer } from './helpers';

const FIXTURES = new URL('./fixtures/', import.meta.url);

/**
 * Imports a character document into bxapi and records it in the test server as one of the user's characters.
 * bxvtt has no route that imports a character, and only an import brings a custom class into bxapi, so this is
 * the one way a test can seat a character of a custom class at a table.
 */
async function importCharacter(server: TestServer, user: TestUser, file: string): Promise<string> {
  const document = await readFile(new URL(file, FIXTURES), 'utf8');
  const response = await fetch(`${BXAPI_URL}/v1/characters/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: document,
  });
  expect(response.status).toBe(201);
  const character = (await response.json()) as StoredCharacter;
  server.server.ctx.db.run(
    'INSERT INTO characters (id, owner_user_id, name, class_id, level, max_hp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    character.id,
    user.id,
    character.name,
    character.class_id,
    character.level,
    character.character.max_hp,
    character.created_at,
  );
  return character.id;
}

/** Reads a session spell through the bxvtt server, with the user's token. */
async function getSpell(
  server: TestServer,
  user: TestUser,
  tableId: string,
  spellId: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(
    `${server.url}/api/tables/${encodeURIComponent(tableId)}/game/rules/spells/${encodeURIComponent(spellId)}`,
    { headers: { Authorization: `Bearer ${user.token}`, ...headers } },
  );
}

/**
 * The session spell route, with an adventure that bundles two spells (`ember_dart` for magic-users and
 * `lantern_ward` for clerics), a level 2 hedge mage of a custom class with room in the spell book, and a level 2
 * cleric with a spell slot.
 */
describe('the spells of a session', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let stranger: TestUser;
  let tableId: string;
  let game: GameState;

  beforeAll(async () => {
    const adventure = await readFile(new URL('bundled-rules.adventure.json', FIXTURES), 'utf8');
    server = await startServer({}, { 'bundled-rules.json': adventure });
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    stranger = await createUser(server, 'Stranger');
    tableId = (await createTable(referee, [alice])).id;
    for (const file of ['hedge-mage.character.json', 'cleric-level-2.character.json']) {
      await alice.client.addToRoster(tableId, await importCharacter(server, alice, file));
    }
    game = await referee.client.startGame(tableId, { adventure_id: 'sample:bundled-rules', seed: 3 });
  });

  afterAll(async () => {
    await server.close();
  });

  it("names the bundled spells in the player view, with the custom class's slots", () => {
    expect(game.view.spell_names).toMatchObject({
      ember_dart: expect.any(String),
      lantern_ward: expect.any(String),
    });
    expect(game.view.spell_levels).toMatchObject({ ember_dart: 1, lantern_ward: 1 });
    const mage = game.view.party.find((member) => member.class_id === 'hedge_mage');
    expect(mage?.class_name).toBe('Hedge Mage');
    expect(mage?.learnable_spells).toContain('ember_dart');
    expect(mage?.spell_slots.length).toBeGreaterThan(0);
  });

  it("serves a bundled spell's template to a player and a referee alike", async () => {
    const forPlayer = await getSpell(server, alice, tableId, 'ember_dart');
    expect(forPlayer.status).toBe(200);
    expect(forPlayer.headers.get('cache-control')).toBe('private, no-cache');
    const spell = (await forPlayer.json()) as SpellTemplate;
    expect(spell).toMatchObject({ id: 'ember_dart', level: 1 });
    expect(spell.modes.map((mode) => mode.key)).toEqual(['dart']);
    const forReferee = await getSpell(server, referee, tableId, 'ember_dart');
    expect(forReferee.status).toBe(200);
    expect(await forReferee.json()).toEqual(spell);
  });

  it("serves the cleric's bundled spell with its reversed form, and a built-in spell", async () => {
    const ward = await getSpell(server, alice, tableId, 'lantern_ward');
    expect(ward.status).toBe(200);
    expect(await ward.json()).toMatchObject({ id: 'lantern_ward', level: 1 });
    const sleep = await getSpell(server, alice, tableId, 'sleep');
    expect(sleep.status).toBe(200);
    expect(await sleep.json()).toMatchObject({ id: 'sleep' });
  });

  it('answers a matching If-None-Match with 304', async () => {
    const first = await getSpell(server, alice, tableId, 'ember_dart');
    const etag = first.headers.get('etag') ?? '';
    expect(etag).not.toBe('');
    const again = await getSpell(server, alice, tableId, 'ember_dart', { 'If-None-Match': etag });
    expect(again.status).toBe(304);
  });

  it("answers a spell the player view doesn't name as it answers one that doesn't exist", async () => {
    const unnamed = await getSpell(server, alice, tableId, 'fire_ball');
    const missing = await getSpell(server, alice, tableId, 'no_such_spell');
    expect(unnamed.status).toBe(404);
    expect(missing.status).toBe(404);
    const bodies = [await unnamed.json(), await missing.json()] as Record<string, unknown>[];
    expect(bodies[0]).toMatchObject({ code: 'not_found', resource: 'spell', id: 'fire_ball' });
    const strip = ({
      id: _id,
      request_id: _request,
      instance: _instance,
      ...rest
    }: Record<string, unknown>) => rest;
    expect(strip(bodies[0] ?? {})).toEqual(strip(bodies[1] ?? {}));
  });

  it('refuses a spell ID of the wrong shape at the boundary', async () => {
    const response = await getSpell(server, alice, tableId, 'ember dart!');
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'not_found', resource: 'spell' });
  });

  it('answers a non-member as for a table that does not exist', async () => {
    const outsider = await getSpell(server, stranger, tableId, 'ember_dart');
    const nowhere = await getSpell(server, stranger, 'tbl_doesnotexist0000000000', 'ember_dart');
    expect(outsider.status).toBe(404);
    expect(nowhere.status).toBe(404);
    const [a, b] = [
      (await outsider.json()) as Record<string, unknown>,
      (await nowhere.json()) as Record<string, unknown>,
    ];
    expect(a).toMatchObject({ code: 'not_found', resource: 'table' });
    expect({ ...a, id: null, request_id: null, instance: null }).toEqual({
      ...b,
      id: null,
      request_id: null,
      instance: null,
    });
    // A wrong-shaped ID tells a non-member nothing more.
    const bad = await getSpell(server, stranger, tableId, 'ember dart!');
    expect(await bad.json()).toMatchObject({ code: 'not_found', resource: 'table' });
  });
});
