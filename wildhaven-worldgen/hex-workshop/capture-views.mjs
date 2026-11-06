// True render captures from Three.js/WebGL; never illustrated stand-ins.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const here=new URL('.', import.meta.url).pathname;
const destination=resolve(here,'../hex-scenes/H_5_7/inspection');
await mkdir(destination,{recursive:true});
const browser=await chromium.launch({
 headless:true,
 args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
       '--enable-unsafe-swiftshader'],
});
const data={kind:'REAL_WEBGL_CAPTURE',headless_software_renderer:true,views:[]};
try {
 for(const view of ['overview','river','cliffs','camp']){
  const page=await browser.newPage({viewport:{width:2120,height:1200},deviceScaleFactor:1});
  const browserErrors=[];
  page.on('pageerror', e=>browserErrors.push(String(e)));
  await page.goto('http://127.0.0.1:4173/?view='+view,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>{
   const state=document.getElementById('scene-loading');
   return state && state.style.display==='none';
  },{timeout:120000});
  await page.waitForTimeout(750);
  const filename=view+'.png';
  const target=page.locator('#three-view canvas');
  // Do not wait for a continuously animated WebGL canvas to become "stable".
  // Capture the visible canvas rectangle using page screenshot and a generous
  // software-WebGL timeout: Playwright's element-screenshot default (~5s)
  // can fail on CI even though the geometry and renderer are healthy.
  const rect=await target.boundingBox();
  if(!rect||rect.width<800||rect.height<350)throw new Error('3D viewport invalid: '+JSON.stringify(rect));
  await page.screenshot({
    path:resolve(destination,filename),
    clip:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
    animations:'disabled',timeout:120000,
  });
  const metrics=await page.evaluate(()=>window.__wildhavenInspect?.()||{});
  data.views.push({view,image:filename,...metrics,browserErrors});
  if(browserErrors.length)throw new Error(view+': '+browserErrors.join(' | '));
  await page.close();
 }
 await writeFile(resolve(destination,'capture-metrics.json'),JSON.stringify(data,null,2)+'\n');
 console.log(JSON.stringify(data,null,2));
} finally {
 await browser.close();
}
