// Deletes from bxapi what a throwaway bxvtt server stored there: its sessions, saves, uploaded adventures, and
// characters. The end-to-end suite and the screenshot script run it after they stop their server and before they
// remove its data directory. Without it, every run leaves its games in the shared development bxapi.
//
// Usage: BXAPI_URL=http://127.0.0.1:8651 node scripts/purge-bxapi.mjs <bxvtt data directory>
//
// It reads the server's database, so stop the server first. It sends BXAPI_KEY when that variable is set, as the
// server does. A resource bxapi no longer has counts as deleted.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

/** The bxapi path of each kind of resource, in the order the purge deletes them. */
const PATHS = {
  save: '/v1/saves/',
  session: '/v1/sessions/',
  adventure: '/v1/adventures/',
  character: '/v1/characters/',
};

/** The queries that find each kind of resource in a bxvtt database. */
const QUERIES = {
  save: ['SELECT id FROM saves', "SELECT id FROM bxapi_garbage WHERE kind = 'save'"],
  session: [
    'SELECT session_id AS id FROM tables WHERE session_id IS NOT NULL',
    'SELECT session_id AS id FROM table_sessions',
    "SELECT id FROM bxapi_garbage WHERE kind = 'session'",
  ],
  adventure: [
    'SELECT id FROM adventures',
    'SELECT adventure_id AS id FROM samples',
    "SELECT id FROM bxapi_garbage WHERE kind = 'adventure'",
  ],
  character: ['SELECT id FROM characters', "SELECT id FROM bxapi_garbage WHERE kind = 'character'"],
};

/**
 * Reads the IDs of every bxapi resource a bxvtt database refers to.
 *
 * @param {string} dbPath - The path of `bxvtt.db`.
 * @returns {Record<keyof PATHS, string[]>} The IDs of each kind.
 */
function readIds(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const ids = {};
    for (const [kind, queries] of Object.entries(QUERIES)) {
      const found = new Set();
      for (const query of queries) {
        for (const row of db.prepare(query).all()) found.add(String(row.id));
      }
      ids[kind] = [...found];
    }
    return ids;
  } finally {
    db.close();
  }
}

/**
 * Deletes from bxapi every resource a bxvtt data directory's database refers to.
 *
 * @param {string} dataDir - The bxvtt server's data directory.
 * @param {object} [options] - Where bxapi is.
 * @param {string} [options.bxapiUrl] - The bxapi URL. Defaults to `BXAPI_URL`, then `http://127.0.0.1:8651`.
 * @param {string} [options.bxapiKey] - The bxapi key. Defaults to `BXAPI_KEY`.
 * @returns {Promise<{deleted: number, failed: number}>} How many resources it deleted, and how many it couldn't.
 */
export async function purgeBxapi(dataDir, options = {}) {
  const dbPath = join(dataDir, 'bxvtt.db');
  if (!existsSync(dbPath)) return { deleted: 0, failed: 0 };
  const bxapiUrl = (options.bxapiUrl ?? process.env.BXAPI_URL ?? 'http://127.0.0.1:8651').replace(/\/$/, '');
  if (new URL(bxapiUrl).port === '8640') {
    throw new Error('The purge never sends a request to the bxapi on port 8640.');
  }
  const key = options.bxapiKey ?? process.env.BXAPI_KEY;
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  const ids = readIds(dbPath);
  let deleted = 0;
  let failed = 0;
  for (const [kind, path] of Object.entries(PATHS)) {
    for (const id of ids[kind]) {
      try {
        const response = await fetch(`${bxapiUrl}${path}${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) deleted += 1;
        else if (response.status !== 404) failed += 1;
      } catch {
        failed += 1;
      }
    }
  }
  return { deleted, failed };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.argv[2];
  if (dataDir === undefined) {
    console.error('Usage: node scripts/purge-bxapi.mjs <bxvtt data directory>');
    process.exit(2);
  }
  const { deleted, failed } = await purgeBxapi(dataDir);
  console.log(`Deleted ${deleted} bxapi resources.${failed > 0 ? ` ${failed} could not be deleted.` : ''}`);
  if (failed > 0) process.exitCode = 1;
}
