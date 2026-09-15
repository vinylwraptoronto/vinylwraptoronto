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

// sticky header: away on the way down, back on the way up.
//
// This used to assert the header stayed at top=0 for ever, which is the
// opposite of what the original does -- it animates its own top to -200px as
// soon as you scroll down and back to 0 on the first upward movement. The
// check passed for months on behaviour the original does not have.
//
// Real wheel gestures, because the code under test reads scroll direction.
const hdrTop = () => p.evaluate(() =>
  document.querySelector('.site-header').getBoundingClientRect().top);
await p.evaluate(()=>window.scrollTo(0,0)); await p.waitForTimeout(300);
await p.mouse.move(720, 500);
await p.mouse.wheel(0, 600); await p.waitForTimeout(700);
const down = await hdrTop();
ok('header hides on scroll down', down < -100, `top=${Math.round(down)}`);
await p.mouse.wheel(0, -300); await p.waitForTimeout(700);
const up = await hdrTop();
ok('  and comes back on scroll up', Math.abs(up) < 2, `top=${Math.round(up)}`);

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

// Buttons must actually change colour under the pointer. Worth a check of its
// own because the way this last broke was silent: the resting colour was set
// as an inline declaration, which outranks every stylesheet rule, so .btn:hover
// stopped applying and every button on the site went dead while still looking
// correct at rest.
await go(`${U}/`,'.btn');
const firstBtn = await p.$('.btn');
const btnBg = () => firstBtn.evaluate(e=>getComputedStyle(e).backgroundColor);
await p.mouse.move(2,2); await p.waitForTimeout(200);
const btnRest = await btnBg();
await firstBtn.hover(); await p.waitForTimeout(500);
const btnHover = await btnBg();
ok('buttons change colour on hover', btnRest!==btnHover, `${btnRest} -> ${btnHover}`);
await p.mouse.move(2,2);

// the mobile menu, which nothing here covered until the panel was found
// opening in a single frame where the original eases it over 0.3s. A check
// that only asserted "the panel is visible after the click" would have passed
// that, so this reads the height mid-slide as well as at the ends.
await p.setViewportSize({width:390,height:780});
await go(`${U}/`,'.toggle');
const panelH = () => p.evaluate(()=>
  Math.round(document.querySelector('#panel-nav').getBoundingClientRect().height));
const linkReachable = () => p.evaluate(()=>{
  const a=document.querySelector('#panel-nav a');
  return !!a && a.checkVisibility({contentVisibilityAuto:true,opacityProperty:true,visibilityProperty:true});
});
ok('mobile menu starts closed', await panelH()===0 && !(await linkReachable()));
// Opening it must not make the page taller. The original's panel is absolutely
// positioned over the content; the port had it in the flow inside the header,
// so opening the menu shoved every page down by the panel's height and left it
// stacked under the sticky CTA bar.
const docH = () => p.evaluate(()=>document.body.scrollHeight);
const docBefore = await docH();
await p.click('.toggle');
await p.waitForTimeout(90);
const mid = await panelH();
await p.waitForTimeout(500);
const open = await panelH();
ok('  burger opens the panel', open>200 && await linkReachable(), `${open}px`);
ok('  and slides rather than snapping', mid>0 && mid<open, `${mid}px at 90ms of ${open}px`);
ok('  opens over the page, not into it', await docH()===docBefore, `${docBefore}px either way`);
await p.click('.toggle');
await p.waitForTimeout(600);
ok('  closes again', await panelH()===0 && !(await linkReachable()));
await p.setViewportSize({width:1440,height:1000});

// before/after slider
await go(`${U}/wraps-before-after/audi-q5-full-colour-change/`,'.compare-pair');
ok('comparison slider enhanced', (await p.$$('.compare-pair[data-juxtapose]')).length>0);
ok('  drag handle present', (await p.$$('.jx-handle')).length>0);

console.log(out.join('\n'));
console.log(`\n${out.filter(x=>x.startsWith('PASS')).length}/${out.length} behaviour checks passed`);
await b.close(); s.close();
