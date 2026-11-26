// Regenerate the bxapi OpenAPI snapshot and its TypeScript types.
// Usage: npm run gen:bxapi            (exports the document from ~/repos/bxapi, or $BXAPI_DIR)
//        BXAPI_URL=http://127.0.0.1:8653 npm run gen:bxapi   (downloads it from a running server)
// It writes openapi.json, schema.d.ts (the types), and ruleset.json (the `Ruleset` fields, their values, and their
// defaults, which the protocol's ruleset check reads).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
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
