import type { WebSocket } from 'ws';
import type { Presence, Role, ServerMessage } from '@bxvtt/shared/protocol';
import { WS_CLOSE_CODES } from '@bxvtt/shared/protocol';

/** The most bytes the server queues for one slow connection before it drops the connection. */
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

/** One authenticated WebSocket connection to a table. */
export interface Connection {
  /** A process-unique ID. */
  id: number;
  socket: WebSocket;
  tableId: string;
  userId: string;
  /** Messages held back until the snapshot is sent, or `null` once the connection is live. */
  pending: string[] | null;
}

/** Who a message is for: the user and their role at the table. */
export interface Recipient {
  userId: string;
  role: Role;
}

/** Builds the message for one recipient, or `null` to send that recipient nothing. */
export type MessageBuilder = (recipient: Recipient) => ServerMessage | null;

/**
 * The registry of WebSocket connections. It sends each message to the connections of one table, building the
 * message for each recipient's role, so a player connection never receives a message built for a referee.
 */
export class Hub {
  private readonly byTable = new Map<string, Set<Connection>>();
  private nextId = 1;

  /**
   * @param roleOf - Looks up a user's current role at a table, or `null` when they aren't a member.
   * @param onPresence - Called after the set of connected users of a table changes.
   */
  constructor(
    private readonly roleOf: (tableId: string, userId: string) => Role | null,
    private readonly onPresence: (tableId: string) => void,
  ) {}

  /**
   * Registers a connection. Messages to it are held until {@link Hub.activate} sends them.
   *
   * @param socket - The socket.
   * @param tableId - The table.
   * @param userId - The user.
   */
  add(socket: WebSocket, tableId: string, userId: string): Connection {
    const connection: Connection = { id: this.nextId++, socket, tableId, userId, pending: [] };
    const set = this.byTable.get(tableId) ?? new Set();
    const wasOnline = this.isOnline(tableId, userId);
    set.add(connection);
    this.byTable.set(tableId, set);
    if (!wasOnline) this.onPresence(tableId);
    return connection;
  }

  /**
   * Sends a message to the connection ahead of the messages held for it, and then sends those.
   *
   * @param connection - The connection.
   * @param first - The first message, usually the snapshot.
   */
  activate(connection: Connection, first: ServerMessage): void {
    const pending = connection.pending ?? [];
    connection.pending = null;
    this.write(connection, JSON.stringify(first));
    for (const data of pending) this.write(connection, data);
  }

  /**
   * Removes a connection.
   *
   * @param connection - The connection.
   */
  remove(connection: Connection): void {
    const set = this.byTable.get(connection.tableId);
    if (set === undefined || !set.delete(connection)) return;
    if (set.size === 0) this.byTable.delete(connection.tableId);
    if (!this.isOnline(connection.tableId, connection.userId)) this.onPresence(connection.tableId);
  }

  /**
   * Lists who is connected to a table.
   *
   * @param tableId - The table.
   */
  presence(tableId: string): Presence {
    const online = new Set<string>();
    for (const connection of this.byTable.get(tableId) ?? []) online.add(connection.userId);
    return { online: [...online].sort() };
  }

  /**
   * Whether any referee of a table is connected.
   *
   * @param tableId - The table.
   */
  hasReferee(tableId: string): boolean {
    for (const connection of this.byTable.get(tableId) ?? []) {
      if (this.roleOf(tableId, connection.userId) === 'referee') return true;
    }
    return false;
  }

  /**
   * Sends a message to every connection of a table, built for each recipient.
   *
   * @param tableId - The table.
   * @param build - Builds the message for one recipient, or returns `null` to skip them.
   * @param only - Send only to this user's connections.
   */
  send(tableId: string, build: MessageBuilder, only?: string): void {
    const cache = new Map<string, string | null>();
    for (const connection of this.byTable.get(tableId) ?? []) {
      if (only !== undefined && connection.userId !== only) continue;
      const role = this.roleOf(tableId, connection.userId);
      if (role === null) continue;
      const key = `${role}:${connection.userId}`;
      let data = cache.get(key);
      if (data === undefined) {
        const message = build({ userId: connection.userId, role });
        data = message === null ? null : JSON.stringify(message);
        cache.set(key, data);
      }
      if (data === null) continue;
      if (connection.pending !== null) connection.pending.push(data);
      else this.write(connection, data);
    }
  }

  /**
   * Sends the same message to every connection of a table.
   *
   * @param tableId - The table.
   * @param message - The message, which must hold nothing that only referees may see.
   */
  broadcast(tableId: string, message: ServerMessage): void {
    this.send(tableId, () => message);
  }

  /**
   * Tells a user's connections that they aren't a member anymore, and closes them.
   *
   * @param tableId - The table.
   * @param userId - The user, or `null` for every user of the table.
   * @param reason - Why.
   */
  removeUser(tableId: string, userId: string | null, reason: 'left' | 'kicked' | 'table_deleted'): void {
    for (const connection of [...(this.byTable.get(tableId) ?? [])]) {
      if (userId !== null && connection.userId !== userId) continue;
      this.write(connection, JSON.stringify({ type: 'removed', reason } satisfies ServerMessage));
      connection.socket.close(WS_CLOSE_CODES.removed, reason);
      this.remove(connection);
    }
  }

  /**
   * Closes a user's connections with the `resync` code, so their clients reconnect and get a new snapshot.
   *
   * @param tableId - The table.
   * @param userId - The user.
   */
  reconnectUser(tableId: string, userId: string): void {
    for (const connection of [...(this.byTable.get(tableId) ?? [])]) {
      if (connection.userId !== userId) continue;
      connection.socket.close(WS_CLOSE_CODES.resync, 'role changed');
      this.remove(connection);
    }
  }

  /**
   * Holds the messages for a connection until {@link Hub.activate} sends a new snapshot ahead of them.
   *
   * @param connection - The connection.
   */
  hold(connection: Connection): void {
    if (connection.pending === null) connection.pending = [];
  }

  /** Closes every connection, for shutdown. */
  closeAll(): void {
    for (const set of this.byTable.values()) {
      for (const connection of set)
        connection.socket.close(WS_CLOSE_CODES.server_shutdown, 'server shutting down');
    }
    this.byTable.clear();
  }

  private isOnline(tableId: string, userId: string): boolean {
    for (const connection of this.byTable.get(tableId) ?? []) {
      if (connection.userId === userId) return true;
    }
    return false;
  }

  /**
   * Counts a user's connections to a table.
   *
   * @param tableId - The table.
   * @param userId - The user.
   */
  connectionsOf(tableId: string, userId: string): number {
    let count = 0;
    for (const connection of this.byTable.get(tableId) ?? []) if (connection.userId === userId) count += 1;
    return count;
  }

  private write(connection: Connection, data: string): void {
    const socket = connection.socket;
    if (socket.readyState !== socket.OPEN) return;
    // A client that stops reading would make the server buffer every message for it. Past the limit, the server
    // drops the connection, and the client reconnects and gets a snapshot.
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.terminate();
      return;
    }
    socket.send(data);
  }
}
