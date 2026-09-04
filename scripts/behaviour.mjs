/**
 * Drive every ported interaction and check it actually works.
 *
 * verify.mjs proves rules win the cascade and sweep.mjs proves links and
 * images resolve, but neither clicks anything. This does: it opens the
 * popups, scrolls the sticky header, submits the form empty, filters the
 * gallery, opens the lightbox and checks the comparison slider is enhanced.
 *
 * It earns its place — it caught a lightbox that was present in the markup
 * on all 341 portfolio images and opened for none of them, because the
 * gallery's class was missing from the click selector.
 *
 *   npx astro build && node scripts/behaviour.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs'; import path from 'node:path';
const DIST='/home/user/vinylwraptoronto/dist', PORT=8155;
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.pdf':'application/pdf'};
const s=createServer((q,r)=>{let f=path.join(DIST,decodeURIComponent(q.url.split('?')[0]));
 if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=path.join(f,'index.html');
 if(!fs.existsSync(f)){r.writeHead(404);return r.end('x');}
 r.writeHead(200,{'content-type':M[path.extname(f)]||'application/octet-stream'});r.end(fs.readFileSync(f));});
await new Promise(r=>s.listen(PORT,'127.0.0.1',r));
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const p=await b.newPage({viewport:{width:1440,height:1000}});
const U=`http://127.0.0.1:${PORT}`;
const out=[];
const ok=(n,v,d='')=>out.push(`${v?'PASS':'*** FAIL'}  ${n}${d?'  ('+d+')':''}`);

// Images are served from img.vinylwraptoronto.com, so 'networkidle' never
// settles here — the portfolio alone pulls 341 remote files. Every behaviour
// below is DOM and script, not pixels, so wait for the document and then for
// the specific element the check drives.
const go=async(url,sel)=>{
  await p.goto(url,{waitUntil:'domcontentloaded'});
  if(sel) await p.waitForSelector(sel,{state:'attached',timeout:15000});
  await p.waitForTimeout(250);
};

// popups
await go(`${U}/`,'.wantto');
await p.click('.wantto');
await p.waitForTimeout(300);
ok('"I want to" popup opens', await p.isVisible('#popup-want-to'));
ok('  popup has its links', (await p.$$('#popup-want-to a')).length>=17, String((await p.$$('#popup-want-to a')).length));
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
ok('  closes on Escape', !(await p.isVisible('#popup-want-to')));
await p.click('[data-sticky-bar] [data-popup="popup-quote"]');
await p.waitForTimeout(300);
ok('quote popup opens from sticky bar', await p.isVisible('#popup-quote'));
ok('  contains the quote form', await p.isVisible('#popup-quote form.qform'));
await p.keyboard.press('Escape');

// carousel
const dots=await p.$$('.carou-dots button');
ok('carousel present', (await p.$$('[data-carousel]')).length===1);
ok('  dots suppressed when all slides fit', dots.length===0, `${dots.length} dots at 1440px`);

// sticky header
await p.evaluate(()=>window.scrollTo(0,1200)); await p.waitForTimeout(400);
const stuck=await p.evaluate(()=>document.querySelector('.site-header').getBoundingClientRect().top);
ok('header stays stuck on scroll', Math.abs(stuck)<2, `top=${Math.round(stuck)}`);

// form validation
await go(`${U}/contact/`,'form.qform');
const f=await p.$('form.qform');
if(f){ await p.click('form.qform .qbtn'); await p.waitForTimeout(300);
  ok('form blocks empty submit', (await p.textContent('form.qform .qstatus')||'').toLowerCase().includes('required')); }
else ok('contact form present', false);

// gallery filter + lightbox
await go(`${U}/vinyl-car-wrap-our-portfolio/`,'.fgal-item');
const all=(await p.$$('.fgal-item')).length;
await p.click('.fgal-tab[data-index="2"]'); await p.waitForTimeout(300);
const shown=await p.evaluate(()=>[...document.querySelectorAll('.fgal-item')].filter(e=>!e.hidden).length);
ok('gallery filter narrows the set', shown>0&&shown<all, `${shown} of ${all}`);
await p.click('.fgal-tab[data-index="all"]'); await p.waitForTimeout(200);
await p.click('.fgal-item img'); await p.waitForTimeout(400);
ok('lightbox opens on an image', await p.isVisible('#lightbox'));
await p.keyboard.press('Escape');

// before/after slider
await go(`${U}/wraps-before-after/audi-q5-full-colour-change/`,'.compare-pair');
ok('comparison slider enhanced', (await p.$$('.compare-pair[data-juxtapose]')).length>0);
ok('  drag handle present', (await p.$$('.jx-handle')).length>0);

console.log(out.join('\n'));
console.log(`\n${out.filter(x=>x.startsWith('PASS')).length}/${out.length} behaviour checks passed`);
await b.close(); s.close();
