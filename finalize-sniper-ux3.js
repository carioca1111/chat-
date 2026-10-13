'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'gridium-build'));
const file=n=>path.join(root,n);
const read=n=>fs.readFileSync(file(n),'utf8');
const write=(n,s)=>fs.writeFileSync(file(n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('UX3 finalizer: '+m);};

// The legacy Alpha DOM remains only as an inert compatibility sink for old renderer bindings.
// It has no nav entry and is forced out of layout/rendering in the dedicated product.
let html=read('index.html');
if(!html.includes('id="sniper"'))throw new Error('dedicated Sniper section missing');
if(!html.includes('id="opportunities"'))throw new Error('Opportunities section missing');
if(!html.includes('data-section="sniper"'))throw new Error('Sniper nav missing');
html=html.replace(/<section id="alpha" class="([^"]*)"/,'<section id="alpha" aria-hidden="true" class="$1 sniper-legacy-alpha-inert"');
write('index.html',html);

let css=fs.existsSync(file('sniper-dedicated.css'))?read('sniper-dedicated.css'):'';
if(!css.includes('.sniper-legacy-alpha-inert'))css+='\n/* Dedicated product: legacy Alpha DOM exists only for renderer compatibility. */\n.sniper-legacy-alpha-inert{display:none!important;visibility:hidden!important;pointer-events:none!important;contain:strict!important;}\n';
write('sniper-dedicated.css',css);

// Kill every legacy recurring Market inspector cadence. One-click arm primes Market once;
// direct WebSocket events own the hot path afterwards.
let main=read('main.js');
const before=(main.match(/autoInspectionTimer=setInterval\(\(\)=>void autoMarketInspectionTick\(\),\d+\);/g)||[]).length;
main=main.replace(/autoInspectionTimer=setInterval\(\(\)=>void autoMarketInspectionTick\(\),\d+\);/g,'autoInspectionTimer=null;');
if((main.match(/autoInspectionTimer=setInterval\(\(\)=>void autoMarketInspectionTick\(/g)||[]).length)throw new Error('legacy Market inspector timer survived');
write('main.js',main);

const test=`'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
const os=require('os');
const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'..','sniper-dedicated.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','sniper-dedicated.css'),'utf8');
function dedicatedSection(){const a=html.indexOf('<section id="sniper"');const b=html.indexOf('</section>',a);assert.ok(a>=0&&b>a);return html.slice(a,b);}
test('Sniper UX3 opens Accounts and exposes one visible activation button',()=>{
  assert.equal(ui.includes('activateAccounts()'),true);
  assert.equal(ui.includes("confirm('Armar o Gridium Sniper"),false);
  const dedicated=dedicatedSection();
  assert.equal((dedicated.match(/id="sniperArm"/g)||[]).length,1);
  assert.equal(/id="sniperKill"|id="sniperObserve"|id="sniperPrime"|id="sniperSave"|id="sniperLiveArm"/.test(dedicated),false);
  assert.equal(html.includes('data-section="alpha">Alpha Terminal'),false);
  assert.equal(css.includes('.sniper-legacy-alpha-inert'),true);
});
test('direct feed accepts market event arrays and avoids snapshots on every frame',()=>{
  assert.equal(main.includes('function sniperMarketPacket'),true);
  assert.equal(main.includes('Array.isArray(packet)'),true);
  assert.equal(main.includes('sniperRuntime.ingest(fresh,latestMarketProtocol,false)'),true);
  assert.equal(main.includes('fastSniperUiMergeAt'),true);
});
test('sniper purchase no longer depends on full Market CRUD validation',()=>{
  const a=main.indexOf('async function executeSniperBuy('),b=main.indexOf('async function executeLiveBuy(',a),body=main.slice(a,b);
  assert.ok(a>=0&&b>a);
  assert.equal(body.includes('liveValidationReady()'),false);
  assert.equal(body.includes('sendSniperMarketCommand'),true);
  assert.equal(body.includes("['item','pokemon']"),true);
});
test('legacy periodic Market inspector is fully disabled',()=>{
  assert.equal(main.includes('autoInspectionTimer=setInterval(()=>void autoMarketInspectionTick(),'),false);
});
test('feed row reaches WON instead of remaining SENT',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gridium-ux3-'));
  const {SniperRuntime}=require('../sniper-runtime');
  const r=new SniperRuntime({persistenceFile:path.join(dir,'state.json'),onDecision:async()=>({ok:true,outcome:{ok:true,price:5}})});
  r.configure({mode:'AUTO',killSwitch:false,policy:{rules:[{query:'*',assetType:'item',currency:'coins',maxPrice:10,shiny:'any'}]}});
  const listing={slot:0,listingId:'x1',assetType:'item',assetId:'1',name:'Item',currency:'coins',price:5,at:Date.now()};
  assert.equal(r.ingest([listing],null,false),null);
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(r.snapshot().feed[0].status,'WON');
  r.close();fs.rmSync(dir,{recursive:true,force:true});
});
`;
write('test/sniper-ux3.test.js',test);
console.log(`Sniper UX3 finalized; disabled ${before} legacy Market inspector timer(s).`);
