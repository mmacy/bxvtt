// Write each adventure in adventures/src to adventures/<name>.json.
// Usage: node adventures/tools/build.mjs [--maps]
//   --maps  also prints each level as text.
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderLevel } from './lib.mjs';

const root = new URL('..', import.meta.url).pathname;
const showMaps = process.argv.includes('--maps');

for (const name of readdirSync(join(root, 'src'))
  .filter((entry) => entry.endsWith('.mjs'))
  .sort()) {
  const { file, document } = await import(join(root, 'src', name));
  writeFileSync(join(root, file), JSON.stringify(document, null, 2) + '\n');
  console.log(`wrote adventures/${file}`);
  if (showMaps) {
    for (const dungeon of document.payload.dungeons) {
      for (const level of dungeon.levels) {
        console.log(
          '\n' +
            renderLevel(level, { title: `${document.payload.name}: ${dungeon.id} level ${level.number}` }),
        );
      }
    }
  }
}
