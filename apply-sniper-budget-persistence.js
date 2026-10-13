'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(process.argv[2]||path.join(__dirname,'gridium-build'));
const runtimePath=path.join(target,'sniper-runtime.js');
const testPath=path.join(target,'test','sniper-budget-persistence.test.js');
if(!fs.existsSync(runtimePath))throw new Error('sniper-runtime.js nao encontrado');
let text=fs.readFileSync(runtimePath,'utf8');
const loadNeedle="      this.feed=Array.isArray(raw.feed)?raw.feed.slice(-80):[];";
const loadReplacement=loadNeedle+"\n      this.spendTimes=(Array.isArray(raw.spendTimes)?raw.spendTimes:[]).filter(x=>Number(x?.at)>Date.now()-86400000&&['coins','gems'].includes(String(x?.currency))&&Number(x?.amount)>0).map(x=>({at:Number(x.at),currency:String(x.currency),amount:Number(x.amount)}));";
if(!text.includes('raw.spendTimes')){
  if(!text.includes(loadNeedle))throw new Error('Marcador load spendTimes nao encontrado');
  text=text.replace(loadNeedle,loadReplacement);
}
const saveNeedle="JSON.stringify({policy:this.policy,metrics:{...this.metrics,decisionMs:undefined,eventAgeMs:undefined},feed:this.feed.slice(-80)},null,2)";
const saveReplacement="JSON.stringify({policy:this.policy,metrics:{...this.metrics,decisionMs:undefined,eventAgeMs:undefined},feed:this.feed.slice(-80),spendTimes:this.spendTimes.filter(x=>Number(x.at)>Date.now()-86400000).slice(-1000)},null,2)";
if(!text.includes('spendTimes:this.spendTimes.filter')){
  if(!text.includes(saveNeedle))throw new Error('Marcador save spendTimes nao encontrado');
  text=text.replace(saveNeedle,saveReplacement);
}
fs.writeFileSync(runtimePath,text);
fs.mkdirSync(path.dirname(testPath),{recursive:true});
fs.writeFileSync(testPath,`'use strict';\nconst test=require('node:test');\nconst assert=require('node:assert/strict');\nconst fs=require('fs');\nconst os=require('os');\nconst path=require('path');\nconst {SniperRuntime}=require('../sniper-runtime');\ntest('rolling spend budgets survive restart while AUTO always restarts safe',()=>{\n const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridium-sniper-'));const file=path.join(dir,'state.json');\n const a=new SniperRuntime({persistenceFile:file});a.spendTimes=[{at:Date.now(),currency:'coins',amount:450}];a.configure({mode:'AUTO',killSwitch:false,policy:{hourlyBudgetCoins:500,dailyBudgetCoins:1000,rules:[{query:'*',assetType:'pokemon',currency:'coins',maxPrice:100,shiny:'any'}]}});a.save();\n const b=new SniperRuntime({persistenceFile:file});assert.equal(b.mode,'OFF');assert.equal(b.killSwitch,true);assert.equal(b.spendTimes.length,1);assert.equal(b._budget('coins',3600000),450);assert.equal(b._canAttempt({slot:0,assetType:'pokemon',assetId:'25',currency:'coins',price:60}).ok,false);assert.equal(b._canAttempt({slot:0,assetType:'pokemon',assetId:'25',currency:'coins',price:60}).reason,'kill-switch');\n b.configure({mode:'AUTO',killSwitch:false});assert.equal(b._canAttempt({slot:0,assetType:'pokemon',assetId:'25',currency:'coins',price:60}).reason,'hourly-budget');b.close();fs.rmSync(dir,{recursive:true,force:true});\n});\n`);
console.log('Sniper rolling budget persistence applied.');
