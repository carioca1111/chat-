'use strict';
const fs=require('fs'),path=require('path');
const target=process.argv[2];
if(!target)throw new Error('Uso: node apply-alpha911.js <diretorio-alvo>');
const root=path.resolve(process.cwd(),target);
if(!fs.existsSync(root))throw new Error('Diretorio alvo nao existe: '+root);
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
function replaceOnce(text,from,to,label){
  const i=text.indexOf(from);if(i<0)throw new Error('Alpha 9.11: trecho nao encontrado: '+label);
  if(text.indexOf(from,i+from.length)>=0)throw new Error('Alpha 9.11: trecho ambiguo: '+label);
  return text.slice(0,i)+to+text.slice(i+from.length);
}

let main=read('main.js');
main=replaceOnce(main,
"let win,stats,powerId=null,timer,savingTimer,historySavingTimer,autoTradingTimer,autoInspectionTimer,autoNavigatorTimer,lastPollAt=0,historyDirty=false;",
"let win,stats,powerId=null,timer,savingTimer,historySavingTimer,autoTradingTimer,autoInspectionTimer,autoNavigatorTimer,listingRecoveryTimer,lastPollAt=0,historyDirty=false;",
'listingRecoveryTimer');
main=replaceOnce(main,
"let settings={power:'system',background:true,mute:false,performanceProfile:'balanced',zoom:[1,1,1,1],autoReconnect:true,alerts:{desktop:true,shiny:true,inactivity:true,connection:false,idleMinutes:5},goals:goalSet(),stocks:stockSet(),remote:{enabled:false,endpoint:DEFAULT_REMOTE_ENDPOINT,token:''}};",
"let settings={power:'system',background:true,mute:false,performanceProfile:'balanced',liveEcoMode:false,zoom:[1,1,1,1],autoReconnect:true,alerts:{desktop:true,shiny:true,inactivity:true,connection:false,idleMinutes:5},goals:goalSet(),stocks:stockSet(),remote:{enabled:false,endpoint:DEFAULT_REMOTE_ENDPOINT,token:''}};",
'liveEcoMode default');
main=replaceOnce(main,
"  for(const k of ['background','mute','autoReconnect'])if(typeof saved[k]==='boolean')settings[k]=saved[k];",
"  for(const k of ['background','mute','autoReconnect','liveEcoMode'])if(typeof saved[k]==='boolean')settings[k]=saved[k];",
'load liveEcoMode');
main=replaceOnce(main,
"function publicSettings(){return {power:settings.power,background:settings.background,mute:settings.mute,performanceProfile:settings.performanceProfile,autoReconnect:settings.autoReconnect,zoom:[...settings.zoom],alerts:{...settings.alerts},goals:cleanGoals(settings.goals),stocks:cleanStocks(settings.stocks),remote:{enabled:settings.remote.enabled,endpoint:settings.remote.endpoint,tokenConfigured:!!settings.remote.token}};}",
"function publicSettings(){return {power:settings.power,background:settings.background,mute:settings.mute,performanceProfile:settings.performanceProfile,liveEcoMode:settings.liveEcoMode,autoReconnect:settings.autoReconnect,zoom:[...settings.zoom],alerts:{...settings.alerts},goals:cleanGoals(settings.goals),stocks:cleanStocks(settings.stocks),remote:{enabled:settings.remote.enabled,endpoint:settings.remote.endpoint,tokenConfigured:!!settings.remote.token}};}",
'public liveEcoMode');
main=replaceOnce(main,
"function performancePlan(slot){\n  const profile=settings.performanceProfile||'balanced',visible=performanceView.section==='games'&&performanceView.visibleSlots.includes(Number(slot)),focused=visible&&Number(performanceView.focusedSlot)===Number(slot),layout=performanceView.layout||'grid';\n  if(profile==='quality')return {fps:60,reduceVisuals:false,sampleMs:5000,visible,focused};",
"function performancePlan(slot){\n  const profile=settings.performanceProfile||'balanced',visible=performanceView.section==='games'&&performanceView.visibleSlots.includes(Number(slot)),focused=visible&&Number(performanceView.focusedSlot)===Number(slot),layout=performanceView.layout||'grid';\n  if(settings.liveEcoMode){const cap=focused?(layout==='focus'?30:20):(visible?8:3);return {fps:cap,reduceVisuals:!focused,sampleMs:focused?5000:(visible?10000:15000),visible,focused};}\n  if(profile==='quality')return {fps:60,reduceVisuals:false,sampleMs:5000,visible,focused};",
'live eco plan');
main=replaceOnce(main,
"  if(!wc||wc.isDestroyed())return;const plan=performancePlan(slot);wc.setBackgroundThrottling(!settings.background);wc.setAudioMuted(settings.mute);",
"  if(!wc||wc.isDestroyed())return;const plan=performancePlan(slot);wc.setBackgroundThrottling(settings.liveEcoMode?false:!settings.background);wc.setAudioMuted(settings.mute);",
'live eco background throttling');
main=replaceOnce(main,
"      for(const k of ['background','mute','autoReconnect'])if(typeof patch[k]==='boolean')settings[k]=patch[k];",
"      for(const k of ['background','mute','autoReconnect','liveEcoMode'])if(typeof patch[k]==='boolean')settings[k]=patch[k];",
'settings liveEcoMode handler');

// Mark freshly purchased real positions as awaiting a confirmed listing.
main=replaceOnce(main,
"metadata:{listingId:listing.listingId,source,locked:outcome.locked===true,expectedSale,expectedFee,expectedProfit,expectedRoi:listing.price>0?expectedProfit/listing.price*100:0,fairValue:Number(evaluation.fairValue)||0,floorPrice:Number(evaluation.floorPrice)||0,bookTarget:Number(evaluation.bookTarget)||0,bookDepth:Number(evaluation.bookDepth)||0,confidence:Number(evaluation.confidence)||0}});",
"metadata:{listingId:listing.listingId,source,locked:outcome.locked===true,expectedSale,expectedFee,expectedProfit,expectedRoi:listing.price>0?expectedProfit/listing.price*100:0,fairValue:Number(evaluation.fairValue)||0,floorPrice:Number(evaluation.floorPrice)||0,bookTarget:Number(evaluation.bookTarget)||0,bookDepth:Number(evaluation.bookDepth)||0,confidence:Number(evaluation.confidence)||0,listingStatus:autoSell?'pending':'manual',listingAttempts:0,listingRetryAt:0}});",
'position listing metadata');
main=replaceOnce(main,
"  return {ok:true,outcome,listing,evaluation,positionId,sell};",
"  const resaleProblem=autoSell&&!outcome.locked&&sell&&sell.ok!==true;if(sell?.ok===true)alphaEngine.updatePositionMetadata(positionId,{listingStatus:'pending',listingAttempts:0,listingRetryAt:Date.now()+5000});else if(resaleProblem){const retryAt=Date.now()+5000;alphaEngine.updatePositionMetadata(positionId,{listingStatus:'pending',listingAttempts:1,listingRetryAt:retryAt,lastListingError:outcome.locked===true?'Ativo travado para revenda':String(sell?.error||sell?.outcome?.error||'Falha ao anunciar')});alphaEngine.audit('auto-sell-pending','Compra concluída; recuperador tentará novamente o anúncio',slot,{positionId,retryAt});}\n  const resaleState=resaleProblem?{resalePending:true}:{resalePending:false};return {ok:true,outcome,listing,evaluation,positionId,sell,...resaleState};",
'non fatal resale recovery');

main=replaceOnce(main,
"const resaleProblem=autoSell&&!outcome.locked&&sell&&sell.ok!==true;",
"const resaleProblem=autoSell&&(outcome.locked===true||(sell&&sell.ok!==true));",
'locked resale pending');
main=replaceOnce(main,
"const resaleProblem=result?.ok&&safety.autoSellAfterBuy!==false&&(result?.outcome?.locked===true||result?.sell?.ok===false);if(resaleProblem)return {slot,observed,fresh,eligible,riskApproved,lastReason:result?.outcome?.locked===true?'Ativo comprado travado para revenda':'Falha na revenda automática',fatal:true};if(result?.ok)autoOrderFailures=0;",
"const resaleProblem=result?.resalePending===true;if(resaleProblem){lastReason=result?.outcome?.locked===true?'C'+(slot+1)+': compra confirmada; revenda aguardando desbloqueio':'C'+(slot+1)+': compra confirmada; recuperador cuidará do anúncio';action='Compra confirmada C'+(slot+1)+' · anúncio pendente';}if(result?.ok)autoOrderFailures=0;",
'nonfatal auto trader resale');

const recoveryCode=`\nfunction positionOwnListing(position){\n  const rows=alphaEngine?.ownListings?.[Number(position.slot)]||[];\n  return rows.find(x=>x&&x.currency===position.currency&&x.assetType===position.asset_type&&String(x.assetId??x.name??'')===String(position.asset_id??position.name??''))||null;\n}\nfunction uncoveredRealPositions(){\n  if(!alphaEngine)return [];const now=Date.now();return alphaEngine.positions(true).filter(p=>{if(p.mode!=='real')return false;const m=p.metadata&&typeof p.metadata==='object'?p.metadata:{};if(m.listingStatus==='manual')return false;if(positionOwnListing(p)){if(m.listingStatus!=='listed')alphaEngine.updatePositionMetadata(p.id,{listingStatus:'listed',listingRetryAt:0,lastListingError:null});return false;}return Number(m.listingRetryAt||0)<=now;});\n}\nasync function recoverUnlistedPositionsTick(){\n  if(!alphaEngine||autoTradingBusy)return;const s=alphaEngine.settings||{};if(s.killSwitch||!s.liveExecutionUnlocked||!['semi','auto'].includes(String(s.executionMode)))return;\n  refreshProtocolFromNetwork({recordMarket:false,force:true,all:true});const candidates=uncoveredRealPositions();if(!candidates.length)return;const p=candidates[0],slot=Number(p.slot),meta=p.metadata&&typeof p.metadata==='object'?p.metadata:{},attempts=Math.max(0,Number(meta.listingAttempts)||0),price=Math.max(1,Math.ceil(Number(meta.expectedSale)||Number(p.target)||Number(p.entry)||1)),listing={assetType:p.asset_type,assetId:p.asset_id,name:p.name,currency:p.currency,price:Number(p.entry)||0};\n  if(positionOwnListing(p)){alphaEngine.updatePositionMetadata(p.id,{listingStatus:'listed',listingRetryAt:0,lastListingError:null});return;}\n  alphaEngine.updatePositionMetadata(p.id,{listingStatus:'recovering',listingAttempts:attempts+1,lastListingAttemptAt:Date.now()});\n  try{const outcome=await executeLiveCreate(slot,listing,price,Math.max(1,Number(p.qty)||1),{paired:true,source:'listing-recovery'});await sleep(700);refreshProtocolFromNetwork({recordMarket:false,force:true,slot});const confirmed=positionOwnListing(p);if(outcome?.ok&&confirmed){alphaEngine.updatePositionMetadata(p.id,{listingStatus:'listed',listingAttempts:attempts+1,listingRetryAt:0,lastListingError:null,recoveredAt:Date.now()});alphaEngine.audit('listing-recovery-ok','Anúncio recuperado e confirmado em Meus anúncios',slot,{positionId:p.id,price,listingId:confirmed.listingId||null});return;}const delay=Math.min(120000,5000*(2**Math.min(attempts,5))),error='Anúncio não encontrado em Meus anúncios';alphaEngine.updatePositionMetadata(p.id,{listingStatus:'pending',listingAttempts:attempts+1,listingRetryAt:Date.now()+delay,lastListingError:error});alphaEngine.audit('listing-recovery-wait',error,slot,{positionId:p.id,price,delay,outcome});}catch(error){const delay=Math.min(120000,5000*(2**Math.min(attempts,5)));alphaEngine.updatePositionMetadata(p.id,{listingStatus:'pending',listingAttempts:attempts+1,listingRetryAt:Date.now()+delay,lastListingError:String(error?.message||error)});alphaEngine.audit('listing-recovery-fail','Falha temporária ao recuperar anúncio',slot,{positionId:p.id,delay,error:String(error?.message||error)});}\n}\n`;
main=replaceOnce(main,"function reconcileRealSales(protocols=[]){",recoveryCode+"function reconcileRealSales(protocols=[]){",'listing recovery functions');
main=replaceOnce(main,
"  timer=setInterval(poll,5000);savingTimer=setInterval(persist,10000);historySavingTimer=setInterval(()=>persistHistory(),60000);autoInspectionTimer=setInterval(()=>void autoMarketInspectionTick(),12000);autoNavigatorTimer=null;autoTradingTimer=setInterval(()=>void autoTradingTick(),6000);",
"  timer=setInterval(poll,5000);savingTimer=setInterval(persist,10000);historySavingTimer=setInterval(()=>persistHistory(),60000);autoInspectionTimer=setInterval(()=>void autoMarketInspectionTick(),12000);autoNavigatorTimer=null;autoTradingTimer=setInterval(()=>void autoTradingTick(),6000);listingRecoveryTimer=setInterval(()=>void recoverUnlistedPositionsTick(),15000);",
'listing recovery timer');
main=replaceOnce(main,
"app.on('before-quit',()=>{clearInterval(timer);clearInterval(savingTimer);clearInterval(historySavingTimer);clearInterval(autoInspectionTimer);if(autoNavigatorTimer)clearInterval(autoNavigatorTimer);clearInterval(autoTradingTimer);",
"app.on('before-quit',()=>{clearInterval(timer);clearInterval(savingTimer);clearInterval(historySavingTimer);clearInterval(autoInspectionTimer);if(autoNavigatorTimer)clearInterval(autoNavigatorTimer);clearInterval(autoTradingTimer);if(listingRecoveryTimer)clearInterval(listingRecoveryTimer);",
'clear listing recovery timer');
write('main.js',main);

let engine=read('alpha-engine.js');
engine=replaceOnce(engine,
"  updateOwnListings(slot,rows=[]){if(!Number.isInteger(slot)||slot<0||slot>3)return false;this.ownListings[slot]=(rows||[]).map(x=>({...x})).slice(0,100);const value=JSON.stringify(this.ownListings);if(this.db)this.db.prepare('INSERT INTO alpha_kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('ownListings',value);else{this.fallback.data.ownListings=this.ownListings;this.fallback.save();}return true;}\n  ingestProtocol(protocol={}){this.setValidation(protocol.validation||{});if(Number.isInteger(protocol.slot))this.updateOwnListings(protocol.slot,protocol.ownListings||[]);for(const a of protocol.actions||[])this.recordMarketAction(a);return this.view();}",
"  updateOwnListings(slot,rows=[],merge=false){if(!Number.isInteger(slot)||slot<0||slot>3)return false;const incoming=(rows||[]).map(x=>({...x})).slice(0,100);if(merge){const byId=new Map((this.ownListings[slot]||[]).map(x=>[String(x.listingId||x.assetType+':'+x.assetId+':'+x.price),x]));for(const x of incoming)byId.set(String(x.listingId||x.assetType+':'+x.assetId+':'+x.price),x);this.ownListings[slot]=[...byId.values()].slice(-100);}else this.ownListings[slot]=incoming;const value=JSON.stringify(this.ownListings);if(this.db)this.db.prepare('INSERT INTO alpha_kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('ownListings',value);else{this.fallback.data.ownListings=this.ownListings;this.fallback.save();}return true;}\n  ingestProtocol(protocol={}){this.setValidation(protocol.validation||{});if(Number.isInteger(protocol.slot)){const rows=protocol.ownListings||[];if(rows.length)this.updateOwnListings(protocol.slot,rows,true);else if(protocol.validation?.ownListingsMapped===true)this.updateOwnListings(protocol.slot,[],false);}for(const a of protocol.actions||[])this.recordMarketAction(a);return this.view();}",
'preserve partial own listings');
engine=replaceOnce(engine,
"  markPosition(id,mark){mark=Math.max(0,Number(mark)||0);if(this.db)this.db.prepare(\"UPDATE alpha_positions SET mark=? WHERE id=? AND status='open'\").run(mark,id);else{const p=this.fallback.data.positions.find(x=>x.id===id);if(p&&p.status==='open'){p.mark=mark;this.fallback.save();}}}",
"  updatePositionMetadata(id,patch={}){const p=this.positions(false).find(x=>x.id===id);if(!p)return false;const next={...(p.metadata&&typeof p.metadata==='object'?p.metadata:{}),...(patch&&typeof patch==='object'?patch:{})},json=JSON.stringify(next);if(this.db)this.db.prepare('UPDATE alpha_positions SET metadata=? WHERE id=?').run(json,id);else{const row=this.fallback.data.positions.find(x=>x.id===id);if(!row)return false;row.metadata=json;this.fallback.save();}return true;}\n  markPosition(id,mark){mark=Math.max(0,Number(mark)||0);if(this.db)this.db.prepare(\"UPDATE alpha_positions SET mark=? WHERE id=? AND status='open'\").run(mark,id);else{const p=this.fallback.data.positions.find(x=>x.id===id);if(p&&p.status==='open'){p.mark=mark;this.fallback.save();}}}",
'updatePositionMetadata');
write('alpha-engine.js',engine);

let html=read('index.html');
html=replaceOnce(html,
"    <label>Modo de desempenho<select id=\"performanceProfile\"><option value=\"ultra\">Ultra · máximo desempenho</option><option value=\"balanced\" selected>Balanceado · recomendado</option><option value=\"quality\">Qualidade · renderização completa</option></select></label>\n    <small>Ultra reduz FPS, efeitos, sondagens e buffers das contas fora de foco sem suspender timers ou WebSocket.</small>",
"    <label>Modo de desempenho<select id=\"performanceProfile\"><option value=\"ultra\">Ultra · máximo desempenho</option><option value=\"balanced\" selected>Balanceado · recomendado</option><option value=\"quality\">Qualidade · renderização completa</option></select></label>\n    <label class=\"check\"><input type=\"checkbox\" id=\"liveEcoMode\">Lives econômicas · várias transmissões com menos GPU/CPU</label>\n    <small>Lives econômicas reduz FPS e efeitos das contas fora de foco, mantém timers/WebSocket ativos, não pausa vídeo e não simula visualização. A concessão de XP continua dependendo das regras do próprio jogo.</small>",
'live eco option');
html=replaceOnce(html,
"<span id=\"alphaAutoTraderBadge\" class=\"safe-chip warning\">AUTO TRADER: PARADO</span>",
"<span id=\"alphaAutoTraderBadge\" class=\"safe-chip warning\">AUTO TRADER: PARADO</span><span id=\"alphaRecoveryBadge\" class=\"safe-chip\">ANÚNCIOS: OK</span><span id=\"liveEcoBadge\" class=\"safe-chip\">LIVES ECO: OFF</span>",
'alpha recovery badge');
write('index.html',html);

let renderer=read('renderer.js');
renderer=replaceOnce(renderer,
"  current=data;$('power').value=data.settings.power;$('background').checked=data.settings.background;$('mute').checked=data.settings.mute;if($('performanceProfile'))$('performanceProfile').value=data.settings.performanceProfile||'balanced';if($('performanceBadge'))$('performanceBadge').textContent=String(data.settings.performanceProfile||'balanced').toUpperCase();",
"  current=data;$('power').value=data.settings.power;$('background').checked=data.settings.background;$('mute').checked=data.settings.mute;if($('liveEcoMode'))$('liveEcoMode').checked=data.settings.liveEcoMode===true;if($('liveEcoBadge')){$('liveEcoBadge').textContent=data.settings.liveEcoMode?'LIVES ECO: ON':'LIVES ECO: OFF';$('liveEcoBadge').classList.toggle('warning',!data.settings.liveEcoMode);}if($('performanceProfile'))$('performanceProfile').value=data.settings.performanceProfile||'balanced';if($('performanceBadge'))$('performanceBadge').textContent=String(data.settings.performanceProfile||'balanced').toUpperCase();",
'render live eco setting');
renderer=replaceOnce(renderer,
"for(const key of ['power','background','mute','autoReconnect'])$(key).onchange=()=>action(()=>window.gridAPI.settings({[key]:key==='power'?$(key).value:$(key).checked}));",
"for(const key of ['power','background','mute','autoReconnect','liveEcoMode'])$(key).onchange=()=>action(()=>window.gridAPI.settings({[key]:key==='power'?$(key).value:$(key).checked}));",
'live eco onchange');
const recoveryRenderer=`\nfunction renderMarketRecovery(state){const badge=$('alphaRecoveryBadge');if(!badge||!state)return;badge.classList.add('alpha-listing-health');const own=state.ownListings||[],positions=(state.positions||[]).filter(p=>p.mode==='real'&&p.status==='open'),missing=positions.filter(p=>{const m=p.metadata&&typeof p.metadata==='object'?p.metadata:{};if(m.listingStatus==='manual')return false;return !(own[Number(p.slot)]||[]).some(x=>x&&x.currency===p.currency&&x.assetType===p.asset_type&&String(x.assetId??x.name??'')===String(p.asset_id??p.name??''));});const recovering=missing.filter(p=>['pending','recovering'].includes(String(p.metadata?.listingStatus||''))).length;badge.textContent=missing.length?('ANÚNCIOS: '+recovering+' RECUPERANDO · '+missing.length+' SEM ANÚNCIO'):'ANÚNCIOS: OK';badge.classList.toggle('warning',missing.length>0);}\n`;
renderer=replaceOnce(renderer,"function renderAlphaInsights(state){",recoveryRenderer+"function renderAlphaInsights(state){",'renderMarketRecovery');
renderer=replaceOnce(renderer,
"  drawAlphaCurve(state);renderMarketDesk({...marketDeskState,marketActions:state.marketActions||marketDeskState?.marketActions,ownListings:state.ownListings||marketDeskState?.ownListings});",
"  renderMarketRecovery(state);drawAlphaCurve(state);renderMarketDesk({...marketDeskState,marketActions:state.marketActions||marketDeskState?.marketActions,ownListings:state.ownListings||marketDeskState?.ownListings});",
'call renderMarketRecovery');
write('renderer.js',renderer);

let css=read('styles.css');
if(!css.includes('GRID_ALPHA911_LISTING_RECOVERY_LIVE_ECO'))css+=`\n/* GRID_ALPHA911_LISTING_RECOVERY_LIVE_ECO */\n#alphaRecoveryBadge.warning,#liveEcoBadge.warning{opacity:.88}.alpha-listing-health{font-variant-numeric:tabular-nums}\n`;
write('styles.css',css);

const pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
if(pkg.version!=='3.0.0-alpha.9.10'&&pkg.version!=='3.0.0-alpha.9.11')throw new Error('Alpha 9.11: base 9.10 esperada, atual '+pkg.version);
pkg.version='3.0.0-alpha.9.11';fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
const testDir=path.join(root,'test');fs.mkdirSync(testDir,{recursive:true});
fs.writeFileSync(path.join(testDir,'alpha911-listing-recovery.test.js'),`'use strict';\nconst test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');\nconst {AlphaEngine}=require('../alpha-engine');\nfunction engine(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g911-')),e=new AlphaEngine(path.join(dir,'a.sqlite'));return {dir,e};}\ntest('snapshot parcial não apaga anúncios próprios já conhecidos',()=>{const {dir,e}=engine();try{e.updateOwnListings(0,[{listingId:'a',assetType:'item',assetId:'23',currency:'coins',price:120000}]);e.ingestProtocol({slot:0,validation:{ownListingsMapped:false},ownListings:[]});assert.equal(e.ownListings[0].length,1);e.ingestProtocol({slot:0,validation:{createListingValidated:true},ownListings:[{listingId:'b',assetType:'item',assetId:'24',currency:'coins',price:130000}]});assert.equal(e.ownListings[0].length,2);}finally{e.close();fs.rmSync(dir,{recursive:true,force:true});}});\ntest('metadata de posição guarda estado e tentativas do anúncio',()=>{const {dir,e}=engine();try{const id=e.openPosition({slot:0,strategy:'balanced',mode:'real',assetType:'item',assetId:'23',name:'Stone',currency:'coins',entry:100000});e.updatePositionMetadata(id,{listingStatus:'pending',listingAttempts:2,listingRetryAt:123});const p=e.positions(true).find(x=>x.id===id);assert.equal(p.metadata.listingStatus,'pending');assert.equal(p.metadata.listingAttempts,2);assert.equal(p.metadata.listingRetryAt,123);}finally{e.close();fs.rmSync(dir,{recursive:true,force:true});}});\ntest('recuperador procura posições sem anúncio, usa backoff e confirmação real',()=>{const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');assert.ok(main.includes('recoverUnlistedPositionsTick'));assert.ok(main.includes('uncoveredRealPositions'));assert.ok(main.includes('executeLiveCreate(slot,listing,price'));assert.ok(main.includes('2**Math.min(attempts,5)'));assert.ok(main.includes('listingRecoveryTimer=setInterval'));assert.ok(main.includes('Anúncio não encontrado em Meus anúncios'));});\ntest('falha do anúncio inicial não derruba o Auto Trader',()=>{const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8'),at=main.indexOf('const resaleProblem='),end=main.indexOf('if(result?.ok)autoOrderFailures=0',at),seg=main.slice(at,end);assert.ok(at>0&&end>at);assert.match(seg,/resalePending:true/);assert.doesNotMatch(seg,/fatal:true/);assert.match(seg,/recuperador tentará novamente/);});\ntest('painel mostra anunciadas e SEM ANÚNCIO por conta',()=>{const r=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8'),h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');assert.match(h,/alphaRecoveryBadge/);assert.match(r,/renderMarketRecovery/);assert.match(r,/SEM ANÚNCIO/);assert.match(r,/alpha-listing-health/);});\n`,'utf8');
fs.writeFileSync(path.join(testDir,'alpha911-live-eco.test.js'),`'use strict';\nconst test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');\nconst main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8'),renderer=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');\ntest('Lives econômicas existe e persiste nas configurações',()=>{assert.match(html,/id=\"liveEcoMode\"/);assert.match(renderer,/liveEcoMode/);assert.match(main,/liveEcoMode:false/);assert.match(main,/liveEcoMode:settings\\.liveEcoMode/);});\ntest('Lives econômicas reduz composição sem pausar a reprodução',()=>{assert.ok(main.includes(\"const cap=focused?(layout==='focus'?30:20):(visible?8:3)\"));assert.ok(main.includes('setFrameRate'));assert.ok(main.includes('setBackgroundThrottling(settings.liveEcoMode?false'));assert.ok(!main.includes('playbackRate='));assert.ok(!main.includes('video.pause('));});\ntest('modo declara explicitamente que não simula visualização',()=>{assert.match(html,/não simula visualização/);assert.match(html,/não pausa vídeo/);assert.match(css,/GRID_ALPHA911_LISTING_RECOVERY_LIVE_ECO/);assert.match(html,/liveEcoBadge/);});\n`,'utf8');
console.log('Gridium 3.0.0-alpha.9.11 aplicado: Recuperador de Anúncios + Lives Econômicas.');
