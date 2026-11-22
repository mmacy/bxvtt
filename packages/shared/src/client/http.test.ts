import { describe, expect, it } from 'vitest';
import { BxvttClient, BxvttProblemError, isProblem } from './http';

/** A client whose `fetch` answers every request with one response. */
function clientAnswering(body: string, status: number, contentType = 'text/html'): BxvttClient {
  const fetchImpl: typeof fetch = async () =>
    new Response(body, { status, headers: { 'Content-Type': contentType } });
  return new BxvttClient({ baseUrl: 'http://127.0.0.1:1', fetch: fetchImpl });
}

describe('BxvttClient errors', () => {
  it("turns a proxy's HTML error page into server_unavailable instead of a SyntaxError", async () => {
    const client = clientAnswering('<html><body>502 Bad Gateway</body></html>', 502);
    const error: unknown = await client.me().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BxvttProblemError);
    expect(isProblem(error, 'server_unavailable')).toBe(true);
    expect((error as BxvttProblemError).status).toBe(502);
  });

  it('names a non-JSON error by its status', async () => {
    const tooLarge = await clientAnswering('Request Entity Too Large', 413)
      .me()
      .catch((caught: unknown) => caught);
    expect(isProblem(tooLarge, 'content_too_large')).toBe(true);
    const teapot = await clientAnswering('short and stout', 418)
      .me()
      .catch((caught: unknown) => caught);
    expect(isProblem(teapot, 'bad_request')).toBe(true);
  });

  it('throws invalid_response for a success whose body is not JSON', async () => {
    const error: unknown = await clientAnswering('<!doctype html><title>bxvtt</title>', 200)
      .listTables()
      .catch((caught: unknown) => caught);
    expect(isProblem(error, 'invalid_response')).toBe(true);
  });

  it("passes the server's problem document through", async () => {
    const problem = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      code: 'revision_conflict',
      detail: 'The game moved on.',
      revision: 12,
    };
    const error: unknown = await clientAnswering(JSON.stringify(problem), 409, 'application/problem+json')
      .getGame('tbl_x')
      .catch((caught: unknown) => caught);
    expect(isProblem(error, 'revision_conflict')).toBe(true);
    expect((error as BxvttProblemError).problem.revision).toBe(12);
  });
});
