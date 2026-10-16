'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.8.5 Click Freeze Hotfix: '+m);};
function replaceOnce(text,from,to,label){const first=text.indexOf(from);must(first>=0,label+' anchor missing');must(text.indexOf(from,first+from.length)<0,label+' anchor is not unique');return text.slice(0,first)+to+text.slice(first+from.length);}
function functionBounds(text,name){const token='function '+name+'(';const start=text.indexOf(token);must(start>=0,name+' missing');must(text.indexOf(token,start+token.length)<0,name+' duplicated');const brace=text.indexOf('{',start);let depth=0,q='',esc=false,line=false,block=false;for(let i=brace;i<text.length;i++){const c=text[i],n=text[i+1];if(line){if(c==='\n')line=false;continue;}if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}if(q){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===q)q='';continue;}if(c==='/'&&n==='/'){line=true;i++;continue;}if(c==='/'&&n==='*'){block=true;i++;continue;}if(c==='"'||c==="'"||c==='`'){q=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return {start,end:i+1};}throw new Error(name+' closing brace missing');}
function replaceFunction(text,name,replacement){const b=functionBounds(text,name);return text.slice(0,b.start)+replacement+text.slice(b.end);}
const BASE_VERSION='3.0.0-alpha.11.8.4',NEXT_VERSION='3.0.0-alpha.11.8.5';
const pkg=JSON.parse(read('package.json'));must(pkg.version===BASE_VERSION,'exact Alpha 11.8.4 base expected, current '+pkg.version);
let main=read('main.js');
must(main.includes('performanceCssKeys'),'performance CSS cache missing from 11.8.4 base');
main=replaceOnce(main,'function performancePlan(slot){',"const performanceApplied=new Map(),performanceApplyQueues=Array.from({length:4},()=>Promise.resolve());\nlet performanceApplyTimer=null;\nfunction performancePlan(slot){",'performance hotfix state');
main=replaceFunction(main,'performancePlan',`function performancePlan(slot){
  const profile=settings.performanceProfile||'balanced',visible=performanceView.section==='games'&&performanceView.visibleSlots.includes(Number(slot)),focused=visible&&Number(performanceView.focusedSlot)===Number(slot),layout=performanceView.layout||'grid';
  // In the 2x2 workspace a click only changes the selection. A stable four-guest plan
  // prevents Chromium from rebuilding frame pacing while the user is interacting.
  if(layout==='grid'){
    if(settings.liveEcoMode)return {fps:visible?12:3,reduceVisuals:!visible,sampleMs:visible?10000:15000,visible,focused};
    if(profile==='quality')return {fps:60,reduceVisuals:false,sampleMs:5000,visible,focused};
    if(profile==='ultra')return {fps:visible?30:6,reduceVisuals:!visible,sampleMs:visible?10000:15000,visible,focused};
    return {fps:visible?30:15,reduceVisuals:!visible,sampleMs:visible?5000:10000,visible,focused};
  }
  if(settings.liveEcoMode){const cap=focused?(layout==='focus'?30:20):(visible?8:3);return {fps:cap,reduceVisuals:!focused,sampleMs:focused?5000:(visible?10000:15000),visible,focused};}
  if(profile==='quality')return {fps:60,reduceVisuals:false,sampleMs:5000,visible,focused};
  if(profile==='ultra')return {fps:focused?60:(visible?20:6),reduceVisuals:!focused,sampleMs:focused?5000:(visible?10000:15000),visible,focused};
  return {fps:focused?60:(visible?30:15),reduceVisuals:!focused&&!visible,sampleMs:visible?5000:10000,visible,focused};
}`);
main=replaceFunction(main,'applyGuestPerformance',`async function applyGuestPerformance(slot,wc,force=false){
  if(!wc||wc.isDestroyed()){performanceApplied.delete(slot);performanceCssKeys.delete(slot);return;}
  const plan=performancePlan(slot),next={wcId:Number(wc.id)||0,fps:plan.fps,reduceVisuals:!!plan.reduceVisuals,backgroundThrottling:settings.liveEcoMode?false:!settings.background,mute:!!settings.mute,zoom:settings.zoom[slot]||1},prev=performanceApplied.get(slot),sameGuestPerformance=(a,b)=>!!a&&a.wcId===b.wcId&&a.fps===b.fps&&a.reduceVisuals===b.reduceVisuals&&a.backgroundThrottling===b.backgroundThrottling&&a.mute===b.mute&&a.zoom===b.zoom;
  if(!force&&sameGuestPerformance(prev,next))return;
  if(force||!prev||prev.wcId!==next.wcId||prev.backgroundThrottling!==next.backgroundThrottling)try{wc.setBackgroundThrottling(next.backgroundThrottling);}catch{}
  if(force||!prev||prev.wcId!==next.wcId||prev.mute!==next.mute)try{wc.setAudioMuted(next.mute);}catch{}
  if((force||!prev||prev.wcId!==next.wcId||prev.fps!==next.fps)&&typeof wc.setFrameRate==='function')try{wc.setFrameRate(next.fps);}catch{}
  if(force||!prev||prev.wcId!==next.wcId||prev.reduceVisuals!==next.reduceVisuals){
    const previous=performanceCssKeys.get(slot);if(previous&&typeof wc.removeInsertedCSS==='function')try{await wc.removeInsertedCSS(previous);}catch{}performanceCssKeys.delete(slot);
    const css=performanceCSS(plan);if(css&&typeof wc.insertCSS==='function')try{const key=await wc.insertCSS(css,{cssOrigin:'user'});if(key)performanceCssKeys.set(slot,key);}catch{}
  }
  if((force||!prev||prev.wcId!==next.wcId||prev.zoom!==next.zoom)&&typeof wc.setZoomFactor==='function')try{wc.setZoomFactor(next.zoom);}catch{}
  performanceApplied.set(slot,next);
}`);
main=replaceOnce(main,'function applySettings(){',`function queueGuestPerformance(slot,wc,force=false){
  const i=Math.max(0,Math.min(3,Math.trunc(Number(slot)||0))),previous=performanceApplyQueues[i]||Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>applyGuestPerformance(i,wc,force)).catch(()=>{});performanceApplyQueues[i]=next;return next;
}
function scheduleGuestPerformance(delay=120){
  if(performanceApplyTimer!==null)clearTimeout(performanceApplyTimer);
  performanceApplyTimer=setTimeout(()=>{performanceApplyTimer=null;for(const [slot,wc] of guests)void queueGuestPerformance(slot,wc);},Math.max(50,Number(delay)||120));
}
function applySettings(){`,'performance scheduler');
main=replaceFunction(main,'applySettings',`function applySettings(){
  if(powerId!==null){powerSaveBlocker.stop(powerId);powerId=null;}
  if(settings.power!=='off')powerId=powerSaveBlocker.start(settings.power==='display'?'prevent-display-sleep':'prevent-app-suspension');
  networkInspector.configure?.(settings.performanceProfile);
  for(const [slot,wc] of guests)void queueGuestPerformance(slot,wc);
}`);
main=replaceOnce(main,'performanceView={section,layout,focusedSlot,visibleSlots};for(const [slot,wc] of guests)void applyGuestPerformance(slot,wc);','performanceView={section,layout,focusedSlot,visibleSlots};scheduleGuestPerformance();','focus IPC defer');
write('main.js',main);
fs.mkdirSync(path.join(root,'test'),{recursive:true});fs.copyFileSync(path.join(__dirname,'alpha1185-src/test/click-freeze-hotfix.test.js'),path.join(root,'test/click-freeze-hotfix.test.js'));
let versionChecksUpdated=0;for(const name of fs.readdirSync(path.join(root,'test'))){if(!name.endsWith('.test.js'))continue;const file=path.join(root,'test',name),source=fs.readFileSync(file,'utf8');if(!source.includes(BASE_VERSION))continue;versionChecksUpdated+=source.split(BASE_VERSION).length-1;fs.writeFileSync(file,source.split(BASE_VERSION).join(NEXT_VERSION));}
pkg.version=NEXT_VERSION;pkg.description='Gridium Alpha 11.8.5 — Hotfix de resposta ao clique e estabilidade dos webviews';write('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log(`Alpha 11.8.5 click-freeze hotfix applied; focus work deferred/cached; ${versionChecksUpdated} inherited release marker(s) synchronized.`);
