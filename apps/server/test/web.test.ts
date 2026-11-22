import { request as httpRequest } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestServer } from './helpers';
import { startServer } from './helpers';

/** A script large enough to be worth compressing. */
const BIG = Array.from({ length: 2000 }, (_, i) => `export const value${i} = ${i};`).join('\n');

/** Reads a response's raw bytes and headers, without the decoding that fetch does. */
function raw(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () =>
        resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

describe('the built web client', () => {
  let server: TestServer;
  let webDist: string;

  beforeAll(async () => {
    webDist = await mkdtemp(join(tmpdir(), 'bxvtt-web-'));
    await mkdir(join(webDist, 'assets'));
    await writeFile(
      join(webDist, 'index.html'),
      `<!doctype html><title>bxvtt</title>${'<p>page</p>'.repeat(200)}`,
    );
    await writeFile(join(webDist, 'assets', 'app-1234.js'), 'console.log(1)');
    await writeFile(join(webDist, 'assets', 'big-5678.js'), BIG);
    await writeFile(join(webDist, 'assets', 'font-9.woff2'), Buffer.alloc(4096, 7));
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

  it('sends scripts compressed with brotli or gzip, as Accept-Encoding allows (R-003)', async () => {
    const url = `${server.url}/assets/big-5678.js`;
    const br = await raw(url, { 'Accept-Encoding': 'gzip, deflate, br' });
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.headers.vary).toContain('Accept-Encoding');
    expect(br.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(br.headers['content-type']).toContain('javascript');
    expect(br.body.length).toBeLessThan(Buffer.byteLength(BIG) / 3);
    expect(brotliDecompressSync(br.body).toString('utf8')).toBe(BIG);
    const gz = await raw(url, { 'Accept-Encoding': 'gzip' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gz.body).toString('utf8')).toBe(BIG);
    const plain = await raw(url, { 'Accept-Encoding': 'identity' });
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.headers.vary).toContain('Accept-Encoding');
    expect(plain.body.toString('utf8')).toBe(BIG);
    const refused = await raw(url, { 'Accept-Encoding': 'br;q=0, gzip' });
    expect(refused.headers['content-encoding']).toBe('gzip');
    const again = await raw(url, { 'Accept-Encoding': 'br', 'If-None-Match': String(br.headers.etag) });
    expect(again.status).toBe(304);
    expect(br.headers['content-security-policy']).toContain("script-src 'self'");
  });

  it('compresses index.html without long-lived caching, and leaves fonts alone', async () => {
    const page = await raw(`${server.url}/tables/tbl_x`, { Accept: 'text/html', 'Accept-Encoding': 'br' });
    expect(page.status).toBe(200);
    expect(page.headers['content-encoding']).toBe('br');
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(brotliDecompressSync(page.body).toString('utf8')).toContain('<title>bxvtt</title>');
    const font = await raw(`${server.url}/assets/font-9.woff2`, { 'Accept-Encoding': 'br' });
    expect(font.headers['content-encoding']).toBeUndefined();
    expect(font.body.length).toBe(4096);
    const escape = await raw(`${server.url}/assets/..%2F..%2Fpackage.json`, { 'Accept-Encoding': 'br' });
    expect(escape.status).toBe(404);
  });
});
