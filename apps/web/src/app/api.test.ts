import { BxvttProblemError } from '@bxvtt/shared/client';
import { PROBLEM_CODES } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import { describeProblem } from './api';

describe('describeProblem', () => {
  it('has its own words for every problem code', () => {
    const generic: string[] = [];
    for (const [code, status] of Object.entries(PROBLEM_CODES)) {
      const message = describeProblem(
        new BxvttProblemError({
          type: 'about:blank',
          title: code,
          status,
          code,
          detail: 'The server says why.',
        }),
      );
      if (message.title === "That didn't work") generic.push(code);
    }
    // A code without its own text here falls through to "That didn't work". Add a line to FIXED in api.ts.
    expect(generic).toEqual([]);
  });

  it('tells the player the server may be restarting when a proxy answers for it', () => {
    const message = describeProblem(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Bad gateway',
        status: 502,
        code: 'server_unavailable',
        detail: 'The proxy answered.',
      }),
    );
    expect(message.title).toBe("The bxvtt server isn't responding");
    expect(message.detail).toMatch(/starting or restarting/);
  });

  it('says the game service is out of date, not unreachable, for an engine that is too old', () => {
    const message = describeProblem(
      new BxvttProblemError({
        type: 'about:blank',
        title: 'Service Unavailable',
        status: 503,
        code: 'bxapi_outdated',
        detail: 'The server says why.',
      }),
    );
    expect(message.title).toBe('The game service is out of date');
    expect(message.detail).toBe(
      "Games can't run until it's updated. Ask the server host to update the game service.",
    );
  });

  it('keeps the retry sentence by default, and leaves it out beside a Try again control', () => {
    const serverError = new BxvttProblemError({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      code: 'internal_error',
      detail: 'The server failed.',
    });
    expect(describeProblem(serverError).detail).toBe(
      'Try again. If it keeps happening, contact the server host.',
    );
    expect(describeProblem(serverError, { retryControl: true }).detail).toBe(
      'If it keeps happening, contact the server host.',
    );
    const thrown = new Error('boom');
    expect(describeProblem(thrown).detail).toBe('Try again. If it keeps happening, reload the page.');
    expect(describeProblem(thrown, { retryControl: true }).detail).toBe(
      'If it keeps happening, reload the page.',
    );
    // A detail with no retry sentence reads the same either way.
    const network = new TypeError('Failed to fetch');
    expect(describeProblem(network, { retryControl: true }).detail).toBe(describeProblem(network).detail);
  });
});
