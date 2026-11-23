import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProblemCode, ValidationIssue } from '@bxvtt/shared/protocol';
import { PROBLEM_CODES } from '@bxvtt/shared/protocol';
import { STATUS_CODES } from 'node:http';
import type { z } from 'zod';

/** Extra members of a problem document. */
export type ProblemExtras = Record<string, unknown>;

/**
 * An error that the error handler turns into a problem document with a stable code. Throw it from any route.
 */
export class ApiError extends Error {
  /** The problem code. */
  readonly code: ProblemCode;
  /** The HTTP status. */
  readonly status: number;
  /** Extra members of the problem document. */
  readonly extras: ProblemExtras;
  /** Headers to send with the problem, such as `Retry-After`. */
  readonly headers: Record<string, string>;

  /**
   * @param code - The problem code.
   * @param detail - A sentence for a person.
   * @param extras - Extra members of the problem document.
   * @param options - The status, when it differs from the code's usual one, and extra headers.
   */
  constructor(
    code: ProblemCode,
    detail: string,
    extras: ProblemExtras = {},
    options: { status?: number; headers?: Record<string, string> } = {},
  ) {
    super(detail);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status ?? PROBLEM_CODES[code];
    this.extras = extras;
    this.headers = options.headers ?? {};
  }
}

/**
 * Builds a problem document.
 *
 * @param status - The HTTP status.
 * @param code - The problem code.
 * @param detail - A sentence for a person.
 * @param requestId - The request ID.
 * @param extras - Extra members.
 */
export function problemBody(
  status: number,
  code: string,
  detail: string,
  requestId: string | undefined,
  extras: ProblemExtras = {},
): Record<string, unknown> {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    code,
    detail: detail.slice(0, 1000),
    ...(requestId === undefined ? {} : { request_id: requestId }),
    ...extras,
  };
}

/**
 * Sends an {@link ApiError} as a problem document.
 *
 * @param reply - The reply.
 * @param error - The error.
 */
export function sendApiError(reply: FastifyReply, error: ApiError): FastifyReply {
  for (const [name, value] of Object.entries(error.headers)) reply.header(name, value);
  return reply
    .status(error.status)
    .type('application/problem+json')
    .send(problemBody(error.status, error.code, error.message, reply.request.id, error.extras));
}

/**
 * Converts zod issues to the `errors` member of a `validation_error` problem.
 *
 * @param issues - The issues from a failed parse.
 */
export function toValidationIssues(issues: z.core.$ZodIssue[]): ValidationIssue[] {
  return issues.slice(0, 20).map((issue) => ({
    path: issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part)),
    message: issue.message,
  }));
}

/**
 * Parses a value with a zod schema, throwing a `validation_error` problem when it doesn't match.
 *
 * @param schema - The schema.
 * @param value - The request body or query.
 * @param what - What the value is, for the problem's `detail`.
 */
export function parseWith<T extends z.ZodType>(schema: T, value: unknown, what = 'request body'): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError('validation_error', `The ${what} contains invalid values.`, {
      errors: toValidationIssues(result.error.issues),
    });
  }
  return result.data;
}

/**
 * Parses a request's JSON body, treating a missing body as an empty object.
 *
 * @param schema - The schema.
 * @param request - The request.
 */
export function parseBody<T extends z.ZodType>(schema: T, request: FastifyRequest): z.infer<T> {
  return parseWith(schema, request.body ?? {}, 'request body');
}

/**
 * Parses a request's query string.
 *
 * @param schema - The schema.
 * @param request - The request.
 */
export function parseQuery<T extends z.ZodType>(schema: T, request: FastifyRequest): z.infer<T> {
  return parseWith(schema, request.query ?? {}, 'query string');
}

/**
 * Throws a `not_found` problem.
 *
 * @param resource - The kind of resource, such as `table`.
 * @param id - The ID that matched nothing.
 */
export function notFound(resource: string, id: string): never {
  throw new ApiError('not_found', `That ${resource} wasn't found, or you don't have access to it.`, {
    resource,
    id,
  });
}
