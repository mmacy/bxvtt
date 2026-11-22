/** The bxapi the tests use. */
const BXAPI_URL = process.env.BXAPI_URL ?? 'http://127.0.0.1:8651';

/**
 * Checks that bxapi answers before any server test runs, so a missing bxapi fails with one clear message
 * instead of a timeout in every test.
 */
export default async function setup(): Promise<void> {
  if (BXAPI_URL.includes(':8640')) {
    throw new Error(
      'The server tests never use the bxapi on port 8640. Set BXAPI_URL to a development bxapi.',
    );
  }
  try {
    const response = await fetch(`${BXAPI_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `bxapi isn't reachable at ${BXAPI_URL} (${reason}). Start it with scripts/dev-bxapi.sh ` +
        '(npm run dev:bxapi), or set BXAPI_URL to a running development bxapi.',
      { cause: error },
    );
  }
}
