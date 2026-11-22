import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import { LIMITS } from '@bxvtt/shared/protocol';
import type { TestConnection, TestServer, TestUser } from './helpers';
import { connect, createTable, createUser, findRefereeData, received, startServer } from './helpers';

describe('the feed', () => {
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

  it('pages back through the feed and catches up after a cursor', async () => {
    for (let i = 0; i < 25; i += 1) await alice.client.postFeed(tableId, { text: `message ${i}` });
    const newest = await alice.client.getFeed(tableId, { limit: 10 });
    expect(newest.entries).toHaveLength(10);
    expect(newest.has_more).toBe(true);
    expect(newest.entries.at(-1)).toMatchObject({ kind: 'chat', text: 'message 24' });
    const seqs = newest.entries.map((entry) => entry.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    const older = await alice.client.getFeed(tableId, { before: newest.entries[0]?.seq, limit: 10 });
    expect(older.entries.at(-1)).toMatchObject({ text: 'message 14' });
    const caughtUp = await alice.client.getFeed(tableId, { after: older.entries[0]?.seq, limit: 200 });
    expect(caughtUp.has_more).toBe(false);
    expect(caughtUp.entries.at(-1)).toMatchObject({ text: 'message 24' });
    expect(caughtUp.entries[0]?.seq).toBeGreaterThan(older.entries[0]?.seq ?? 0);
    await received(
      bobWs,
      'feed',
      (message) => message.entry.kind === 'chat' && message.entry.text === 'message 24',
    );
  });

  it('delivers a whisper only to its sender and recipients', async () => {
    const whisper = await alice.client.postFeed(tableId, {
      text: 'psst, the idol is fake',
      to: [referee.id],
    });
    expect(whisper).toMatchObject({ kind: 'chat', visibility: 'users', to: [referee.id], user_id: alice.id });
    const refereeFeed = await referee.client.getFeed(tableId, { after: whisper.seq - 1 });
    expect(refereeFeed.entries.map((entry) => entry.seq)).toContain(whisper.seq);
    const bobFeed = await bob.client.getFeed(tableId, { after: whisper.seq - 1 });
    expect(bobFeed.entries.map((entry) => entry.seq)).not.toContain(whisper.seq);
    await alice.client.postFeed(tableId, { text: 'after the whisper' });
    await received(
      bobWs,
      'feed',
      (message) => message.entry.kind === 'chat' && message.entry.text === 'after the whisper',
    );
    expect(JSON.stringify(bobWs.messages)).not.toContain('the idol is fake');
    await expect(alice.client.postFeed(tableId, { text: 'hi', to: [alice.id] })).rejects.toSatisfy((error) =>
      isProblem(error, 'validation_error'),
    );
    const outsider = await createUser(server, 'Outsider');
    await expect(alice.client.postFeed(tableId, { text: 'hi', to: [outsider.id] })).rejects.toSatisfy(
      (error) => isProblem(error, 'validation_error'),
    );
  });

  it('rolls dice through bxapi from /roll and /r', async () => {
    const roll = await alice.client.postFeed(tableId, { text: '/roll 2d6+1 for damage' });
    expect(roll).toMatchObject({ kind: 'roll', expression: '2d6+1', comment: 'for damage', secret: false });
    if (roll.kind !== 'roll') throw new Error('expected a roll');
    expect(roll.total).toBeGreaterThanOrEqual(3);
    expect(roll.total).toBeLessThanOrEqual(13);
    const short = await bob.client.postFeed(tableId, { text: '/r 1d20' });
    expect(short).toMatchObject({ kind: 'roll', expression: '1d20' });
    await expect(alice.client.postFeed(tableId, { text: '/roll 2x7' })).rejects.toSatisfy((error) =>
      isProblem(error, 'content_invalid'),
    );
    const direct = await alice.client.rollDice({ expression: '3d6', seed: 42 });
    expect(direct.seed).toBe(42);
  });

  it('keeps the secret rolls of a referee from the players', async () => {
    await expect(alice.client.postFeed(tableId, { text: '/roll secret 1d6' })).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await expect(referee.client.postFeed(tableId, { text: 'just chat', secret: true })).rejects.toSatisfy(
      (error) => isProblem(error, 'validation_error'),
    );
    const secret = await referee.client.postFeed(tableId, { text: '/roll secret 1d100 wandering check' });
    expect(secret).toMatchObject({ kind: 'roll', visibility: 'referees', secret: true });
    const flagged = await referee.client.postFeed(tableId, { text: '/r 1d8 ambush', secret: true });
    expect(flagged).toMatchObject({ visibility: 'referees' });
    await alice.client.postFeed(tableId, { text: 'after the secret rolls' });
    await received(
      bobWs,
      'feed',
      (message) => message.entry.kind === 'chat' && message.entry.text === 'after the secret rolls',
    );
    const bobFeed = await bob.client.getFeed(tableId, { limit: 200 });
    expect(bobFeed.entries.map((entry) => entry.seq)).not.toContain(secret.seq);
    expect(
      findRefereeData(
        [...bob.received, ...bobWs.messages.map((message) => JSON.stringify(message))],
        ['wandering check'],
      ),
    ).toEqual([]);
  });

  it('limits the length of a message', async () => {
    await alice.client.postFeed(tableId, { text: 'x'.repeat(LIMITS.feedText) });
    await expect(alice.client.postFeed(tableId, { text: 'x'.repeat(LIMITS.feedText + 1) })).rejects.toSatisfy(
      (error) => isProblem(error, 'validation_error'),
    );
    await expect(alice.client.postFeed(tableId, { text: '   ' })).rejects.toSatisfy((error) =>
      isProblem(error, 'validation_error'),
    );
  });
});
