'use strict';
const fs=require('fs'),path=require('path');
const target=process.argv[2];if(!target)throw new Error('Uso: node apply-alpha71-fixed.js <diretorio-alvo>');
const root=path.resolve(process.cwd(),target),p=n=>path.join(root,n),read=n=>fs.readFileSync(p(n),'utf8'),write=(n,t)=>fs.writeFileSync(p(n),t,'utf8');
const rep=(t,a,b,l)=>{if(!t.includes(a))throw new Error('Alpha 7.1: trecho não encontrado ('+l+')');return t.replace(a,b)};
const pkg=JSON.parse(read('package.json'));pkg.version='3.0.0-alpha.7.1';write('package.json',JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
html=html.replace(/Alpha 7: Auto Trader \+ inspeção automática contínua · LIVE protegido · Kill Switch\./g,'Alpha 7.1: Auto Trader conectado à inspeção automática · status em tempo real · LIVE protegido.');
html=rep(html,'<span id="alphaAutoInspectorBadge" class="safe-chip">INSPEÇÃO AUTO: INICIANDO</span><button id="marketScan">Inspecionar agora</button>','<span id="alphaAutoInspectorBadge" class="safe-chip">INSPEÇÃO AUTO: INICIANDO</span><span id="alphaAutoTraderBadge" class="safe-chip warning">AUTO TRADER: PARADO</span><button id="marketScan">Inspecionar agora</button>','badge');
write('index.html',html);

let main=read('main.js');
main=rep(main,"let autoInspectorStatus={enabled:true,running:false,lastAt:0,lastDomAt:0,lastError:null,accounts:0,listings:0,crossMarket:0,domListings:0,marketVisible:0};","let autoInspectorStatus={enabled:true,running:false,lastAt:0,lastDomAt:0,lastError:null,accounts:0,listings:0,crossMarket:0,domListings:0,marketVisible:0};\nlet autoTraderStatus={running:false,lastAt:0,mode:'paper',live:false,kill:true,observed:0,fresh:0,eligible:0,riskApproved:0,lastReason:'Aguardando configuração',lastAction:'',lastListing:null,lastError:null};",'status global');
main=rep(main,'marketProtocol:latestMarketProtocol,marketInspector:{...autoInspectorStatus},system:','marketProtocol:latestMarketProtocol,marketInspector:{...autoInspectorStatus},autoTrader:{...autoTraderStatus},system:','snapshot');
main=rep(main,"const unique=new Map();for(const l of allListings){const key=`${l.slot}:${l.listingId}`;const prev=unique.get(key);if(!prev||Number(l.at)>Number(prev.at))unique.set(key,l);}const listings=[...unique.values()],crossMarket=crossMarketPairs(listings);","const retained=(latestMarketProtocol.listings||[]).filter(l=>Date.now()-(Number(l.at)||0)<=60000);const unique=new Map();for(const l of [...retained,...allListings]){const key=l.listingId?(String(l.slot)+':'+String(l.listingId)):(String(l.slot)+':'+String(l.assetType||'')+':'+String(l.assetId||l.name||'')+':'+String(l.currency||'')+':'+String(l.price||0));const prev=unique.get(key);if(!prev||Number(l.at)>Number(prev.at))unique.set(key,l);}const listings=[...unique.values()].sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0)),crossMarket=crossMarketPairs(listings);",'merge DOM');
main=rep(main,"if(now-(Number(autoInspectorStatus.lastDomAt)||0)>=15000){","const domInterval=alphaEngine?.settings?.executionMode==='auto'?4000:15000;\n    if(now-(Number(autoInspectorStatus.lastDomAt)||0)>=domInterval){",'cadência DOM');

const start=main.indexOf('async function autoTradingTick(){'),end=main.indexOf('\nfunction installHandlers(){',start);if(start<0||end<0)throw new Error('Alpha 7.1: autoTradingTick não encontrado');
const fn=[
"async function autoTradingTick(){",
"  const now=Date.now(),s=alphaEngine?.settings||{},mode=String(s.executionMode||'paper'),live=s.liveExecutionUnlocked===true,kill=s.killSwitch===true;",
"  autoTraderStatus={...autoTraderStatus,lastAt:now,mode,live,kill,lastError:null};",
"  const halt=reason=>{autoTraderStatus={...autoTraderStatus,running:false,lastReason:reason,observed:(latestMarketProtocol.listings||[]).length,fresh:0,eligible:0,riskApproved:0};publish();};",
"  if(autoTradingBusy){halt('Ciclo anterior ainda em andamento');return;}if(!alphaEngine){halt('Motor Alpha indisponível');return;}if(mode!=='auto'){halt('Selecione o modo Auto');return;}if(!live){halt('LIVE bloqueado — clique ARMAR LIVE');return;}if(kill){halt('Kill Switch ativo');return;}",
"  autoTradingBusy=true;autoTraderStatus={...autoTraderStatus,running:true,lastReason:'Analisando mercado…'};publish();",
"  try{",
"    refreshProtocolFromNetwork({recordMarket:true});const safety=alphaEngine.settings.liveSafety||{};",
"    if(safety.autoRepricing!==false){for(let slot=0;slot<4;slot++){for(const own of alphaEngine.ownListings?.[slot]||[]){const preview=alphaEngine.repricingPreview(slot,own,latestMarketProtocol.listings||[]);if(!preview.canEdit)continue;try{await executeLiveReprice({slot,listing:own,price:preview.suggested,source:'auto'});autoTraderStatus={...autoTraderStatus,lastAction:'Repricing automático confirmado'};}catch(error){autoTraderStatus={...autoTraderStatus,lastReason:'Repricing ignorado: '+String(error?.message||error)};}break;}}}",
"    const checkAt=Date.now(),freshMs=Math.max(2000,Number(safety.freshListingMs)||10000);let observed=0,fresh=0,eligible=0,riskApproved=0,lastReason='Nenhuma oportunidade aprovada pela estratégia Balanceado';",
"    for(let slot=0;slot<4;slot++){",
"      const rows=(latestMarketProtocol.listings||[]).filter(x=>Number(x.slot)===slot);observed+=rows.length;",
"      const usable=rows.filter(x=>checkAt-(Number(x.at)||0)<=freshMs&&['item','pokemon'].includes(x.assetType)&&checkAt-(autoConsumedListings.get(String(slot)+':'+String(x.listingId))||0)>1800000);fresh+=usable.length;",
"      const evaluated=usable.map(x=>({...x,evaluation:alphaEngine.evaluate(x,'balanced')}));const candidates=evaluated.filter(x=>x.evaluation?.eligible).sort((a,b)=>(b.evaluation.alphaScore||0)-(a.evaluation.alphaScore||0));eligible+=candidates.length;",
"      if(!usable.length&&rows.length)lastReason='Anúncios lidos, mas nenhum está fresco/normalizado como item ou Pokémon';",
"      else if(usable.length&&!candidates.length){const best=evaluated.sort((a,b)=>(b.evaluation?.alphaScore||0)-(a.evaluation?.alphaScore||0))[0];if(best)lastReason='Melhor rejeitado: score '+(best.evaluation?.alphaScore||0)+', ROI '+(best.evaluation?.roi||0)+'%, confiança '+Math.round((best.evaluation?.confidence||0)*100)+'%';}",
"      for(const c of candidates){try{const rate=liveRateCheck(slot);if(!rate.ok){lastReason=rate.reason;break;}const risk=alphaEngine.canExecute(c,slot,'balanced');if(!risk.ok){lastReason=risk.reason;continue;}riskApproved++;autoTraderStatus={...autoTraderStatus,running:true,observed,fresh,eligible,riskApproved,lastReason:'Executando oportunidade aprovada',lastListing:{slot,name:c.name||'',listingId:c.listingId,price:c.price,currency:c.currency,alphaScore:c.evaluation?.alphaScore,roi:c.evaluation?.roi}};publish();const result=await executeLiveBuy({slot,listing:c,strategy:'balanced',source:'auto',autoSell:safety.autoSellAfterBuy!==false});autoTraderStatus={...autoTraderStatus,running:false,lastAction:result?.ok?'Compra automática confirmada':'Compra automática não confirmada',lastReason:result?.ok?'Ordem executada com sucesso':'Servidor não confirmou a compra',observed,fresh,eligible,riskApproved,lastAt:Date.now()};publish();return;}catch(error){lastReason=String(error?.message||error);alphaEngine.audit('auto-skip','Auto ignorou oportunidade',slot,{listingId:c.listingId,reason:lastReason});}}",
"    }",
"    autoTraderStatus={...autoTraderStatus,running:false,observed,fresh,eligible,riskApproved,lastReason,lastAt:Date.now()};",
"  }catch(error){autoTraderStatus={...autoTraderStatus,running:false,lastError:String(error?.message||error),lastReason:'Erro no ciclo automático',lastAt:Date.now()};}finally{autoTradingBusy=false;publish();}",
"}",
""
].join('\n');
main=main.slice(0,start)+fn+main.slice(end);
main=main.replace(';setTimeout(()=>void autoMarketInspectionTick(),1500);',';');
write('main.js',main);

let renderer=read('renderer.js');
renderer=renderer.replaceAll("versao:'Gridium 3.0 Alpha 6'","versao:'Gridium 3.0 Alpha 7.1'");
renderer=rep(renderer,'renderRemote(data);renderServer(data);renderAutoInspector(data.marketInspector);','renderRemote(data);renderServer(data);renderAutoInspector(data.marketInspector);renderAutoTrader(data.autoTrader);','renderer hook');
if(!renderer.includes('GRID_ALPHA71_AUTO_TRADER_STATUS'))renderer += "\n// GRID_ALPHA71_AUTO_TRADER_STATUS\n"+[
"function renderAutoTrader(status){",
" const badge=document.getElementById('alphaAutoTraderBadge');if(!badge)return;const s=status||{},mode=String(s.mode||'paper').toUpperCase(),live=s.live===true,kill=s.kill===true;",
" let label='AUTO TRADER: ';if(s.running)label+='ANALISANDO';else if(mode!=='AUTO')label+='MODO '+mode;else if(!live)label+='LIVE BLOQUEADO';else if(kill)label+='KILL SWITCH';else label+='ATIVO';badge.textContent=label+' · '+Number(s.fresh||0)+' frescos';",
" badge.classList.toggle('warning',!s.running&&(mode!=='AUTO'||!live||kill||s.lastError));",
" const lines=['AUTO TRADER','Modo: '+mode+' · LIVE: '+(live?'ARMADO':'BLOQUEADO')+' · Kill: '+(kill?'ATIVO':'DESLIGADO'),'Observados: '+Number(s.observed||0)+' · frescos: '+Number(s.fresh||0)+' · elegíveis: '+Number(s.eligible||0)+' · risco aprovado: '+Number(s.riskApproved||0),'Motivo: '+String(s.lastError||s.lastReason||'aguardando'),'Última ação: '+String(s.lastAction||'nenhuma')];if(s.lastListing)lines.push('Último candidato: '+String(s.lastListing.name||s.lastListing.listingId||'?')+' · '+Number(s.lastListing.price||0)+' '+String(s.lastListing.currency||'')+' · score '+Number(s.lastListing.alphaScore||0)+' · ROI '+Number(s.lastListing.roi||0)+'%');badge.title=lines.join(String.fromCharCode(10));",
"}",
""
].join('\n');
write('renderer.js',renderer);
if(!read('main.js').includes("const retained=(latestMarketProtocol.listings||[])"))throw new Error('Alpha 7.1: merge DOM ausente');
if(!read('main.js').includes('autoTraderStatus='))throw new Error('Alpha 7.1: status ausente');
if(!read('renderer.js').includes('GRID_ALPHA71_AUTO_TRADER_STATUS'))throw new Error('Alpha 7.1: UI ausente');
if(!read('index.html').includes('alphaAutoTraderBadge'))throw new Error('Alpha 7.1: badge ausente');
console.log('Gridium 3.0.0-alpha.7.1 aplicado: Inspector alimenta Auto Trader + status visível.');
