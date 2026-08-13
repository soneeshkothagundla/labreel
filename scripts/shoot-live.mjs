import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const BASE = 'https://capsule-sim-options.vercel.app';
const PATHS = process.argv.slice(2);
const OUT = 'C:/Users/sonee/Downloads/Capsule Sim Options/shots';
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({args:['--enable-unsafe-swiftshader','--use-gl=angle','--ignore-gpu-blocklist']});
for (const p of PATHS){
  const page = await b.newPage({viewport:{width:1920,height:1080}});
  const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,110))});
  page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message.slice(0,110)));
  try{
    await page.goto(BASE+'/'+p,{waitUntil:'load',timeout:45000});
    await page.waitForTimeout(3000);
    const name = p.replace(/\W+/g,'-');
    const f1 = `${OUT}/live-${name}-a.png`;
    await page.screenshot({path:f1});
    await page.waitForTimeout(1200);
    const f2 = `${OUT}/live-${name}-b.png`;
    await page.screenshot({path:f2});
    const {size:s1} = await import('node:fs').then(m=>m.statSync(f1));
    const {size:s2} = await import('node:fs').then(m=>m.statSync(f2));
    const moving = Math.abs(s1-s2) > 800;
    console.log(`${p.padEnd(14)} ${(s1/1024).toFixed(0).padStart(4)}KB  ${moving?'ANIMATING':'STATIC!!'}  ${errs.length?('ERR: '+errs[0]):'clean'}`);
  }catch(e){ console.log(`${p.padEnd(14)} FAILED ${e.message.slice(0,70)}`); }
  await page.close();
}
await b.close();
