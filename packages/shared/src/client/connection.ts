import type { ClientMessage, MapPing, ServerMessage, ServerMessageOf } from '../protocol';
import { WS_CLOSE_CODES, WS_PATH } from '../protocol';
import { pageLocation } from './http';

/** The state of a {@link TableConnection}. */
export type ConnectionStatus = 'idle' | 'connecting' | 'authenticating' | 'open' | 'reconnecting' | 'closed';

/** Why a connection stopped for good. */
export type CloseReason = 'closed_by_client' | 'auth_failed' | 'removed' | 'game_missing';

/** The constructor of a WebSocket, so a caller can pass an implementation other than the global one. */
export type WebSocketConstructor = new (url: string) => WebSocket;

/** Options for {@link TableConnection}. */
export interface TableConnectionOptions {
  /**
   * The WebSocket URL, such as `ws://127.0.0.1:8660/ws`. In a browser, omit it to use the page's origin with
   * `ws:` or `wss:`.
   */
  url?: string;
  /** The user token. The connection sends it in the first message, never in the URL. */
  token: string;
  /** The table to connect to. */
  tableId: string;
  /** A WebSocket implementation. Defaults to the global `WebSocket`. */
  WebSocket?: WebSocketConstructor;
  /** How often to send a heartbeat, in milliseconds. Default 20,000. */
  heartbeatMs?: number;
  /** How long the server may stay silent before the connection reconnects, in milliseconds. Default 45,000. */
  idleTimeoutMs?: number;
  /** The first reconnect delay, in milliseconds. Each failure doubles it. Default 500. */
  reconnectInitialMs?: number;
  /** The longest reconnect delay, in milliseconds. Default 10,000. */
  reconnectMaxMs?: number;
}

type Handler<T extends ServerMessage['type']> = (message: ServerMessageOf<T>) => void;
type AnyHandler = (message: ServerMessage) => void;
type StatusHandler = (status: ConnectionStatus, reason?: CloseReason) => void;

/**
 * A live connection to one table over the bxvtt WebSocket. It authenticates with the first message, delivers
 * typed server messages to handlers, sends heartbeats, and reconnects with exponential backoff after a drop. On
 * reconnect it asks for a snapshot that catches the feed up from the last entry it saw, so a client that
 * replaces its state from each snapshot and each state message never falls behind.
 *
 * Feed entries arrive in `feed` messages and in each snapshot's `feed` page. The connection drops a `feed`
 * message whose entry it has already delivered.
 */
export class TableConnection {
  private readonly options: Required<Omit<TableConnectionOptions, 'url' | 'WebSocket'>> & {
    url: string;
    WebSocket: WebSocketConstructor;
  };
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'idle';
  private readonly handlers = new Map<string, Set<(message: ServerMessage) => void>>();
  private readonly anyHandlers = new Set<AnyHandler>();
  private readonly statusHandlers = new Set<StatusHandler>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMessageAt = 0;
  private attempt = 0;
  private stopped = false;
  private lastFeedSeqValue: number | null = null;

  /**
   * @param options - The server URL, the token, the table, and timing options.
   */
  constructor(options: TableConnectionOptions) {
    const WebSocketImpl = options.WebSocket ?? (globalThis.WebSocket as WebSocketConstructor | undefined);
    if (WebSocketImpl === undefined) throw new Error('No WebSocket implementation is available.');
    this.options = {
      url: options.url ?? defaultUrl(),
      token: options.token,
      tableId: options.tableId,
      WebSocket: WebSocketImpl,
      heartbeatMs: options.heartbeatMs ?? 20_000,
      idleTimeoutMs: options.idleTimeoutMs ?? 45_000,
      reconnectInitialMs: options.reconnectInitialMs ?? 500,
      reconnectMaxMs: options.reconnectMaxMs ?? 10_000,
    };
  }

  /** The connection's state. */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** The `seq` of the newest feed entry delivered, or `null` before the first snapshot. */
  get lastFeedSeq(): number | null {
    return this.lastFeedSeqValue;
  }

  /**
   * Calls a handler for every server message of one type.
   *
   * @param type - The message type, such as `game`.
   * @param handler - The function to call with each message.
   * @returns A function that removes the handler.
   */
  on<T extends ServerMessage['type']>(type: T, handler: Handler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    const wrapped = handler as (message: ServerMessage) => void;
    set.add(wrapped);
    this.handlers.set(type, set);
    return () => set.delete(wrapped);
  }

  /**
   * Calls a handler for every server message.
   *
   * @param handler - The function to call with each message.
   * @returns A function that removes the handler.
   */
  onAny(handler: AnyHandler): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }

  /**
   * Calls a handler each time the connection's state changes.
   *
   * @param handler - The function to call with the new state, and the reason when the state is `closed`.
   * @returns A function that removes the handler.
   */
  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /**
   * Waits for the next message of one type that matches a test.
   *
   * @param type - The message type.
   * @param predicate - A test the message must pass.
   * @param timeoutMs - How long to wait before rejecting. Default 10,000.
   */
  next<T extends ServerMessage['type']>(
    type: T,
    predicate: (message: ServerMessageOf<T>) => boolean = () => true,
    timeoutMs = 10_000,
  ): Promise<ServerMessageOf<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`No ${type} message arrived within ${timeoutMs} ms.`));
      }, timeoutMs);
      const off = this.on(type, (message) => {
        if (!predicate(message)) return;
        clearTimeout(timer);
        off();
        resolve(message);
      });
    });
  }

  /**
   * Opens the connection. Call it once, and again only after the connection closed with `game_missing`, to try
   * once more.
   */
  connect(): void {
    if (this.socket !== null) return;
    this.attempt = 0;
    this.stopped = false;
    this.open();
  }

  /** Closes the connection for good. */
  close(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.socket !== null) {
      this.socket.close(1000);
      this.socket = null;
    }
    this.setStatus('closed', 'closed_by_client');
  }

  /**
   * Sends a map ping to the table.
   *
   * @param ping - The level and the point.
   */
  sendPing(ping: MapPing): void {
    this.send({ type: 'ping', ...ping });
  }

  /** Asks the server for a new snapshot. */
  resync(): void {
    this.send(
      this.lastFeedSeqValue === null
        ? { type: 'resync' }
        : { type: 'resync', feed_after: this.lastFeedSeqValue },
    );
  }

  /** Closes the socket so the connection reconnects at once. Tests use it to simulate a dropped network. */
  dropForTest(): void {
    this.socket?.close(4000);
  }

  private open(): void {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = new this.options.WebSocket(this.options.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      this.setStatus('authenticating');
      this.lastMessageAt = Date.now();
      const auth: ClientMessage = {
        type: 'auth',
        token: this.options.token,
        table_id: this.options.tableId,
        ...(this.lastFeedSeqValue === null ? {} : { feed_after: this.lastFeedSeqValue }),
      };
      socket.send(JSON.stringify(auth));
      this.startHeartbeat();
    });
    socket.addEventListener('message', (event: MessageEvent) => {
      if (this.socket !== socket) return;
      this.lastMessageAt = Date.now();
      const data: unknown = event.data;
      if (typeof data !== 'string') return;
      let message: ServerMessage;
      try {
        message = JSON.parse(data) as ServerMessage;
      } catch {
        return;
      }
      this.handleMessage(message);
    });
    socket.addEventListener('close', (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      if (this.stopped) return;
      if (event.code === WS_CLOSE_CODES.auth_failed) {
        this.stopped = true;
        this.setStatus('closed', 'auth_failed');
        return;
      }
      if (event.code === WS_CLOSE_CODES.removed) {
        this.stopped = true;
        this.setStatus('closed', 'removed');
        return;
      }
      if (event.code === WS_CLOSE_CODES.game_missing) {
        this.stopped = true;
        this.setStatus('closed', 'game_missing');
        return;
      }
      if (event.code === WS_CLOSE_CODES.resync) this.attempt = 0;
      this.scheduleReconnect(event.code === WS_CLOSE_CODES.resync);
    });
  }

  private handleMessage(message: ServerMessage): void {
    if (message.type === 'snapshot') {
      this.attempt = 0;
      this.setStatus('open');
      const last = message.feed.entries.at(-1);
      if (last !== undefined) this.lastFeedSeqValue = Math.max(this.lastFeedSeqValue ?? 0, last.seq);
      else if (this.lastFeedSeqValue === null) this.lastFeedSeqValue = 0;
    } else if (message.type === 'feed') {
      if (this.lastFeedSeqValue !== null && message.entry.seq <= this.lastFeedSeqValue) return;
      this.lastFeedSeqValue = message.entry.seq;
    }
    for (const handler of this.handlers.get(message.type) ?? []) handler(message);
    for (const handler of this.anyHandlers) handler(message);
  }

  private send(message: ClientMessage): void {
    if (this.socket !== null && this.status === 'open') this.socket.send(JSON.stringify(message));
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.socket === null) return;
      if (Date.now() - this.lastMessageAt > this.options.idleTimeoutMs) {
        this.socket.close(4000);
        return;
      }
      if (this.status === 'open')
        this.socket.send(JSON.stringify({ type: 'heartbeat' } satisfies ClientMessage));
    }, this.options.heartbeatMs);
  }

  private scheduleReconnect(immediately = false): void {
    const base = Math.min(this.options.reconnectMaxMs, this.options.reconnectInitialMs * 2 ** this.attempt);
    const delay = immediately ? 0 : base / 2 + Math.random() * (base / 2);
    this.attempt += 1;
    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
  }

  private setStatus(status: ConnectionStatus, reason?: CloseReason): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusHandlers) handler(status, reason);
  }
}

/** The WebSocket URL of the page's own origin. */
function defaultUrl(): string {
  const location = pageLocation();
  if (location === undefined) throw new Error('Pass url when there is no page location.');
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}${WS_PATH}`;
}
