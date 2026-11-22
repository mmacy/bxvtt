/**
 * A framework-agnostic client SDK for the bxvtt server: {@link BxvttClient} for the HTTP API and
 * {@link TableConnection} for the WebSocket. Both work in a browser and in Node 24.
 */
export { BxvttClient, BxvttProblemError, isProblem } from './http';
export type { BxvttClientOptions } from './http';
export { TableConnection } from './connection';
export type {
  CloseReason,
  ConnectionStatus,
  TableConnectionOptions,
  WebSocketConstructor,
} from './connection';
