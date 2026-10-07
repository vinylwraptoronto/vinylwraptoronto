import { chromium } from 'file:///D:/Codex/Repositories/agent-bridge-workspaces/vinylwraptoronto/vinylwraptoronto/node_modules/playwright/index.mjs';
const urls=process.argv.slice(2); const out={};
const b=await chromium.launch();
for(const [w,dpr] of [[390,3],[1440,1],[1440,2]]){
 const c=await b.newContext({viewport:{width:w,height:900},deviceScaleFactor:dpr});
 const p=await c.newPage();
 await p.route(/google|facebook|doubleclick|clarity|analytics|gtag|gtm/,r=>r.abort());
 for(const u of urls){
  await p.goto('http://127.0.0.1:8500/'+u,{waitUntil:'load'});
  await p.evaluate(async()=>{for(const i of document.images){i.loading='eager'};window.scrollTo(0,document.body.scrollHeight);await new Promise(r=>setTimeout(r,800));window.scrollTo(0,0)});
  await p.waitForTimeout(800);
  out[`${u}@${w}x${dpr}`]=await p.evaluate(()=>[...document.querySelectorAll('picture img')].map(i=>{const r=i.getBoundingClientRect(),f=i.closest('figure').getBoundingClientRect();return{src:i.currentSrc.split('/').pop(),nat:i.naturalWidth,fig:+f.width.toFixed(1),img:+r.width.toFixed(1),h:+r.height.toFixed(1),fit:getComputedStyle(i).objectFit,cols:i.closest('figure')?.parentElement&&getComputedStyle(i.closest('figure').parentElement).gridTemplateColumns}}));
 }
 await c.close();
}
await b.close();
import fs from 'fs';fs.writeFileSync('_evidence/img-delivery-20261007/measure-after.json',JSON.stringify(out,null,1));
for(const [k,v] of Object.entries(out)){console.log(k);for(const r of v)console.log(' ',r.src.slice(-26),r.nat,r.fig,r.img,r.h,r.fit,String(r.cols).slice(0,40))}
