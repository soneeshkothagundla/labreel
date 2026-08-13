/**
 * Visual verification harness.
 *
 * Boots the reel in a real browser, seeks to a list of times, and writes a PNG
 * for each. Also captures every console error and any unhandled rejection,
 * because a scene that throws inside update() fails silently on screen: the
 * frame just stops changing, which is exactly the failure you do not notice
 * until you are on stage.
 *
 *   node scripts/shoot.mjs [--out shots] [--times 2,10,20,...]
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const OUT = join(ROOT, arg('out', 'shots'));
const TIMES = arg('times', '3,12,21,29,38,46,53,61,70,80,90')
  .split(',')
  .map(Number);

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const path = join(ROOT, url === '/' ? 'examples/flagship.html' : url);
    if (!existsSync(path)) {
      res.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
});

await new Promise((r) => server.listen(4599, r));
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto('http://localhost:4599/examples/flagship.html?renderer=pixi', {
  waitUntil: 'load',
});

// Wait for the transport to exist rather than a fixed sleep.
await page.waitForFunction(() => window.__reel?.transport, null, { timeout: 30000 });

const report = { shots: [], errors: [], scenes: {} };

report.scenes = await page.evaluate(() => {
  const r = window.__reel.renderer;
  return {
    loaded: [...(r.scenes?.keys?.() ?? [])],
    expected: window.__reel.reel.beats.map((b) => b.id),
  };
});

for (const t of TIMES) {
  await page.evaluate((time) => {
    window.__reel.transport.pause();
    window.__reel.transport.seek(time);
  }, t);
  // Let two frames land so anything easing on frame.time settles visibly.
  await page.waitForTimeout(120);
  const beat = await page.evaluate(() => window.__reel.reel.sample(window.__reel.transport.clock.time).lead?.beat.id ?? 'none');
  const file = join(OUT, `t${String(t).padStart(3, '0')}-${beat}.png`);
  await page.screenshot({ path: file });
  report.shots.push({ t, beat, file });
  console.log(`  ${String(t).padStart(3)}s  ${beat}`);
}

report.errors = errors;
await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 2));

await browser.close();
server.close();

const missing = report.scenes.expected.filter((e) => !report.scenes.loaded.includes(e));
console.log(`\nscenes loaded: ${report.scenes.loaded.length}/${report.scenes.expected.length}`);
if (missing.length) console.log(`MISSING: ${missing.join(', ')}`);
if (errors.length) {
  console.log(`\n${errors.length} console problem(s):`);
  for (const e of [...new Set(errors)].slice(0, 25)) console.log('  ' + e);
} else {
  console.log('no console errors');
}
