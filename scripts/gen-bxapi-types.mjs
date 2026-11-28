// Regenerate the bxapi OpenAPI snapshot and its TypeScript types, and the text layer's code list.
// Usage: npm run gen:bxapi            (exports the document from ~/repos/bxapi, or $BXAPI_DIR)
//        BXAPI_URL=http://127.0.0.1:8653 npm run gen:bxapi   (downloads it from a running server)
//        BXAPI_URL=... OSRLIB_PYTHON=/path/to/bxapi/.venv/bin/python npm run gen:bxapi
// It writes openapi.json, schema.d.ts (the types), and ruleset.json (the `Ruleset` fields, their values, and their
// defaults, which the protocol's ruleset check reads). Then it regenerates packages/shared/src/text/data/codes.json
// and catalog.json from osrlib's source with packages/shared/src/text/tools/extract-codes.py, which needs a Python
// that has the same osrlib installed as the bxapi: the bxapi checkout's (`uv run`), or $OSRLIB_PYTHON. With
// BXAPI_URL and no OSRLIB_PYTHON, it can't reach that osrlib, so it compares the code list's osrlib version with the
// server's engine and prints the command to run when they differ.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const outDir = new URL('../packages/shared/src/bxapi/', import.meta.url).pathname;
const bxapiDir = process.env.BXAPI_DIR ?? join(homedir(), 'repos', 'bxapi');

let text;
if (process.env.BXAPI_URL) {
  const response = await fetch(new URL('/openapi.json', process.env.BXAPI_URL));
  if (!response.ok) throw new Error(`GET /openapi.json returned ${response.status}`);
  text = await response.text();
} else {
  text = execFileSync('uv', ['run', 'python', '-m', 'bxapi.openapi'], {
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
if (process.env.OSRLIB_PYTHON) {
  extract(process.env.OSRLIB_PYTHON, ['-I', extractScript]);
} else if (!process.env.BXAPI_URL) {
  extract('uv', ['run', '--project', bxapiDir, 'python', extractScript]);
} else {
  const meta = await fetch(new URL('/v1/meta', process.env.BXAPI_URL)).then((response) => response.json());
  const listed = JSON.parse(readFileSync(codesPath, 'utf8')).osrlib_version;
  if (meta.engine_version !== listed) {
    console.warn(
      `codes.json lists the codes of osrlib ${listed}, but the bxapi at ${process.env.BXAPI_URL} runs osrlib ` +
        `${meta.engine_version}. Regenerate it with the Python of that bxapi:\n` +
        `  OSRLIB_PYTHON=<bxapi checkout>/.venv/bin/python BXAPI_URL=${process.env.BXAPI_URL} npm run gen:bxapi\n` +
        'or, from the repository root:\n' +
        `  <bxapi checkout>/.venv/bin/python -I packages/shared/src/text/tools/extract-codes.py && npx prettier --write packages/shared/src/text/data`,
    );
    process.exitCode = 1;
  } else {
    console.log(`codes.json already lists the codes of osrlib ${listed}.`);
  }
}
