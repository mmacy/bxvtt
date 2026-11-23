import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BxvttClient } from '@bxvtt/shared/client';
import { findRepoRoot } from '../src/config';
import { startServer } from './helpers';

/** The root `package.json`, the one file that versions a release. */
const rootPackage = JSON.parse(readFileSync(join(findRepoRoot(), 'package.json'), 'utf8')) as {
  version: string;
};

describe('GET /api/health', () => {
  it('reports the version from the root package.json', async () => {
    const server = await startServer();
    try {
      const client = new BxvttClient({ baseUrl: server.url });
      const health = await client.health();
      expect(health.version).toBe(rootPackage.version);
    } finally {
      await server.close();
    }
  });
});
