'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(process.argv[2]||'gridium-build');
const here=__dirname;
function read(name){return fs.readFileSync(path.join(target,name),'utf8');}
function write(name,text){fs.writeFileSync(path.join(target,name),text,'utf8');}
function mustReplace(text,from,to,label){
  if(!text.includes(from))throw new Error(`Alpha 3 patch: trecho não encontrado em ${label}`);
  return text.replace(from,to);
}
for(const name of ['package.json','preload.js','network-inspector.js']){
  fs.copyFileSync(path.join(here,name),path.join(target,name));
}
fs.mkdirSync(path.join(target,'test'),{recursive:true});
fs.copyFileSync(path.join(here,'test','network-inspector.test.js'),path.join(target,'test','network-inspector.test.js'));

let main=read('main.js');
main=mustReplace(main,"const {MARKET_DISCOVERY_SCRIPT,normalizeListings}=require('./market-inspector');\n","const {MARKET_DISCOVERY_SCRIPT,normalizeListings}=require('./market-inspector');\nconst {NetworkInspector}=require('./network-inspector');\n",'main.js import');
main=mustReplace(main,'const huntEngine=new HuntEngine();\n','const huntEngine=new HuntEngine();\nconst networkInspector=new NetworkInspector();\n','main.js instance');
main=mustReplace(main,"    for(const [slot,wc] of guests){if(wc.isDestroyed())continue;try{const scan=await wc.executeJavaScript(MARKET_DISCOVERY_SCRIPT);scans.push({slot,...scan});for(const l of normalizeListings(scan,slot)){alphaEngine.recordMarket(l);listings.push(l);}}catch(error){scans.push({slot,error:String(error?.message||error)});}}\n    alphaEngine.audit('market-scan','Market Inspector executou varredura somente leitura',null,{accounts:scans.length,listings:listings.length});return {scans,listings,alpha:alphaEngine.view()};\n  });\n","    for(const [slot,wc] of guests){if(wc.isDestroyed())continue;try{const scan=await wc.executeJavaScript(MARKET_DISCOVERY_SCRIPT);const network=networkInspector.recent(slot,{sinceMs:15*60*1000,limit:500,marketOnly:false});const marketNetwork=networkInspector.recent(slot,{sinceMs:15*60*1000,limit:300,marketOnly:true});network.marketRequests=marketNetwork.requests;scans.push({slot,...scan,network});for(const l of normalizeListings(scan,slot)){alphaEngine.recordMarket(l);listings.push(l);}}catch(error){const network=networkInspector.recent(slot,{sinceMs:15*60*1000,limit:500,marketOnly:false});const marketNetwork=networkInspector.recent(slot,{sinceMs:15*60*1000,limit:300,marketOnly:true});network.marketRequests=marketNetwork.requests;scans.push({slot,error:String(error?.message||error),network});}}\n    const requestCount=scans.reduce((n,x)=>n+(x.network?.requests?.length||0),0);\n    const marketRequestCount=scans.reduce((n,x)=>n+(x.network?.marketRequests?.length||0),0);\n    alphaEngine.audit('market-scan','Market Inspector executou varredura somente leitura com captura HTTP/WebSocket',null,{accounts:scans.length,listings:listings.length,requests:requestCount,marketRequests:marketRequestCount});return {scans,listings,alpha:alphaEngine.view()};\n  });\n  handler('grid:market-network-clear',()=>{networkInspector.clear();return true;});\n",'main.js market scan');
main=mustReplace(main,"if(slot===undefined)return;guests.set(slot,wc);wc.setBackgroundThrottling(!settings.background);","if(slot===undefined)return;guests.set(slot,wc);networkInspector.attach(slot,wc);wc.setBackgroundThrottling(!settings.background);",'main.js attach');
main=mustReplace(main,"wc.on('destroyed',()=>{if(guests.get(slot)===wc){guests.delete(slot);stats.unavailable(slot,'Painel fechado');}});","wc.on('destroyed',()=>{networkInspector.detach(slot);if(guests.get(slot)===wc){guests.delete(slot);stats.unavailable(slot,'Painel fechado');}});",'main.js destroyed');
main=mustReplace(main,"if(stats){persist();persistHistory(true);}if(alphaEngine)","if(stats){persist();persistHistory(true);}networkInspector.close();if(alphaEngine)",'main.js quit');
write('main.js',main);

let renderer=read('renderer.js');
const oldMarket=renderer.match(/^\$\('marketScan'\)\.onclick=.*$/m);
if(!oldMarket)throw new Error('Alpha 3 patch: handler marketScan não encontrado em renderer.js');
const mapReq="r=>({hora:new Date(r.at).toLocaleTimeString('pt-BR'),tipo:r.type,metodo:r.method,url:r.url,status:r.status,postData:r.postData,erro:r.error||null})";
const newMarket="$('marketScan').onclick=()=>action(async()=>{notify('Market Inspector em modo somente leitura…');const result=await window.gridAPI.marketScan();if(result?.alpha){alphaState={...result.alpha,audit:alphaState?.audit||[]};renderAlpha(alphaState);}const summary=(result?.scans||[]).map(x=>({conta:x.slot+1,marketVisivel:!!x.marketVisible,blocos:(x.blocks||[]).length,recursos:(x.resources||[]).slice(0,30),globais:(x.globals||[]).slice(0,30),capturaRedeAtiva:!!x.network?.attached,requestsRelevantes:(x.network?.marketRequests||[]).slice(-120).map("+mapReq+"),requestsRecentes:(x.network?.requests||[]).slice(-40).map("+mapReq+"),erro:x.error||x.network?.error||null}));$('marketScanOutput').textContent=JSON.stringify({listagensNormalizadas:(result?.listings||[]).length,contas:summary},null,2);notify(`Market Inspector concluído: ${(result?.listings||[]).length} candidatos normalizados.`);void refreshAlpha(true);return result;});";
renderer=renderer.replace(oldMarket[0],newMarket);
renderer += "\nconst copyMarketScan=$('copyMarketScan');if(copyMarketScan)copyMarketScan.onclick=async()=>{const text=$('marketScanOutput')?.textContent||'';if(!text.trim()){notify('Nada no Inspector para copiar.');return;}try{await navigator.clipboard.writeText(text);notify('Resultado do Market Inspector copiado.');}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();notify('Resultado do Market Inspector copiado.');}};\n";
write('renderer.js',renderer);

let html=read('index.html');
html=mustReplace(html,'src="assets/gridium-icon.svg"','src="assets/gridium-icon.png"','index logo');
html=mustReplace(html,'<section class="module-card"><h3>Market Inspector · diagnóstico somente leitura</h3><pre id="marketScanOutput" class="diagnostic">Ainda não executado. Abra o Market em uma conta e clique em “Market Inspector”.</pre></section>','<section class="module-card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h3>Market Inspector · diagnóstico somente leitura + HTTP/WebSocket</h3><button id="copyMarketScan" type="button">📋 Copiar resultado</button></div><pre id="marketScanOutput" class="diagnostic">Ainda não executado. A captura é passiva e somente leitura. Abra o Market, navegue normalmente e clique em “Market Inspector”.</pre></section>','index inspector copy');
write('index.html',html);

const pkg=JSON.parse(read('package.json'));
if(pkg.version!=='3.0.0-alpha.3')throw new Error('Alpha 3 patch: versão final incorreta');
console.log('Gridium Alpha 3 patch aplicado com sucesso.');
