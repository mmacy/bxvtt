import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import { LIMITS } from '@bxvtt/shared/protocol';
import type { TestConnection, TestServer, TestUser } from './helpers';
import { connect, createTable, createUser, findRefereeData, received, startServer } from './helpers';

const LEVEL = { dungeon_id: 'barrow', level_number: 1 };

describe('map annotations, pings, and notes', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let tableId: string;
  let bobWs: TestConnection;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Ref');
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    tableId = (await createTable(referee, [alice, bob])).id;
    bobWs = await connect(server, bob, tableId);
  });

  afterAll(async () => {
    bobWs.close();
    await server.close();
  });

  it('draws strokes and pins and pushes the level to everyone', async () => {
    const stroke = await alice.client.createAnnotation(tableId, {
      ...LEVEL,
      kind: 'stroke',
      points: [
        [0.5, 0.5],
        [1.5, 0.5],
        [2.5, 0.25],
      ],
      width: 0.1,
    });
    expect(stroke).toMatchObject({
      kind: 'stroke',
      author_id: alice.id,
      color: (await alice.client.me()).color,
    });
    const pin = await alice.client.createAnnotation(tableId, {
      ...LEVEL,
      kind: 'pin',
      x: 2,
      y: 0,
      text: 'Goblins here',
    });
    expect(pin).toMatchObject({ kind: 'pin', visibility: 'everyone', text: 'Goblins here' });
    const pushed = await received(bobWs, 'annotations', (message) => message.annotations.items.length === 2);
    expect(pushed.annotations).toMatchObject(LEVEL);
    const read = await bob.client.getAnnotations(tableId, LEVEL);
    expect(read.items.map((item) => item.id)).toEqual([stroke.id, pin.id]);
    expect(
      (await bob.client.getAnnotations(tableId, { dungeon_id: 'barrow', level_number: 2 })).items,
    ).toEqual([]);
  });

  it('shows a referees-only pin to referees alone', async () => {
    await expect(
      alice.client.createAnnotation(tableId, {
        ...LEVEL,
        kind: 'pin',
        x: 4,
        y: 0,
        text: 'x',
        visibility: 'referees',
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_required'));
    const secret = await referee.client.createAnnotation(tableId, {
      ...LEVEL,
      kind: 'pin',
      x: 4,
      y: 0,
      text: 'Trapdoor under the altar',
      visibility: 'referees',
    });
    expect((await referee.client.getAnnotations(tableId, LEVEL)).items.map((item) => item.id)).toContain(
      secret.id,
    );
    expect((await bob.client.getAnnotations(tableId, LEVEL)).items.map((item) => item.id)).not.toContain(
      secret.id,
    );
    await expect(bob.client.deleteAnnotation(tableId, secret.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await alice.client.createAnnotation(tableId, {
      ...LEVEL,
      kind: 'pin',
      x: 1,
      y: 0,
      text: 'after the secret',
    });
    await received(bobWs, 'annotations', (message) =>
      message.annotations.items.some((item) => item.kind === 'pin' && item.text === 'after the secret'),
    );
    const texts = [...bob.received, ...bobWs.messages.map((message) => JSON.stringify(message))];
    expect(findRefereeData(texts, ['Trapdoor under the altar'])).toEqual([]);
  });

  it('erases your own marks, lets a referee erase any, and clears a level', async () => {
    const mine = await bob.client.createAnnotation(tableId, {
      ...LEVEL,
      kind: 'pin',
      x: 3,
      y: 0,
      text: 'Bob was here',
    });
    const hers = (await bob.client.getAnnotations(tableId, LEVEL)).items.find(
      (item) => item.author_id === alice.id,
    );
    if (hers === undefined) throw new Error('expected an annotation by Alice');
    await expect(bob.client.deleteAnnotation(tableId, hers.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'forbidden'),
    );
    await bob.client.deleteAnnotation(tableId, mine.id);
    await referee.client.deleteAnnotation(tableId, hers.id);
    await expect(alice.client.clearAnnotations(tableId, LEVEL)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await referee.client.clearAnnotations(tableId, LEVEL);
    expect((await referee.client.getAnnotations(tableId, LEVEL)).items).toEqual([]);
    await received(bobWs, 'annotations', (message) => message.annotations.items.length === 0);
  });

  it('bounds the size of an annotation', async () => {
    const tooLong = Array.from({ length: LIMITS.strokePoints + 1 }, (_, i): [number, number] => [i % 10, 0]);
    await expect(
      alice.client.createAnnotation(tableId, { ...LEVEL, kind: 'stroke', points: tooLong, width: 0.1 }),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
    const far = await alice.client
      .createAnnotation(tableId, { ...LEVEL, kind: 'pin', x: 1e9, y: 0, text: 'far' })
      .catch((error: BxvttProblemError) => error);
    expect(isProblem(far, 'validation_error')).toBe(true);
    await expect(
      alice.client.createAnnotation(tableId, {
        ...LEVEL,
        kind: 'pin',
        x: 1,
        y: 1,
        text: 'x'.repeat(LIMITS.pinText + 1),
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
  });

  it('relays a ping to everyone at the table', async () => {
    const aliceWs = await connect(server, alice, tableId);
    aliceWs.connection.sendPing({ ...LEVEL, x: 2.5, y: 0.5 });
    const ping = await received(bobWs, 'ping', (message) => message.user_id === alice.id);
    expect(ping).toMatchObject({ ...LEVEL, x: 2.5, y: 0.5 });
    aliceWs.close();
  });

  it('keeps party notes with versions and referee notes for referees', async () => {
    const empty = await alice.client.getNotes(tableId, 'party');
    expect(empty).toMatchObject({ text: '', version: 0 });
    const first = await alice.client.updateNotes(tableId, 'party', 'Buy rope.', 0);
    expect(first).toMatchObject({ version: 1, updated_by: alice.id });
    const stale = await bob.client
      .updateNotes(tableId, 'party', 'Buy torches.', 0)
      .catch((error: BxvttProblemError) => error);
    expect(isProblem(stale, 'stale_version')).toBe(true);
    expect((stale as BxvttProblemError).problem).toMatchObject({ notes: { text: 'Buy rope.', version: 1 } });
    await bob.client.updateNotes(tableId, 'party', 'Buy rope. Buy torches.', 1);
    await received(bobWs, 'notes', (message) => message.notes.version === 2);
    await expect(alice.client.getNotes(tableId, 'referee')).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await referee.client.updateNotes(tableId, 'referee', 'The idol is a fake.', 0);
    await alice.client.updateNotes(tableId, 'party', 'Buy rope. Buy torches. Buy oil.', 2);
    await received(bobWs, 'notes', (message) => message.notes.version === 3);
    expect(
      findRefereeData(
        bobWs.messages.map((message) => JSON.stringify(message)),
        ['The idol is a fake.'],
      ),
    ).toEqual([]);
  });
});
