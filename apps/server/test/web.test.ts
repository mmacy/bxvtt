import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestServer } from './helpers';
import { startServer } from './helpers';

describe('the built web client', () => {
  let server: TestServer;
  let webDist: string;

  beforeAll(async () => {
    webDist = await mkdtemp(join(tmpdir(), 'bxvtt-web-'));
    await mkdir(join(webDist, 'assets'));
    await writeFile(join(webDist, 'index.html'), '<!doctype html><title>bxvtt</title>');
    await writeFile(join(webDist, 'assets', 'app-1234.js'), 'console.log(1)');
    server = await startServer({ webDist });
  });

  afterAll(async () => {
    await server.close();
    await rm(webDist, { recursive: true, force: true });
  });

  it('serves index.html with a Content Security Policy and security headers', async () => {
    const response = await fetch(`${server.url}/`, { headers: { Accept: 'text/html' } });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<title>bxvtt</title>');
    const csp = response.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('connect-src');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('falls back to index.html for a client route, and not for the API or a missing file', async () => {
    const deep = await fetch(`${server.url}/tables/tbl_x/play`, { headers: { Accept: 'text/html' } });
    expect(deep.status).toBe(200);
    expect(await deep.text()).toContain('<title>bxvtt</title>');
    const api = await fetch(`${server.url}/api/missing`, { headers: { Accept: 'text/html' } });
    expect(api.status).toBe(401);
    const file = await fetch(`${server.url}/assets/missing.js`);
    expect(file.status).toBe(404);
  });

  it('caches hashed assets for a year', async () => {
    const response = await fetch(`${server.url}/assets/app-1234.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });
});
