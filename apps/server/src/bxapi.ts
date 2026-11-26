import type { FastifyBaseLogger } from 'fastify';
import { ApiError } from './errors';

/** A problem document bxapi returned. */
export interface BxapiProblemBody {
  code: string;
  detail: string;
  status: number;
  [member: string]: unknown;
}

/** bxapi answered with an error status. */
export class BxapiProblem extends Error {
  /** The HTTP status. */
  readonly status: number;
  /** The problem document. */
  readonly body: BxapiProblemBody;
  /** The `Retry-After` header in seconds, or `null`. */
  readonly retryAfter: number | null;

  /**
   * @param status - The HTTP status.
   * @param body - The problem document.
   * @param retryAfter - The `Retry-After` header in seconds.
   */
  constructor(status: number, body: BxapiProblemBody, retryAfter: number | null) {
    super(`bxapi ${status} ${body.code}: ${body.detail}`);
    this.name = 'BxapiProblem';
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }

  /** The problem code. */
  get code(): string {
    return this.body.code;
  }
}

/**
 * bxvtt couldn't get an answer from bxapi. `maybeApplied` is `true` when the request may have reached bxapi
 * (a timeout or a dropped connection), and `false` when the connection was refused.
 */
export class BxapiUnreachable extends Error {
  /** Whether bxapi may have run the request. */
  readonly maybeApplied: boolean;

  /**
   * @param message - What went wrong.
   * @param maybeApplied - Whether bxapi may have run the request.
   */
  constructor(message: string, maybeApplied: boolean) {
    super(message);
    this.name = 'BxapiUnreachable';
    this.maybeApplied = maybeApplied;
  }
}

/** Options for one bxapi request. */
export interface BxapiRequestOptions {
  body?: unknown;
  /** The serialized body, when the caller must send the same bytes again on a retry. */
  rawBody?: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  requestId?: string;
}

/** A raw bxapi response, for the proxies that pass headers on. */
export interface BxapiRawResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

/** The bxapi problem codes that describe the user's input, which the server passes to the client unchanged. */
const PASS_THROUGH_CODES = new Set([
  'validation_error',
  'content_invalid',
  'character_invalid',
  'party_invalid',
  'ability_roll_used',
  'version_unsupported',
  'adventure_read_only',
]);

/**
 * A client for bxapi. It's the only code that calls bxapi. It sends the referee key, when one is set, and turns
 * failures into {@link BxapiProblem} and {@link BxapiUnreachable}.
 */
export class BxapiClient {
  /**
   * @param baseUrl - bxapi's base URL.
   * @param key - A referee key, or `null` for anonymous mode.
   * @param timeoutMs - How long one request may take.
   * @param log - The logger.
   */
  constructor(
    readonly baseUrl: string,
    private readonly key: string | null,
    private readonly timeoutMs: number,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Sends a request and returns the raw response, without throwing on an error status.
   *
   * @param method - The HTTP method.
   * @param path - The path, starting with `/v1` or `/health`.
   * @param options - The body, query, and headers.
   * @throws BxapiUnreachable when bxapi doesn't answer.
   */
  async raw(method: string, path: string, options: BxapiRequestOptions = {}): Promise<BxapiRawResponse> {
    const url = new URL(this.baseUrl + path);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (this.key !== null) headers.Authorization = `Bearer ${this.key}`;
    if (options.idempotencyKey !== undefined) headers['Idempotency-Key'] = options.idempotencyKey;
    if (options.requestId !== undefined) headers['X-Request-Id'] = options.requestId;
    let body: string | undefined = options.rawBody;
    if (body === undefined && options.body !== undefined) body = JSON.stringify(options.body);
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response: Response;
    const started = Date.now();
    try {
      response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw toUnreachable(error);
    }
    let parsed: unknown = null;
    try {
      const text = await response.text();
      parsed = text === '' ? null : JSON.parse(text);
    } catch (error) {
      if (response.ok) throw toUnreachable(error);
    }
    this.log.debug({ method, path, status: response.status, ms: Date.now() - started }, 'bxapi request');
    return { status: response.status, headers: response.headers, body: parsed };
  }

  /**
   * Sends a request and returns the parsed body of a 2xx response.
   *
   * @param method - The HTTP method.
   * @param path - The path.
   * @param options - The body, query, and headers.
   * @throws BxapiProblem when bxapi answers with an error status.
   * @throws BxapiUnreachable when bxapi doesn't answer.
   */
  async request<T>(method: string, path: string, options: BxapiRequestOptions = {}): Promise<T> {
    const response = await this.raw(method, path, options);
    if (response.status >= 200 && response.status < 300) return response.body as T;
    throw toProblem(response);
  }

  /**
   * Sends a GET request.
   *
   * @param path - The path.
   * @param query - The query parameters.
   */
  get<T>(path: string, query?: BxapiRequestOptions['query']): Promise<T> {
    return this.request<T>('GET', path, { query });
  }

  /**
   * Sends a POST request with a JSON body.
   *
   * @param path - The path.
   * @param body - The body.
   * @param options - More options.
   */
  post<T>(path: string, body: unknown, options: BxapiRequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }
}

/** Converts a failed fetch into {@link BxapiUnreachable}. */
function toUnreachable(error: unknown): BxapiUnreachable {
  const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
  const refused = cause?.code === 'ECONNREFUSED' || cause?.code === 'ENOTFOUND';
  const message = error instanceof Error ? error.message : String(error);
  return new BxapiUnreachable(
    refused ? 'bxapi refused the connection.' : `bxapi didn't answer: ${message}`,
    !refused,
  );
}

/** Converts an error response into {@link BxapiProblem}. */
export function toProblem(response: BxapiRawResponse): BxapiProblem {
  const body =
    typeof response.body === 'object' && response.body !== null && 'code' in response.body
      ? (response.body as BxapiProblemBody)
      : { code: 'unknown', detail: `bxapi answered ${response.status}.`, status: response.status };
  const retry = Number(response.headers.get('retry-after'));
  return new BxapiProblem(response.status, body, Number.isFinite(retry) && retry > 0 ? retry : null);
}

/**
 * Converts a bxapi failure into the {@link ApiError} that the client receives. Problems about the user's input
 * pass through with their extra members. bxapi being down becomes `bxapi_unavailable`. Anything else becomes
 * `bxapi_error`. A `not_found` passes through only when `passNotFound` is set, because most routes check IDs
 * before they call bxapi.
 *
 * @param error - The error from a {@link BxapiClient} call.
 * @param options - Whether to pass `not_found` through.
 * @returns The error to throw.
 */
export function toApiError(error: unknown, options: { passNotFound?: boolean } = {}): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof BxapiUnreachable) {
    return new ApiError(
      'bxapi_unavailable',
      "The server can't reach the game service. Ask the server host to check that it is running, then try again.",
    );
  }
  if (error instanceof BxapiProblem) {
    const {
      code,
      detail,
      status,
      type: _type,
      title: _title,
      request_id: _requestId,
      ...extras
    } = error.body;
    if (PASS_THROUGH_CODES.has(code) || (options.passNotFound === true && code === 'not_found')) {
      if (code === 'validation_error' && Array.isArray(extras.errors)) {
        extras.errors = (extras.errors as { loc?: unknown[]; msg?: string }[]).map((issue) => ({
          path: Array.isArray(issue.loc) ? issue.loc.filter((part) => part !== 'body') : [],
          message: issue.msg ?? '',
        }));
      }
      return new ApiError(code as 'validation_error', detail, extras, { status });
    }
    if (code === 'storage_full') {
      // Waiting doesn't free storage, so this isn't a busy bxapi.
      return new ApiError(
        'bxapi_storage_full',
        "Server storage is full, so new characters, games, actions, and saves can't be stored. Delete unused tables or saves, or ask the server host to raise the storage limit.",
        {
          ...(typeof extras.used_bytes === 'number' ? { used_bytes: extras.used_bytes } : {}),
          ...(typeof extras.max_bytes === 'number' || extras.max_bytes === null
            ? { max_bytes: extras.max_bytes }
            : {}),
        },
      );
    }
    if (code === 'rate_limited' || code === 'database_busy') {
      return new ApiError('bxapi_unavailable', 'The server is busy right now. Try again in a moment.');
    }
    return new ApiError(
      'bxapi_error',
      'The server encountered an unexpected error while processing that action. Try again, or ask the server host to check the logs.',
    );
  }
  return error;
}

/**
 * Runs a bxapi call and converts its failures with {@link toApiError}.
 *
 * @param fn - The call.
 * @param options - Whether to pass `not_found` through.
 */
export async function callBxapi<T>(
  fn: () => Promise<T>,
  options: { passNotFound?: boolean } = {},
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toApiError(error, options);
  }
}
