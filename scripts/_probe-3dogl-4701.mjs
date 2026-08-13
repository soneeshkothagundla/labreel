// TEMPORARY probe — delete when done.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = 'C:/Users/sonee/Downloads/Capsule Sim Options';
const PAGE = '/options/3d-ogl-raymarch.html';
const PORT = 4701;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, url === '/' ? '/index.html' : url);
  fs.readFile(fp, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', m => errs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e && e.stack || e)));
const t0 = Date.now();
await page.goto(`http://localhost:${PORT}${PAGE}`, { waitUntil: 'load' });
await page.evaluate(() => { window.__f = 0; const c = () => { window.__f++; requestAnimationFrame(c); }; requestAnimationFrame(c); });
for (const ms of [2000, 5000, 10000, 20000, 40000]) {
  const left = ms - (Date.now() - t0); if (left > 0) await page.waitForTimeout(left);
  const d = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return { f: window.__f, w: c.width, h: c.height, q: window.__q ?? null };
  });
  console.log(JSON.stringify({ at: Date.now() - t0, ...d }));
}
console.log('ERRS:', JSON.stringify(errs.slice(0, 20), null, 1));
await browser.close(); server.close();
