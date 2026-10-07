import { chromium } from 'file:///D:/Codex/Repositories/agent-bridge-workspaces/vinylwraptoronto/vinylwraptoronto/node_modules/playwright/index.mjs';
import AxeBuilder from 'file:///D:/Codex/Repositories/agent-bridge-workspaces/vinylwraptoronto/vinylwraptoronto/node_modules/@axe-core/playwright/dist/index.mjs';
const b=await chromium.launch();
for(const [n,w,h,d] of [['mobile',390,844,3],['desktop',1440,900,1]]){
 const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:d}); const p=await c.newPage();
 const blocked=[]; await p.route(/google|facebook|doubleclick|clarity|analytics|gtag|gtm|recaptcha|hcaptcha|turnstile/,r=>{blocked.push(new URL(r.request().url()).host);r.abort()});
 for(const u of ['','van-wraps/']){
  await p.goto('http://127.0.0.1:8500/'+u,{waitUntil:'load'});
  await p.evaluate(()=>{for(const i of document.images)i.loading='eager'}); await p.waitForTimeout(1200);
  const info=await p.evaluate(()=>({canon:document.querySelector('link[rel=canonical]')?.href,robots:document.querySelector('meta[name=robots]')?.content,forms:document.forms.length,broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).length}));
  const ax=await new AxeBuilder({page:p}).analyze();
  console.log(n,u||'/',JSON.stringify(info),'axe violations',ax.violations.map(v=>v.id+':'+v.nodes.length).join(',')||0);
  const g=await p.$('figure:has(picture)'); if(g){await g.scrollIntoViewIfNeeded();await p.waitForTimeout(500);await p.screenshot({path:`_evidence/img-delivery-20261007/${n}-${u?'van':'home'}.png`})}
 }
 console.log(n,'blocked hosts',[...new Set(blocked)].join(',')||'none');await c.close();
}
await b.close();
