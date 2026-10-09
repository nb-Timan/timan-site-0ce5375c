import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require('@playwright/test');
const out=path.resolve('output/tutorial-v4-6');await mkdir(out,{recursive:true});
const profile=process.env.TIMAN_TUTORIAL_PROFILE||path.join(tmpdir(),'timan-tutorial-playwright-profile');
const edge=process.env.TIMAN_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const context=await chromium.launchPersistentContext(profile,{executablePath:edge,headless:true,viewport:{width:2048,height:1600},deviceScaleFactor:1});
try{
 const page=context.pages()[0]||await context.newPage();
 await page.goto('https://timan-site.lovable.app/portal',{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('heading',{name:'Velkommen til vores Timan site'}).waitFor({timeout:20000});
 const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
 await page.getByRole('link',{name:/^Salg\b/}).click();
 await page.getByText('Byg din Timan',{exact:true}).click();
 const card=page.getByRole('heading',{name:'Timan 3330',exact:true}).locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
 await card.getByRole('button',{name:'+',exact:true}).click();
 await page.getByText('Maskine 1 (Timan 3330)',{exact:true}).waitFor();
 await page.screenshot({path:path.join(out,'tall-machine-probe.png')});
 const result=await page.evaluate(()=>({innerWidth,innerHeight,scrollY,scrollHeight:document.documentElement.scrollHeight,items:[...document.querySelectorAll('button')].filter(x=>/Gå til Leveringsdato/.test(x.textContent||'')).map(x=>({rect:x.getBoundingClientRect().toJSON(),text:x.textContent}))}));
 await writeFile(path.join(out,'tall-machine-probe.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await context.close();}
