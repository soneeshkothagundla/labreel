// TEMPORARY probe — delete when done. Software-rasteriser resilience check.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = 'C:/Users/sonee/Downloads/Capsule Sim Options';
const TMP = 'C:/Users/sonee/AppData/Local/Temp/claude/C--Users-sonee/0ead1007-fc84-40c1-8d59-a507fe5c364a/scratchpad';
const PAGE = '/options/3d-ogl-raymarch.html';
const PORT = 4701;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const fp = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e && e.stack || e)));

await page.goto(`http://localhost:${PORT}${PAGE}`, { waitUntil: 'load' });
await page.screenshot({ path: path.join(TMP, 'sw-warm.jpg'), type: 'jpeg', quality: 40 });
const t0 = Date.now();
await page.reload({ waitUntil: 'load' });

const hashFile = f => { const b = fs.readFileSync(f); let h = 0; for (let i = 0; i < b.length; i += 5) h = (h * 31 + b[i]) >>> 0; return h; };
const rows = [];
for (const ms of [4000, 6000, 8000, 12000, 16000, 20000]) {
  const left = ms - (Date.now() - t0); if (left > 0) await page.waitForTimeout(left);
  const at = Date.now() - t0;
  const fp = path.join(TMP, `sw-${ms}.jpg`);
  await page.screenshot({ path: fp, type: 'jpeg', quality: 55 });
  const d = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return { w: c.width, h: c.height };
  });
  rows.push({ ms, at, ...d, bytes: fs.statSync(fp).size, hash: hashFile(fp) });
}
const distinct = new Set(rows.map(r => r.hash)).size;
console.log(JSON.stringify({
  rows,
  distinctFrames: distinct,
  keptAnimating: distinct === rows.length,
  downscaled: rows[rows.length - 1].w < 1411,
  errs,
}, null, 2));
await browser.close(); server.close();
