// TEMPORARY verification harness — delete when done.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = 'C:/Users/sonee/Downloads/Capsule Sim Options';
const SHOTS = path.join(ROOT, 'shots');
const TMP = 'C:/Users/sonee/AppData/Local/Temp/claude/C--Users-sonee/0ead1007-fc84-40c1-8d59-a507fe5c364a/scratchpad';
const PAGE = '/options/3d-ogl-raymarch.html';
const SLUG = '3d-ogl-raymarch';
const PORT = 4701;
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.csv': 'text/csv',
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, url === '/' ? '/index.html' : url);
  if (!fp.startsWith(path.resolve(ROOT))) { res.writeHead(403); return res.end('no'); }
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404 ' + url); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({
  args: [
    '--use-gl=angle', '--use-angle=d3d11', '--enable-gpu',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-frame-rate-limit',
  ],
});
const consoleErrors = [], pageErrors = [], failedReqs = [], allConsole = [];

const newPage = async () => {
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('console', m => {
    allConsole.push(m.type() + ': ' + m.text());
    if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.type() + ': ' + m.text());
  });
  p.on('pageerror', e => pageErrors.push(String((e && e.stack) || e)));
  p.on('requestfailed', r => failedReqs.push(r.url() + ' :: ' + ((r.failure() || {}).errorText)));
  return p;
};
const hashFile = f => { const b = fs.readFileSync(f); let h = 0; for (let i = 0; i < b.length; i += 7) h = (h * 31 + b[i]) >>> 0; return h; };

// ---------- PASS 1: the three beat frames (PNG) ----------
const page = await newPage();
// warm the capture path first: the very first screenshot of a document pays a one-off
// font-load cost that would otherwise silently shift beat A's content seconds late.
await page.goto(`http://localhost:${PORT}${PAGE}`, { waitUntil: 'load' });
await page.screenshot({ path: path.join(TMP, 'ogl-warm.jpg'), type: 'jpeg', quality: 40 });
let t0 = Date.now();
await page.reload({ waitUntil: 'load' });
await page.evaluate(() => { window.__f = 0; const c = () => { window.__f++; requestAnimationFrame(c); }; requestAnimationFrame(c); });

const beats = [];
for (const [ms, name] of [[3000, 'a'], [11000, 'b'], [19000, 'c']]) {
  const left = ms - (Date.now() - t0);
  if (left > 0) await page.waitForTimeout(left);
  const capturedAt = Date.now() - t0;
  const fp = path.join(SHOTS, `${SLUG}-${name}.png`);
  await page.screenshot({ path: fp });
  beats.push({ name, capturedAt, doneAt: Date.now() - t0, bytes: fs.statSync(fp).size, hash: hashFile(fp) });
}
const diag = await page.evaluate(() => {
  const c = document.getElementById('gl');
  return {
    frames: window.__f,
    canvasW: c.width, canvasH: c.height,
    cssW: c.getBoundingClientRect().width, cssH: c.getBoundingClientRect().height,
    fallbackVisible: getComputedStyle(document.getElementById('fallback')).display !== 'none',
    quality: (typeof window.__q === 'number') ? window.__q : null,
    appFrames: (typeof window.__appFrames === 'number') ? window.__appFrames : null,
  };
});
const fpsAvg = +(diag.frames / ((Date.now() - t0) / 1000)).toFixed(1);

// pixel-level non-blank check on the three beats via canvas readback of the PNGs
await page.close();

// ---------- PASS 2: continuity, true 3.0s vs 3.5s (JPEG) ----------
const p2 = await newPage();
await p2.goto(`http://localhost:${PORT}${PAGE}`, { waitUntil: 'load' });
await p2.screenshot({ path: path.join(TMP, 'ogl-warm2.jpg'), type: 'jpeg', quality: 40 });
t0 = Date.now();
await p2.reload({ waitUntil: 'load' });
const cont = [];
for (const ms of [3000, 3500]) {
  const left = ms - (Date.now() - t0);
  if (left > 0) await p2.waitForTimeout(left);
  const capturedAt = Date.now() - t0;
  const fp = path.join(TMP, `ogl-cont-${ms}.jpg`);
  await p2.screenshot({ path: fp, type: 'jpeg', quality: 70 });
  cont.push({ ms, capturedAt, doneAt: Date.now() - t0, bytes: fs.statSync(fp).size, hash: hashFile(fp) });
}
await p2.close();

// ---------- PASS 3: ink coverage of each beat frame (is it actually lit?) ----------
const p3 = await newPage();
await p3.goto('about:blank');
const ink = [];
for (const b of ['a', 'b', 'c']) {
  const buf = fs.readFileSync(path.join(SHOTS, `${SLUG}-${b}.png`)).toString('base64');
  const r = await p3.evaluate(async (d) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + d;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 270;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, 480, 270);
    const px = cx.getImageData(0, 0, 480, 270).data;
    let lit = 0, bright = 0, sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const l = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
      sum += l;
      if (l > 26) lit++;
      if (l > 92) bright++;
    }
    const n = px.length / 4;
    return { litPct: +(100 * lit / n).toFixed(1), brightPct: +(100 * bright / n).toFixed(1), meanLuma: +(sum / n).toFixed(1) };
  }, buf);
  ink.push({ beat: b, ...r });
}
await p3.close();

// ---------- static-source greps ----------
const src = fs.readFileSync(path.join(ROOT, PAGE), 'utf8');
const loopStart = src.indexOf('function frame(');
const loopBody = src.slice(loopStart);
const grep = {
  noThree: !/three/i.test(src),
  noCdn: !/cdn/i.test(src),
  noHttpsSrc: !/https:\/\//i.test(src) && !/(src|href)\s*=\s*["'`]https?:\/\//i.test(src) && !/from\s+["'`]https?:\/\//i.test(src),
  noRandomInLoop: !/Math\.random\s*\(/.test(loopBody),
  noRandomAtAll: !/Math\.random\s*\(/.test(src),
};

const out = {
  fpsAvg, diag,
  consoleErrors, pageErrors, failedReqs,
  beats: beats.map(b => ({ ...b, kb: +(b.bytes / 1024).toFixed(1) })),
  continuity: cont,
  ink,
  grep,
  checks: {
    zeroConsoleErrors: consoleErrors.length === 0,
    zeroPageErrors: pageErrors.length === 0,
    zeroFailedRequests: failedReqs.length === 0,
    noFallback: diag.fallbackVisible === false,
    allOver25KB: beats.every(b => b.bytes > 25 * 1024),
    threeBeatsDiffer: new Set(beats.map(b => b.hash)).size === 3 && new Set(beats.map(b => b.bytes)).size === 3,
    animates_3s_vs_3p5s: cont[0].hash !== cont[1].hash && cont[0].bytes !== cont[1].bytes,
    continuityWindowHonest: cont[0].capturedAt < 3200 && cont[1].capturedAt < 3700
      && Math.abs(cont[1].capturedAt - cont[0].capturedAt - 500) < 250,
    beatTimingHonest: beats.every((b, i) => Math.abs(b.capturedAt - [3000, 11000, 19000][i]) < 300),
    inkNotBlank: ink.every(i => i.litPct > 12 && i.brightPct > 0.8),
    greps: Object.values(grep).every(Boolean),
  },
};
out.PASS = Object.values(out.checks).every(Boolean);
console.log(JSON.stringify(out, null, 2));
if (allConsole.length) console.log('--- console tail ---\n' + allConsole.slice(-25).join('\n'));

await browser.close();
server.close();
