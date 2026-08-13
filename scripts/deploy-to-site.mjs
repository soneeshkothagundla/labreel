/**
 * Copies the built reel into the Capsule Space Labs site as a fully
 * self-contained bundle.
 *
 * Everything lands under sim/freeze-and-fly-3d/, which the site's own
 * sync-flight-lab.mjs then copies to public/flight-lab/freeze-and-fly/.
 * That preserves the live URL https://capsulelabs.space/flight-lab/freeze-and-fly
 * which is already linked from roughly twenty sent emails and the deck.
 *
 * Nothing is fetched at runtime. Pixi is vendored, there are no web fonts, no
 * HDRI, no glTF. The page works with the network cable pulled out, which is
 * the entire point three weeks before a demo day.
 */
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SITE = resolve(ROOT, '..', 'capsule-space-labs');
const DEST = join(SITE, 'sim', 'freeze-and-fly-3d');

if (!existsSync(SITE)) {
  console.error(`Site repo not found at ${SITE}`);
  process.exit(1);
}

// Wipe only the reel bundle, never the whole sim tree.
for (const sub of ['labreel', 'vendor']) {
  rmSync(join(DEST, sub), { recursive: true, force: true });
}
mkdirSync(join(DEST, 'labreel'), { recursive: true });

cpSync(join(ROOT, 'src'), join(DEST, 'labreel'), { recursive: true });
cpSync(join(ROOT, 'vendor'), join(DEST, 'vendor'), { recursive: true });

function bytes(dir) {
  let n = 0;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    n += f.isDirectory() ? bytes(p) : statSync(p).size;
  }
  return n;
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`labreel  -> ${DEST}\\labreel   ${kb(bytes(join(DEST, 'labreel')))}`);
console.log(`vendor   -> ${DEST}\\vendor    ${kb(bytes(join(DEST, 'vendor')))}`);
console.log(`\nNext: npm run build in the site repo (prebuild syncs to public/).`);
