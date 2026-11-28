// Regenerate the bxapi OpenAPI snapshot and its TypeScript types, and the text layer's code list.
// Usage: npm run gen:bxapi            (exports the document from ~/repos/bxapi, or $BXAPI_DIR)
//        BXAPI_URL=http://127.0.0.1:8653 npm run gen:bxapi   (downloads it from a running server)
//        BXAPI_URL=... OSRLIB_PYTHON=/path/to/bxapi/.venv/bin/python npm run gen:bxapi
// It writes openapi.json, schema.d.ts (the types), and ruleset.json (the `Ruleset` fields, their values, and their
// defaults, which the protocol's ruleset check reads). Then it regenerates packages/shared/src/text/data/codes.json
// and catalog.json from osrlib's source with packages/shared/src/text/tools/extract-codes.py, which needs a Python
// that has the same osrlib installed as the bxapi: the bxapi checkout's (`uv run`), or $OSRLIB_PYTHON. It stops
// before it writes the code list when $OSRLIB_PYTHON has another osrlib. With BXAPI_URL and no OSRLIB_PYTHON, it
// can't reach that osrlib. In every case it then compares the code list's osrlib version with the bxapi's engine,
// and when they differ it prints the command to run and exits with status 1. Set BXAPI_KEY for a server that
// requires a key, because the engine version comes from GET /v1/meta.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const outDir = new URL('../packages/shared/src/bxapi/', import.meta.url).pathname;
const bxapiDir = process.env.BXAPI_DIR ?? join(homedir(), 'repos', 'bxapi');
// Run the checkout's Python as it is installed: `--frozen` never rewrites uv.lock, and `--no-sync` never installs
// or removes a package in its .venv, so the generator changes nothing in the bxapi checkout.
const uvRun = ['run', '--frozen', '--no-sync'];

let text;
if (process.env.BXAPI_URL) {
  const response = await fetch(new URL('/openapi.json', process.env.BXAPI_URL));
  if (!response.ok) throw new Error(`GET /openapi.json returned ${response.status}`);
  text = await response.text();
} else {
  text = execFileSync('uv', [...uvRun, 'python', '-m', 'bxapi.openapi'], {
    cwd: bxapiDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Drop the recorded examples: they make up most of the document and the types don't use them.
const strip = (node) => {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'examples' || key === 'example') continue;
      out[key] = strip(value);
    }
    return out;
  }
  return node;
};
const doc = strip(JSON.parse(text));
writeFileSync(join(outDir, 'openapi.json'), JSON.stringify(doc, null, 1) + '\n');

// The `Ruleset` fields, each with its JSON type, its allowed values, and its default, for the protocol's ruleset
// check and the standard ruleset. Every field is a boolean or a string enum, inline or through a `$ref`.
const schemas = doc.components?.schemas ?? {};
const resolve = (node) =>
  typeof node?.$ref === 'string' ? schemas[node.$ref.replace('#/components/schemas/', '')] : node;
const fields = {};
for (const [name, property] of Object.entries(schemas.Ruleset?.properties ?? {})) {
  const target = resolve(property);
  if (target?.type === 'boolean') {
    fields[name] = { type: 'boolean', default: property.default ?? target.default };
  } else if (target?.type === 'string' && Array.isArray(target.enum)) {
    fields[name] = { type: 'string', enum: target.enum, default: property.default ?? target.default };
  } else {
    throw new Error(`Ruleset.${name} is neither a boolean nor a string enum. Teach the generator its type.`);
  }
  if (fields[name].default === undefined) throw new Error(`Ruleset.${name} has no default.`);
}
const rulesetPath = join(outDir, 'ruleset.json');
writeFileSync(rulesetPath, JSON.stringify({ fields }, null, 2) + '\n');
execFileSync('npx', ['prettier', '--write', rulesetPath], { stdio: 'inherit' });
execFileSync(
  'npx',
  [
    '-y',
    'openapi-typescript@7.13.0',
    join(outDir, 'openapi.json'),
    '-o',
    join(outDir, 'schema.d.ts'),
    '--root-types',
    '--root-types-no-schema-prefix',
  ],
  { stdio: 'inherit' },
);
console.log(
  `Wrote ${join(outDir, 'openapi.json')}, ruleset.json, and schema.d.ts for bxapi ${doc.info?.version}`,
);

// The text layer's code list. It has to come from the osrlib that the bxapi above runs, or the coverage tests check
// the text against the wrong codes.
const repoRoot = new URL('..', import.meta.url).pathname;
const extractScript = join(repoRoot, 'packages/shared/src/text/tools/extract-codes.py');
const textData = join(repoRoot, 'packages/shared/src/text/data');
const codesPath = join(textData, 'codes.json');
const extract = (command, args) => {
  execFileSync(command, args, { cwd: repoRoot, stdio: 'inherit' });
  execFileSync('npx', ['prettier', '--write', textData], { cwd: repoRoot, stdio: 'inherit' });
};
const osrlibVersionCode = 'import importlib.metadata as m; print(m.version("osrlib"))';
// The osrlib version that the bxapi above runs: the server's `engine_version`, or the one installed in the checkout.
const engineVersion = async () => {
  if (!process.env.BXAPI_URL) {
    return execFileSync('uv', [...uvRun, 'python', '-I', '-c', osrlibVersionCode], {
      cwd: bxapiDir,
      encoding: 'utf8',
    }).trim();
  }
  const headers = process.env.BXAPI_KEY ? { authorization: `Bearer ${process.env.BXAPI_KEY}` } : {};
  const response = await fetch(new URL('/v1/meta', process.env.BXAPI_URL), { headers });
  if (!response.ok) {
    throw new Error(
      `GET /v1/meta returned ${response.status}, so the generator can't tell which osrlib the bxapi runs. ` +
        'Set BXAPI_KEY for a server that requires a key.',
    );
  }
  const { engine_version: version } = await response.json();
  if (typeof version !== 'string' || version === '')
    throw new Error('GET /v1/meta returned no engine_version.');
  return version;
};
const engine = await engineVersion();
if (process.env.OSRLIB_PYTHON) {
  const python = process.env.OSRLIB_PYTHON;
  const installed = execFileSync(python, ['-I', '-c', osrlibVersionCode], { encoding: 'utf8' }).trim();
  if (installed !== engine) {
    throw new Error(
      `${python} has osrlib ${installed}, but the bxapi runs osrlib ${engine}. Set OSRLIB_PYTHON to the Python ` +
        'of that bxapi. The code list is unchanged.',
    );
  }
  extract(python, ['-I', extractScript]);
} else if (!process.env.BXAPI_URL) {
  extract('uv', [...uvRun, '--project', bxapiDir, 'python', '-I', extractScript]);
}
const listed = JSON.parse(readFileSync(codesPath, 'utf8')).osrlib_version;
if (listed !== engine) {
  console.error(
    `codes.json lists the codes of osrlib ${listed}, but the bxapi runs osrlib ${engine}. Regenerate it with ` +
      'the Python of that bxapi:\n' +
      `  OSRLIB_PYTHON=<bxapi checkout>/.venv/bin/python BXAPI_URL=${process.env.BXAPI_URL ?? '<url>'} npm run gen:bxapi`,
  );
  process.exitCode = 1;
} else {
  console.log(`codes.json lists the codes of osrlib ${listed}.`);
}
