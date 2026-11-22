#!/usr/bin/env node
// Publish the bxvtt server through a Cloudflare quick tunnel so players on other networks can join.
//
// Usage: npm run share   (after npm run build)
//
// The script starts `cloudflared tunnel --url`, reads the public https://*.trycloudflare.com address it prints,
// and then starts the built bxvtt server with that address in BXVTT_PUBLIC_ORIGINS and a host key in
// BXVTT_HOST_KEY, so only someone who knows the key can create a table. bxapi stays on 127.0.0.1.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const serverBundle = join(root, 'apps', 'server', 'dist', 'main.js');
const port = process.env.BXVTT_PORT ?? '8660';

if (spawnSync('cloudflared', ['--version'], { stdio: 'ignore' }).error) {
  console.error(
    'npm run share needs cloudflared. Install it, for example with `brew install cloudflared`, and try again.',
  );
  console.error(
    'See https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
  );
  process.exit(1);
}
if (!existsSync(serverBundle)) {
  console.error('The server is not built. Run `npm run build` first.');
  process.exit(1);
}
if (!existsSync(join(root, 'apps', 'web', 'dist', 'index.html'))) {
  console.error('The web client is not built, so players would see only the API. Run `npm run build` first.');
  process.exit(1);
}

const hostKey = process.env.BXVTT_HOST_KEY ?? randomBytes(18).toString('base64url');
const children = [];
const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(tunnel);
tunnel.on('exit', (code) => {
  console.error(`cloudflared stopped (status ${code}).`);
  stop();
});

let started = false;
const onOutput = (chunk) => {
  const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(chunk));
  if (match === null || started) return;
  started = true;
  const publicUrl = match[0];
  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', serverBundle], {
    stdio: 'inherit',
    env: {
      ...process.env,
      BXVTT_PORT: port,
      BXVTT_HOST_KEY: hostKey,
      BXVTT_PUBLIC_ORIGINS: [process.env.BXVTT_PUBLIC_ORIGINS, publicUrl].filter(Boolean).join(','),
    },
  });
  children.push(server);
  server.on('exit', stop);
  console.log('');
  console.log(`  bxvtt is shared at ${publicUrl}`);
  console.log(`  Host key (needed to create a table): ${hostKey}`);
  console.log('  Players join with an invite link and need no key. Press Ctrl+C to stop sharing.');
  console.log('');
};
tunnel.stdout.on('data', onOutput);
tunnel.stderr.on('data', onOutput);
