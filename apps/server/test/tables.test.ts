import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { TestServer, TestUser } from './helpers';
import { connect, createUser, received, startServer } from './helpers';

describe('tables and roles', () => {
  let server: TestServer;
  let referee: TestUser;
  let player: TestUser;
  let other: TestUser;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Ref');
    player = await createUser(server, 'Pat');
    other = await createUser(server, 'Ola');
  });

  afterAll(async () => {
    await server.close();
  });

  it('creates a table with its creator as referee and lists it', async () => {
    const table = await referee.client.createTable({ name: 'Moor' });
    expect(table.members).toEqual([expect.objectContaining({ user_id: referee.id, role: 'referee' })]);
    expect(table.settings).toEqual({
      party_control: 'caller',
      caller_user_id: null,
      auto_resolve: true,
      autosave: true,
      ruleset: (await referee.client.listRulesets()).items[0]?.ruleset,
      ability_score_rerolls: 0,
      sub_par_restart: false,
    });
    expect(table.phase).toBe('lobby');
    const list = await referee.client.listTables();
    expect(list.items[0]).toMatchObject({ id: table.id, role: 'referee', member_count: 1 });
    // A non-member can't see that the table exists.
    await expect(player.client.getTable(table.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it('lets a referee rename the table and change its settings, and nobody else', async () => {
    const table = await referee.client.createTable({ name: 'Old name' });
    await player.client.joinTable(table.invite_code);
    await expect(player.client.updateTable(table.id, { name: 'Mine' })).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    const updated = await referee.client.updateTable(table.id, {
      name: 'New name',
      settings: { party_control: 'anyone', caller_user_id: player.id, auto_resolve: false, autosave: false },
    });
    expect(updated.name).toBe('New name');
    expect(updated.settings).toMatchObject({
      party_control: 'anyone',
      caller_user_id: player.id,
      auto_resolve: false,
      autosave: false,
    });
    await expect(
      referee.client.updateTable(table.id, { settings: { caller_user_id: other.id } }),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
  });

  it('joins by invite code and stops the old code after a new one', async () => {
    const table = await referee.client.createTable({ name: 'Invites' });
    await expect(player.client.regenerateInviteCode(table.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    const joined = await player.client.joinTable(table.invite_code);
    expect(joined.members.find((member) => member.user_id === player.id)?.role).toBe('player');
    // Joining twice changes nothing.
    expect((await player.client.joinTable(table.invite_code)).members).toHaveLength(2);
    const fresh = await referee.client.regenerateInviteCode(table.id);
    expect(fresh.invite_code).not.toBe(table.invite_code);
    await expect(other.client.joinTable(table.invite_code)).rejects.toSatisfy((error) =>
      isProblem(error, 'invite_invalid'),
    );
    await other.client.joinTable(fresh.invite_code);
    const feed = await referee.client.getFeed(table.id);
    expect(
      feed.entries.filter((entry) => entry.kind === 'system' && entry.code === 'member_joined'),
    ).toHaveLength(2);
  });

  it('changes roles but never leaves a table without a referee', async () => {
    const table = await referee.client.createTable({ name: 'Roles' });
    await player.client.joinTable(table.invite_code);
    await expect(referee.client.setMemberRole(table.id, referee.id, 'player')).rejects.toSatisfy((error) =>
      isProblem(error, 'last_referee'),
    );
    await expect(referee.client.leaveTable(table.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'last_referee'),
    );
    await expect(player.client.setMemberRole(table.id, player.id, 'referee')).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    const promoted = await referee.client.setMemberRole(table.id, player.id, 'referee');
    expect(promoted.members.every((member) => member.role === 'referee')).toBe(true);
    const demoted = await player.client.setMemberRole(table.id, referee.id, 'player');
    expect(demoted.members.find((member) => member.user_id === referee.id)?.role).toBe('player');
    // The demoted referee can now leave, and the remaining referee can delete the table.
    await referee.client.leaveTable(table.id);
    await expect(referee.client.getTable(table.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await player.client.deleteTable(table.id);
    await expect(player.client.getTable(table.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it('removes a kicked member and closes their connection', async () => {
    const table = await referee.client.createTable({ name: 'Kick' });
    await player.client.joinTable(table.invite_code);
    const ws = await connect(server, player, table.id);
    const closed = new Promise<string | undefined>((resolve) => {
      ws.connection.onStatus((status, reason) => {
        if (status === 'closed') resolve(reason);
      });
    });
    await expect(player.client.removeMember(table.id, referee.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    const after = await referee.client.removeMember(table.id, player.id);
    expect(after.members.map((member) => member.user_id)).toEqual([referee.id]);
    expect(await closed).toBe('removed');
    expect(ws.messages.at(-1)).toEqual({ type: 'removed', reason: 'kicked' });
    await expect(player.client.getTable(table.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it('pushes presence and the table to connected members', async () => {
    const table = await referee.client.createTable({ name: 'Presence' });
    await player.client.joinTable(table.invite_code);
    const refereeWs = await connect(server, referee, table.id);
    const playerWs = await connect(server, player, table.id);
    await received(refereeWs, 'presence', (message) => message.presence.online.length === 2);
    await referee.client.updateTable(table.id, { name: 'Presence 2' });
    await received(playerWs, 'table', (message) => message.table.name === 'Presence 2');
    playerWs.close();
    await received(
      refereeWs,
      'presence',
      (message) => message.presence.online.length === 1 && message.presence.online[0] === referee.id,
    );
    refereeWs.close();
  });

  it('deletes a table for a referee only, and tells the connections', async () => {
    const table = await referee.client.createTable({ name: 'Doomed' });
    await player.client.joinTable(table.invite_code);
    const ws = await connect(server, player, table.id);
    await expect(player.client.deleteTable(table.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await referee.client.deleteTable(table.id);
    await received(ws, 'removed', (message) => message.reason === 'table_deleted');
    expect((await player.client.listTables()).items.map((item) => item.id)).not.toContain(table.id);
  });
});
