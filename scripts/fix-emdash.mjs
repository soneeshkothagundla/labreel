/**
 * Soneesh's standing rule is no em-dashes in anything an audience sees.
 * Code comments are not audience-facing, so this only rewrites em-dashes that
 * sit inside string literals, and leaves every comment untouched.
 *
 * Replacement is context-sensitive:
 *   "ALL CAPS LABEL - OTHER LABEL"  becomes a middle dot separator
 *   "prose - more prose"            becomes a comma
 */
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';

const TARGETS = process.argv.slice(2);

// Matches '...', "...", `...` without crossing a newline.
const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

function fixInside(str) {
  if (!str.includes('—')) return str;
  return str.replace(/\s*—\s*/g, (m, offset) => {
    const before = str.slice(Math.max(0, offset - 14), offset);
    const after = str.slice(offset + m.length, offset + m.length + 14);
    const capsish = (s) => /[A-Z0-9%.\s]{3,}$/.test(s) && !/[a-z]{2}/.test(s);
    // A label pair like "GROUND - MODELLED" wants a separator, not punctuation.
    if (capsish(before) && /^[A-Z0-9]/.test(after) && !/^[A-Z][a-z]/.test(after)) {
      return ' · ';
    }
    return ', ';
  });
}

let total = 0;
for (const file of TARGETS) {
  const src = await readFile(file, 'utf8');
  let changed = 0;
  const out = src.replace(STRING_RE, (whole, quote, body) => {
    const fixed = fixInside(body);
    if (fixed !== body) changed++;
    return quote + fixed + quote;
  });
  if (changed) {
    await writeFile(file, out, 'utf8');
    console.log(`  ${changed.toString().padStart(3)}  ${file}`);
    total += changed;
  }
}
console.log(`\n${total} rendered string(s) fixed across ${TARGETS.length} file(s)`);
