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
});
