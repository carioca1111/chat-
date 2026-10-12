'use strict';
const fs=require('fs');
const path=require('path');
const root=process.argv[2]?path.resolve(process.argv[2]):process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(f,s)=>fs.writeFileSync(path.join(root,f),s);
const must=(c,m)=>{if(!c)throw new Error('Alpha 8.6: '+m);};

const pkgPath=path.join(root,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='3.0.0-alpha.8.6';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
html=html.replace(/<p>Alpha 8\.5:[^<]*<\/p>/,"<p>Alpha 8.6: automático em 1 clique · aprende o request de vendedores direto do cliente oficial do Market.</p>");
write('index.html',html);

function deriveClientReadCandidatesV86(hints={},detail=[]){
  const targetText=[...(hints.targetSnippets||[]),...(hints.listarSnippets||[])].join('\n');
  const types=[];for(const x of [...(hints.targetCommands||[]),...(hints.commandTypes||[])]){const t=String(x||'');if(!/^market\./i.test(t)||/(comprar|criar|editar|cancelar|vender|buy|sell|create|edit|cancel)/i.test(t))continue;if(!types.includes(t))types.push(t);}
  const targetTypes=[];for(const m of targetText.matchAll(/market\.[a-z0-9_.-]+/gi)){const t=m[0];if(!/(comprar|criar|editar|cancelar|vender|buy|sell|create|edit|cancel)/i.test(t)&&!targetTypes.includes(t))targetTypes.push(t);}
  let chosen=targetTypes.filter(t=>!/^market\.(itens|especies|favoritos?|meus?)$/i.test(t));
  if(!chosen.length&&types.includes('market.listar'))chosen=['market.listar'];
  if(!chosen.length)chosen=types.filter(t=>/listar|anunc|ofert|vitrine|item/i.test(t)&&!/^market\.itens$/i.test(t)).slice(0,3);
  const out=[],seen=new Set();
  for(const d of detail.slice(0,80)){
    const id=Number(d?.elemento);if(!Number.isSafeInteger(id)||id<=0)continue;
    for(const t of chosen.slice(0,3)){
      const bases=[
        {t,tipo:'item',itemId:id,pagina:1},
        {t,tipo:'item',itemId:id,moeda:'gold',pagina:1},
        {t,tipo:'item',itemId:id,moeda:'orb',pagina:1}
      ];
      for(const cmd of bases){if(/categoria/i.test(targetText))cmd.categoria=String(d.categoria||'').slice(0,80);if(/busca/i.test(targetText))cmd.busca='';const k=JSON.stringify(cmd);if(!seen.has(k)){seen.add(k);out.push(cmd);}}
    }
  }
  return out.slice(0,500);
}

async function collectMarketSourceHintsV86(slot,wc){
  const h=marketBridgeHealth[slot];if(!h||!wc||wc.isDestroyed())return null;
  if(h.sourceHints&&Date.now()-Number(h.sourceHintAt||0)<10*60*1000)return h.sourceHints;
  const source=`(async()=>{try{
    const urls=[...new Set(performance.getEntriesByType('resource').map(e=>String(e.name||'')).filter(u=>/\\.js(?:[?#]|$)/i.test(u)))].slice(0,64);
    const needles=['pedirAnunciosItem','market.listar','market.itens','market.especies','market.comprar'],hits=[],commandTypes=[],targetSnippets=[],listarSnippets=[];
    const addType=t=>{t=String(t||'');if(t&&!commandTypes.includes(t))commandTypes.push(t)};
    for(const url of urls){try{
      const txt=await fetch(url,{credentials:'same-origin',cache:'force-cache'}).then(r=>r.ok?r.text():'');if(!txt)continue;
      for(const m of txt.matchAll(/[\"'](market\\.[A-Za-z0-9_.-]+)[\"']/g))addType(m[1]);
      const low=txt.toLowerCase();
      for(const needle of needles){let from=0,count=0;while(count<6){const i=low.indexOf(needle.toLowerCase(),from);if(i<0)break;const a=Math.max(0,i-1400),b=Math.min(txt.length,i+2600),raw=txt.slice(a,b);hits.push({url:url.slice(0,240),needle,snippet:raw.replace(/\\s+/g,' ').slice(0,3800)});if(needle==='pedirAnunciosItem')targetSnippets.push(raw.slice(0,5000));if(needle==='market.listar')listarSnippets.push(raw.slice(0,5000));from=i+needle.length;count++;}}
    }catch{}}
    const targetCommands=[];for(const s of targetSnippets){for(const m of s.matchAll(/market\\.[A-Za-z0-9_.-]+/g)){if(!targetCommands.includes(m[0]))targetCommands.push(m[0]);}}
    let globalFunction=false,functionSource='';try{const fn=window.pedirAnunciosItem;globalFunction=typeof fn==='function';if(globalFunction)functionSource=String(fn).slice(0,8000);}catch{}
    return {ok:true,scriptCount:urls.length,hits:hits.slice(0,24),commandTypes:commandTypes.slice(0,80),targetCommands:targetCommands.slice(0,30),targetSnippets:targetSnippets.slice(0,6).map(x=>x.replace(/\\s+/g,' ').slice(0,5000)),listarSnippets:listarSnippets.slice(0,4).map(x=>x.replace(/\\s+/g,' ').slice(0,5000)),globalFunction,functionSource:functionSource.replace(/\\s+/g,' ').slice(0,8000)};
  }catch(e){return {ok:false,error:String(e&&e.message||e)}}})()`;
  try{const result=await wc.executeJavaScript(source,true);h.sourceHintAt=Date.now();h.sourceHints=result||null;return h.sourceHints;}catch(error){h.sourceHintAt=Date.now();h.sourceHints={ok:false,error:String(error?.message||error)};return h.sourceHints;}
}

async function sendPassiveMarketProbeV86(slot){
  const wc=guests.get(slot),h=marketBridgeHealth[slot];if(!wc||wc.isDestroyed()||!h)return {ok:false,reason:'conta-indisponivel'};
  const recent=networkInspector.recent(slot,{sinceMs:10*60*1000,limit:3000,marketOnly:true});learnMarketReadTemplates(slot,recent.requests);
  await installMarketBridge(slot,wc);await marketBridgeState(slot,wc);h.lastProbeAt=Date.now();
  if(!h.socketReady){h.lastProbeOk=false;h.lastProbeError='WebSocket do jogo ainda não foi capturado';return {ok:false,reason:'socket-unavailable'};}
  const detail=deriveMarketDetailCandidates(recent.requests),rows=[...marketReadTemplates[slot].values()];
  let hints=h.sourceHints;if(!hints||Date.now()-Number(h.sourceHintAt||0)>10*60*1000){try{hints=await collectMarketSourceHints(slot,wc);}catch{}}
  const client=deriveClientReadCandidates(hints||{},detail);
  if(!rows.length&&!detail.length&&!client.length){h.lastProbeOk=false;h.lastProbeError='Nenhum comando de leitura seguro aprendido';return {ok:false,reason:'no-read-template'};}
  let cmd,kind='summary';
  if(client.length&&h.clientCursor%3!==2){cmd=client[h.clientCursor%client.length];h.clientCursor++;h.clientAttempts++;h.lastClientCommand=String(cmd.t||'');h.lastClientAsset=String(cmd.itemId??'');kind='client-list';}
  else if(detail.length&&h.detailCursor%4!==3){cmd=detail[h.detailCursor%detail.length];h.detailCursor++;h.detailAttempts++;h.lastDetailAsset=String(cmd.elemento??'');h.lastDetailCategory=String(cmd.categoria||'');h.lastDetailType=typeof cmd.elemento;kind='detail';if(client.length)h.clientCursor++;}
  else{cmd=rows[h.templateCursor%Math.max(1,rows.length)]||{t:'market.itens',elemento:'',categoria:'stone'};h.templateCursor=(h.templateCursor+1)%Math.max(1,rows.length);if(detail.length)h.detailCursor++;if(client.length)h.clientCursor++;}
  const safe=safeMarketReadCommand(cmd);if(!safe){h.lastProbeOk=false;h.lastProbeError='Probe de leitura rejeitado pela lista segura';return {ok:false,reason:'unsafe-read-probe'};}
  const encoded=JSON.stringify(safe);try{const result=await wc.executeJavaScript(`window.__gridiumMarketSend?window.__gridiumMarketSend(${encoded}):({ok:false,reason:'bridge-missing'})`,true);h.lastProbeOk=result?.ok===true;h.lastProbeError=h.lastProbeOk?null:String(result?.reason||'probe-failed');if(h.lastProbeOk)h.lastMarketTxAt=Date.now();return {...result,command:safe,kind,detailCandidates:detail.length,clientCandidates:client.length,clientTypes:hints?.targetCommands||[]};}catch(error){h.lastProbeOk=false;h.lastProbeError=String(error?.message||error);return {ok:false,reason:h.lastProbeError};}
}

let main=read('main.js');
main=main.replace("sourceHints:null}))","sourceHints:null,clientCursor:0,clientAttempts:0,lastClientCommand:'',lastClientAsset:''}))");
must(main.includes("clientAttempts:0"),'estado de descoberta do cliente não inserido');
const derivePos=main.indexOf('function deriveMarketDetailCandidates');
const collectPos=main.indexOf('async function collectMarketSourceHints',derivePos);
must(derivePos>=0&&collectPos>derivePos,'ponto derive/collect não encontrado');
main=main.slice(0,collectPos)+deriveClientReadCandidatesV86.toString().replace('deriveClientReadCandidatesV86','deriveClientReadCandidates')+'\n\n'+main.slice(collectPos);
const collectStart=main.indexOf('async function collectMarketSourceHints(');
const collectEnd=main.indexOf('async function installMarketBridge',collectStart);
must(collectStart>=0&&collectEnd>collectStart,'collectMarketSourceHints não encontrado');
main=main.slice(0,collectStart)+collectMarketSourceHintsV86.toString().replace('collectMarketSourceHintsV86','collectMarketSourceHints')+'\n'+main.slice(collectEnd);
const probeStart=main.indexOf('async function sendPassiveMarketProbe(');
const probeEnd=main.indexOf('function mergeNetworkRows',probeStart);
must(probeStart>=0&&probeEnd>probeStart,'sendPassiveMarketProbe não encontrado');
main=main.slice(0,probeStart)+sendPassiveMarketProbeV86.toString().replace('sendPassiveMarketProbeV86','sendPassiveMarketProbe')+'\n'+main.slice(probeEnd);
const statusOld="detailProbeKind:probeResult?.kind||'',detailCandidates:Number(probeResult?.detailCandidates)||0,health};";
const statusNew="detailProbeKind:probeResult?.kind||'',detailCandidates:Number(probeResult?.detailCandidates)||0,clientProbeAttempts:marketBridgeHealth.reduce((n,h)=>n+(Number(h.clientAttempts)||0),0),lastClientCommand:probeResult?.kind==='client-list'?String(probeResult?.command?.t||''):String(marketBridgeHealth.find(h=>h.lastClientCommand)?.lastClientCommand||''),lastClientAsset:probeResult?.kind==='client-list'?String(probeResult?.command?.itemId??''):String(marketBridgeHealth.find(h=>h.lastClientAsset)?.lastClientAsset||''),clientCandidates:Number(probeResult?.clientCandidates)||0,clientTypes:probeResult?.clientTypes||[],health};";
must(main.includes(statusOld),'status 8.5 não encontrado');
main=main.replace(statusOld,statusNew);
write('main.js',main);

let protocol=read('market-protocol.js');
const oldClause="if(['vitrine','itens'].includes(p.aba)&&Array.isArray(p.linhas)){let found=0;for(const row of p.linhas){const n=normalizeListing(row,slot,Number(e.at)||Date.now());if(n){listings.push(n);found++;}}if(found>0)validation.marketListingsMapped=true;}";
const newClause="{const arrays=[];for(const key of ['linhas','anuncios','lista','ofertas'])if(Array.isArray(p[key]))arrays.push(...p[key]);if(!['meus','especies'].includes(String(p.aba||''))&&arrays.length){let found=0;for(const row of arrays){const real=row&&row.id!=null&&Number(row.preco)>0&&['gold','orb'].includes(String(row.moeda||'').toLowerCase())&&(row.itemId!=null||row.pokemonId!=null||row.ficha||row.tipo);if(!real)continue;const n=normalizeListing(row,slot,Number(e.at)||Date.now());if(n&&n.listingId){listings.push(n);found++;}}if(found>0)validation.marketListingsMapped=true;}}";
must(protocol.includes(oldClause),'parser de listagens 8.5 não encontrado');
protocol=protocol.replace(oldClause,newClause);
write('market-protocol.js',protocol);

let renderer=read('renderer.js');
renderer=renderer.replace(/Gridium 3\.0 Alpha 8\.5/g,'Gridium 3.0 Alpha 8.6');
const autoOld="+'Sondagens detalhadas: '+Number(s.detailProbeAttempts||0)+(s.lastDetailAsset?' · último item '+String(s.lastDetailAsset)+(s.lastDetailType?' ('+String(s.lastDetailType)+')':''):'')+nl+'Anúncios detalhados WS: '";
const autoNew="+'Sondagens detalhadas: '+Number(s.detailProbeAttempts||0)+(s.lastDetailAsset?' · último item '+String(s.lastDetailAsset)+(s.lastDetailType?' ('+String(s.lastDetailType)+')':''):'')+nl+'Sondagens do cliente: '+Number(s.clientProbeAttempts||0)+(s.lastClientCommand?' · '+String(s.lastClientCommand)+(s.lastClientAsset?' item '+String(s.lastClientAsset):''):'')+nl+'Anúncios detalhados WS: '";
must(renderer.includes(autoOld),'linha de status detalhado não encontrada');
renderer=renderer.replace(autoOld,autoNew);
const diagOld="autoDescoberta:(result?.scans||[]).map(x=>({conta:x.slot+1,scriptCount:x.sourceHints?.scriptCount||0,hits:(x.sourceHints?.hits||[]).slice(0,8)}))";
const diagNew="autoDescoberta:(result?.scans||[]).map(x=>({conta:x.slot+1,scriptCount:x.sourceHints?.scriptCount||0,commandTypes:(x.sourceHints?.commandTypes||[]).slice(0,80),targetCommands:(x.sourceHints?.targetCommands||[]).slice(0,30),targetSnippets:(x.sourceHints?.targetSnippets||[]).slice(0,4),listarSnippets:(x.sourceHints?.listarSnippets||[]).slice(0,3),globalFunction:x.sourceHints?.globalFunction===true,functionSource:String(x.sourceHints?.functionSource||'').slice(0,8000),hits:(x.sourceHints?.hits||[]).slice(0,12)}))";
must(renderer.includes(diagOld),'autoDescoberta 8.5 não encontrada');
renderer=renderer.replace(diagOld,diagNew);
write('renderer.js',renderer);

const testDir=path.join(root,'test');fs.mkdirSync(testDir,{recursive:true});
fs.writeFileSync(path.join(testDir,'alpha86-client-list.test.js'),`'use strict';\nconst test=require('node:test');const assert=require('node:assert/strict');const {analyzeProtocolEvents}=require('../market-protocol');\ntest('parser aceita anuncios detalhados fora de aba vitrine com identidade real',()=>{const p=analyzeProtocolEvents([{at:1,method:'RECV',postData:{t:'market',aba:'lista',anuncios:[{id:321,tipo:'item',itemId:23,nome:'Item 23',preco:58814,moeda:'gold',qtd:2,vendedor:'Trader'}]}}],0);assert.equal(p.listings.length,1);assert.equal(p.listings[0].listingId,'321');assert.equal(p.listings[0].assetId,'23');assert.equal(p.listings[0].currency,'coins');});\ntest('parser ignora array sem id real',()=>{const p=analyzeProtocolEvents([{at:1,method:'RECV',postData:{t:'market',aba:'lista',anuncios:[{itemId:23,preco:58814,moeda:'gold'}]}}],0);assert.equal(p.listings.length,0);});\n`);
console.log('Alpha 8.6 client protocol discovery + safe market.listar probes applied');
