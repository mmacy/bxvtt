import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { TestServer, TestUser } from './helpers';
import { BXAPI_URL, createCharacter, createTable, createUser, startServer } from './helpers';

/** builtin-barrow's adventure document, renamed so a test can tell it from the built-in copy. */
async function sampleDocument(name: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${BXAPI_URL}/v1/adventures/builtin-barrow/document`);
  const document = (await response.json()) as { payload: Record<string, unknown> };
  return { ...document, payload: { ...document.payload, name } };
}

describe('adventures, rules, and generators', () => {
  let server: TestServer;
  let referee: TestUser;
  let player: TestUser;
  let tableId: string;
  let upload: Record<string, unknown>;

  beforeAll(async () => {
    const sample = await sampleDocument('The Sample Crypt');
    upload = await sampleDocument('An Uploaded Crypt');
    server = await startServer(
      {},
      { 'crypt.json': JSON.stringify(sample), 'broken.json': '{"kind": "adventure"' },
    );
    referee = await createUser(server, 'Ref');
    player = await createUser(server, 'Pat');
    tableId = (await createTable(referee, [player])).id;
  });

  afterAll(async () => {
    await server.close();
  });

  it('lists built-in adventures and valid samples, and skips an invalid sample', async () => {
    const list = await player.client.listAdventures(tableId);
    expect(list.items.map((item) => [item.id, item.source])).toEqual([
      ['builtin-barrow', 'builtin'],
      ['sample:crypt', 'sample'],
    ]);
    expect(list.items[1]?.info.name).toBe('The Sample Crypt');
    expect(JSON.stringify(list)).not.toContain('"monsters"');
  });

  it('uploads a sample to bxapi on first use and remembers it', async () => {
    const character = await createCharacter(player, 'Sampler');
    await player.client.addToRoster(tableId, character.id);
    const game = await referee.client.startGame(tableId, { adventure_id: 'sample:crypt' });
    expect(game.adventure_name).toBe('The Sample Crypt');
    expect(game.adventure_id).toBe('sample:crypt');
    await referee.client.endGame(tableId);
    expect((await referee.client.getTable(tableId)).phase).toBe('lobby');
    const again = await referee.client.startGame(tableId, { adventure_id: 'sample:crypt' });
    expect(again.session_id).not.toBe(game.session_id);
    const rows = server.server.ctx.db.all('SELECT * FROM samples');
    expect(rows).toHaveLength(1);
    await referee.client.endGame(tableId);
  });

  it('validates, uploads, lists, and deletes an adventure that a referee uploaded', async () => {
    await expect(player.client.uploadAdventure(tableId, upload as { kind: string })).rejects.toSatisfy(
      (error) => isProblem(error, 'referee_required'),
    );
    const verdict = await referee.client.validateAdventure(tableId, upload as { kind: string });
    expect(verdict.valid).toBe(true);
    const invalid = await referee.client.validateAdventure(tableId, { kind: 'adventure' });
    expect(invalid).toMatchObject({ valid: false, code: 'content_invalid' });
    await expect(referee.client.uploadAdventure(tableId, { kind: 'adventure' })).rejects.toSatisfy((error) =>
      isProblem(error, 'content_invalid'),
    );
    const listing = await referee.client.uploadAdventure(tableId, upload as { kind: string });
    expect(listing).toMatchObject({ source: 'uploaded', uploaded_by: referee.id });
    expect(listing.id).toMatch(/^adv_/);
    const list = await player.client.listAdventures(tableId);
    expect(list.items.at(-1)?.id).toBe(listing.id);
    // Another table can't see or play it.
    const otherTable = await referee.client.createTable({ name: 'Elsewhere' });
    expect((await referee.client.listAdventures(otherTable.id)).items.map((item) => item.id)).not.toContain(
      listing.id,
    );
    await expect(referee.client.deleteAdventure(tableId, 'builtin-barrow')).rejects.toSatisfy((error) =>
      isProblem(error, 'adventure_read_only'),
    );
    await referee.client.deleteAdventure(tableId, listing.id);
    expect((await player.client.listAdventures(tableId)).items.map((item) => item.id)).not.toContain(
      listing.id,
    );
  });

  it('proxies the rules with caching headers and revalidation', async () => {
    const first = await fetch(`${server.url}/api/rules/classes`, {
      headers: { Authorization: `Bearer ${player.token}` },
    });
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^W\/"/);
    expect(first.headers.get('cache-control')).toBe('private, max-age=3600');
    const body = (await first.json()) as { items: { id: string }[] };
    expect(body.items.map((item) => item.id)).toContain('fighter');
    const second = await fetch(`${server.url}/api/rules/classes`, {
      headers: { Authorization: `Bearer ${player.token}`, 'If-None-Match': etag ?? '' },
    });
    expect(second.status).toBe(304);
    const spells = await player.client.rules<{ items: { id: string }[] }>('spells', {
      class_id: 'magic_user',
      level: 1,
    });
    expect(spells.items.map((item) => item.id)).toContain('sleep');
    const command = await player.client.rules<{ json_schema: object }>('commands/move_party');
    expect(command.json_schema).toBeTypeOf('object');
    await expect(player.client.rules('spells/no_such_spell')).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await expect(player.client.rules('../meta')).rejects.toSatisfy((error) => isProblem(error, 'not_found'));
  });

  it('runs the generators for referees only', async () => {
    const treasure = await referee.client.generate<{ seed: number }>(tableId, 'treasure', {
      treasure_type: 'C',
      tier: 'basic',
      seed: 8,
    });
    expect(treasure.seed).toBe(8);
    const monsters = await referee.client.generate<{ monsters: unknown[] }>(tableId, 'monsters', {
      monster_id: 'goblin',
      count: 3,
    });
    expect(monsters.monsters).toHaveLength(3);
    await expect(player.client.generate(tableId, 'room', { level_number: 1 })).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await expect(
      referee.client.generate(tableId, 'treasure', { treasure_type: 'C', tier: 'basic', extra: 1 }),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
  });
});
