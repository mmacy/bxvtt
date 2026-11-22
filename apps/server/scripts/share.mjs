#!/usr/bin/env node
// Publish the bxvtt server through a Cloudflare quick tunnel so players on other networks can join.
//
// Usage: npm run share   (after npm run build)
//
// The script finds a cloudflared binary: one on the PATH, or the one that the `cloudflared` npm package
// downloads from Cloudflare's releases. It starts `cloudflared tunnel --url`, reads the public
// https://*.trycloudflare.com address it prints, and then starts the built bxvtt server with that address in
// BXVTT_PUBLIC_ORIGINS and a host key in BXVTT_HOST_KEY, so only someone who knows the key can create a table.
// bxapi stays on 127.0.0.1.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const serverBundle = join(root, 'apps', 'server', 'dist', 'main.js');
const port = process.env.BXVTT_PORT ?? '8660';
const bxapiUrl = process.env.BXAPI_URL ?? 'http://127.0.0.1:8640';

/**
 * Finds a program on the PATH, ignoring the `node_modules/.bin` folders that npm adds while it runs a script, so
 * the `cloudflared` npm package never counts as one that you installed yourself.
 */
function findOnPath(name) {
  const names = process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`] : [name];
  const folders = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(
      (folder) => folder !== '' && !folder.split(sep).slice(-2).join('/').startsWith('node_modules/.bin'),
    );
  for (const folder of folders) {
    for (const candidate of names) {
      const path = join(folder, candidate);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

/** Returns the command that runs cloudflared and a phrase that says where it came from, or exits. */
async function findCloudflared() {
  const system = findOnPath('cloudflared');
  if (system !== null && !spawnSync(system, ['--version'], { stdio: 'ignore' }).error) {
    return { command: system, source: `the cloudflared that you installed (${system})` };
  }
  try {
    const loaded = await import('cloudflared');
    const lib = loaded.default ?? loaded;
    if (!existsSync(lib.bin)) {
      console.log('cloudflared is not installed. Downloading it from Cloudflare (one time)...');
      await lib.install(lib.bin);
    }
    return { command: lib.bin, source: 'the cloudflared that npm installed with bxvtt' };
  } catch (error) {
    console.error('npm run share needs cloudflared, and the copy that npm installs is not available.');
    console.error(`Reason: ${error instanceof Error ? error.message : String(error)}`);
    console.error(
      'Run `npm install` to fetch it, or install cloudflared yourself, for example with `brew install cloudflared`.',
    );
    console.error(
      'Downloads: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
    );
    process.exit(1);
  }
}

if (!existsSync(serverBundle) || !existsSync(join(root, 'apps', 'web', 'dist', 'index.html'))) {
  console.error('bxvtt is not built, so there is nothing to share. Run `npm run build` first.');
  process.exit(1);
}

try {
  const response = await fetch(new URL('/health', bxapiUrl), { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`status ${response.status}`);
} catch {
  console.error(`bxapi does not answer at ${bxapiUrl}, so players could not start a game.`);
  console.error('Start bxapi first, or set BXAPI_URL to its address, and run `npm run share` again.');
  process.exit(1);
}

const cloudflared = await findCloudflared();
console.log(`Starting a tunnel with ${cloudflared.source}...`);

const hostKey = process.env.BXVTT_HOST_KEY ?? randomBytes(18).toString('base64url');
const children = [];
const stop = () => {
  for (const child of children) child.kill('SIGTERM');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const tunnel = spawn(
  cloudflared.command,
  ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
children.push(tunnel);

const recent = [];
let publicUrl = null;
let registered = false;
let announced = false;

tunnel.on('error', (error) => {
  console.error(`Could not start cloudflared: ${error.message}`);
  stop();
  process.exitCode = 1;
});
tunnel.on('exit', (code) => {
  if (!announced) {
    console.error(`cloudflared stopped before it published an address (status ${code}). Its last output:`);
    for (const line of recent.slice(-8)) console.error(`  ${line}`);
    process.exitCode = 1;
  } else {
    console.error(`cloudflared stopped (status ${code}).`);
  }
  stop();
});

function announce() {
  if (announced || publicUrl === null || !registered) return;
  announced = true;
  console.log('');
  console.log(`  bxvtt is shared at ${publicUrl}`);
  console.log(`  Host key (needed to create a table): ${hostKey}`);
  console.log(
    '  Open the address above to create your table. Players join with an invite link and need no key.',
  );
  console.log('  Press Ctrl+C to stop sharing.');
  console.log('');
}

const onOutput = (chunk) => {
  const text = String(chunk);
  for (const line of text.split('\n')) if (line.trim() !== '') recent.push(line.trim());
  if (publicUrl === null) {
    const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text);
    if (match !== null) {
      publicUrl = match[0];
      const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', serverBundle], {
        stdio: 'inherit',
        env: {
          ...process.env,
          BXVTT_PORT: port,
          BXAPI_URL: bxapiUrl,
          BXVTT_HOST_KEY: hostKey,
          BXVTT_PUBLIC_ORIGINS: [process.env.BXVTT_PUBLIC_ORIGINS, publicUrl].filter(Boolean).join(','),
        },
      });
      children.push(server);
      server.on('exit', stop);
    }
  }
  if (/Registered tunnel connection/.test(text)) registered = true;
  announce();
};
tunnel.stdout.on('data', onOutput);
tunnel.stderr.on('data', onOutput);
