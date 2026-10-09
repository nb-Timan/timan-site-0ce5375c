import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const {chromium,expect}=require('@playwright/test');
const out=path.resolve('output/tutorial-v4-6/replacement-frames');await mkdir(out,{recursive:true});
const profile=process.env.TIMAN_TUTORIAL_PROFILE||path.join(tmpdir(),'timan-tutorial-playwright-profile');
const edge=process.env.TIMAN_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const context=await chromium.launchPersistentContext(profile,{executablePath:edge,headless:true,viewport:{width:2048,height:1600},deviceScaleFactor:1});
const audit={viewport:{width:2048,height:1600},frames:48,fps:30,blockedWrites:[],assertions:{},positions:[]};
try{
 await context.route('**/rest/v1/**',async route=>{const r=route.request();if(!['GET','HEAD','OPTIONS'].includes(r.method())&&!r.url().includes('/rpc/')){audit.blockedWrites.push(new URL(r.url()).pathname);await route.abort('blockedbyclient');}else await route.continue();});
 await context.route('**/functions/v1/**',async route=>{const r=route.request();if(/\/(?:send-|submit-|create-order|save-configuration|admin-order)/i.test(new URL(r.url()).pathname)){audit.blockedWrites.push(new URL(r.url()).pathname);await route.abort('blockedbyclient');}else await route.continue();});
 const page=context.pages()[0]||await context.newPage();
 await page.goto('https://timan-site.lovable.app/portal',{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('heading',{name:'Velkommen til vores Timan site'}).waitFor({timeout:20000});
 const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
 await page.getByRole('link',{name:/^Salg\b/}).click();await page.getByText('Byg din Timan',{exact:true}).click();
 const card=name=>page.getByRole('heading',{name,exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
 await card('Timan 3330').getByRole('button',{name:'+',exact:true}).click();
 await card('RC-751 Basismaskine').getByRole('button',{name:'+',exact:true}).click();
 await expect(page.getByText(/Stk\. rabat \(2%\)/).last()).toBeVisible();
 await card('RC-751 Basismaskine').getByRole('button',{name:'-',exact:true}).click();
 await expect(page.getByText(/Maskine 2 \(RC-751/)).toHaveCount(0);
 await expect(page.getByText(/Stk\. rabat \(2%\)/)).toHaveCount(0);
 await expect(page.getByText('Maskine 1 (Timan 3330)',{exact:true})).toBeVisible();
 const button=page.getByRole('button',{name:/Gå til Leveringsdato/});await expect(button).toBeVisible();
 const box=await button.boundingBox();audit.button=box;
 audit.assertions['3330 quantity 1']=await card('Timan 3330').getByText('1',{exact:true}).count()>0;
 audit.assertions['RC-751 removed']=true;audit.assertions['quantity discount removed']=true;
 await page.evaluate(()=>{const s=document.createElement('style');s.textContent='#tutorial-cursor{position:fixed;left:0;top:0;width:24px;height:32px;z-index:2147483646;pointer-events:none;filter:drop-shadow(1px 2px 2px #0009)}';document.head.append(s);const c=document.createElement('div');c.id='tutorial-cursor';c.setAttribute('aria-hidden','true');c.innerHTML='<svg width="24" height="32" viewBox="0 0 24 32"><path d="M2 1L2 25L8 19L13 30L18 28L13 18L22 18Z" fill="white" stroke="#184d30" stroke-width="2"/></svg>';document.body.append(c);window.addEventListener('pointermove',e=>{c.style.left=e.clientX+'px';c.style.top=e.clientY+'px';},true);});
 const from={x:710,y:650},to={x:box.x+box.width/2,y:box.y+box.height/2};
 for(let i=0;i<48;i++){
   if(i<38){const t=Math.max(0,Math.min(1,(i-5)/31)),e=t*t*(3-2*t);await page.mouse.move(from.x+(to.x-from.x)*e,from.y+(to.y-from.y)*e);}
   if(i===38){await page.mouse.click(to.x,to.y);await page.getByRole('heading',{name:/Trin 2:/}).waitFor({timeout:10000});}
   const state=await page.evaluate(()=>({scrollY,scrollHeight:document.documentElement.scrollHeight,innerHeight,step:document.querySelector('main')?.innerText.match(/Trin [12]:/)?.[0]}));audit.positions.push(state);
   await page.screenshot({path:path.join(out,`frame-${String(i+1).padStart(3,'0')}.png`),animations:'disabled'});
 }
 audit.assertions['whole-page scroll 0']=audit.positions.every(x=>x.scrollY===0);
 audit.assertions['delivery step reached']=audit.positions.at(-1).step==='Trin 2:';
 audit.assertions['final send clicked NO']=true;audit.assertions['order submitted NO']=true;audit.assertions['email sent NO']=true;
 await writeFile(path.resolve('output/tutorial-v4-6/replacement-audit.json'),JSON.stringify(audit,null,2));
 console.log(JSON.stringify({button:box,assertions:audit.assertions,first:audit.positions[0],last:audit.positions.at(-1)}));
}finally{await context.close();}
