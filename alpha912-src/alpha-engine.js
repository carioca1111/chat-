'use strict';
const fs=require('fs');
const path=require('path');
const Professional=require('./alpha-professional');
let DatabaseSync=null;
try{({DatabaseSync}=require('node:sqlite'));}catch{}

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
const nowDay=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const median=arr=>{const a=arr.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
const uid=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
const DEFAULT_STRATEGIES=[
  {id:'balanced',name:'Balanceado',enabled:true,minAlpha:82,minRoi:12,minConfidence:0.60,maxPositionPct:20,maxOpen:5,liquidityMin:0.45,tags:['default']},
  {id:'conservative',name:'Conservador',enabled:false,minAlpha:90,minRoi:18,minConfidence:0.78,maxPositionPct:12,maxOpen:3,liquidityMin:0.65,tags:['safe']},
  {id:'aggressive',name:'Agressivo',enabled:false,minAlpha:74,minRoi:8,minConfidence:0.45,maxPositionPct:28,maxOpen:8,liquidityMin:0.30,tags:['growth']},
  {id:'bootstrap',name:'Capital Bootstrap',enabled:false,minAlpha:84,minRoi:10,minConfidence:0.62,maxPositionPct:22,maxOpen:4,liquidityMin:0.58,tags:['coins-to-gems']}
];
const DEFAULT_SETTINGS={
  schemaVersion:12,
  professional:{profile:'balanced'},
  marketConcurrency:1,
  executionMode:'paper', // observer | paper | confirm | semi | auto
  liveExecutionUnlocked:false,
  killSwitch:true,
  reinvestPercent:100,
  profitLockPercent:0,
  dailyProfitTarget:{enabled:false,currency:'gems',amount:0,action:'reduce'},
  goal:{enabled:false,currency:'gems',target:0},
  reserve:{gems:0,coins:0},
  maxDailyLoss:{gems:0,coins:0},
  feePct:{gems:15,coins:15},
  liveSafety:{maxOrderGems:5,maxOrderCoins:2000000,maxOrdersPerHour:6,minSecondsBetweenOrders:10,freshListingMs:10000,autoSellAfterBuy:true,autoRepricing:true,maxRepricesPerHour:4,lossTightenPct:2,lossPausePct:5,minExitProfitPct:5,minBookDepth:3,bookMaxAgeMs:20000,assetLossStreakLimit:2,assetLossCooldownMs:21600000,globalLossStreakLimit:3,globalLossCooldownMs:7200000},
  bankrolls:Array.from({length:4},()=>({gems:0,coins:0})),
  accountProfiles:Array.from({length:4},()=>({strategy:'balanced',spendMode:'adaptive',spendPct:20,fixed:{gems:5,coins:2000000},bankrollMode:'manual'})),
  strategies:DEFAULT_STRATEGIES
};
function deepClone(v){return JSON.parse(JSON.stringify(v));}
function mergeSettings(saved={}){
  const out=deepClone(DEFAULT_SETTINGS);
  for(const k of ['schemaVersion','marketConcurrency','executionMode','liveExecutionUnlocked','killSwitch','reinvestPercent','profitLockPercent'])if(saved[k]!==undefined)out[k]=saved[k];
  for(const k of ['dailyProfitTarget','goal','reserve','maxDailyLoss','feePct','liveSafety','professional'])if(saved[k]&&typeof saved[k]==='object')out[k]={...out[k],...saved[k]};
  if(Array.isArray(saved.bankrolls))out.bankrolls=Array.from({length:4},(_,i)=>({...out.bankrolls[i],...(saved.bankrolls[i]||{})}));
  if(Array.isArray(saved.accountProfiles))out.accountProfiles=Array.from({length:4},(_,i)=>({...out.accountProfiles[i],...(saved.accountProfiles[i]||{}),fixed:{...out.accountProfiles[i].fixed,...(saved.accountProfiles[i]?.fixed||{})}}));
  if(Array.isArray(saved.strategies)&&saved.strategies.length)out.strategies=saved.strategies.map(x=>({...x}));
  if(!saved.schemaVersion&&saved.feePct&&Number(saved.feePct.gems)===10&&Number(saved.feePct.coins)===10)out.feePct={gems:15,coins:15};
  out.schemaVersion=12;
  return normalizeSettings(out);
}
function normalizeSettings(out){
  out.professional={profile:['defensive','balanced','growth'].includes(out.professional?.profile)?out.professional.profile:'balanced'};
  out.marketConcurrency=Math.max(1,Math.min(4,Math.round(Number(out.marketConcurrency)||1)));
  out.executionMode=['observer','paper','confirm','semi','auto'].includes(out.executionMode)?out.executionMode:'paper';
  out.liveExecutionUnlocked=out.liveExecutionUnlocked===true;
  out.killSwitch=out.killSwitch!==false;
  out.reinvestPercent=clamp(out.reinvestPercent,0,100);
  out.profitLockPercent=clamp(out.profitLockPercent,0,100);
  if(out.reinvestPercent+out.profitLockPercent>100)out.reinvestPercent=100-out.profitLockPercent;
  for(const c of ['gems','coins']){
    out.reserve[c]=Math.max(0,Number(out.reserve[c])||0);
    out.maxDailyLoss[c]=Math.max(0,Number(out.maxDailyLoss[c])||0);
    out.feePct[c]=clamp(out.feePct[c],0,50);
  }
  out.liveSafety.maxOrderGems=Math.max(0,Number(out.liveSafety.maxOrderGems)||0);
  out.liveSafety.maxOrderCoins=Math.max(0,Number(out.liveSafety.maxOrderCoins)||0);
  out.liveSafety.maxOrdersPerHour=Math.max(1,Math.min(60,Number(out.liveSafety.maxOrdersPerHour)||6));
  out.liveSafety.minSecondsBetweenOrders=Math.max(3,Math.min(3600,Number(out.liveSafety.minSecondsBetweenOrders)||10));
  out.liveSafety.freshListingMs=Math.max(2000,Math.min(60000,Number(out.liveSafety.freshListingMs)||10000));
  out.liveSafety.maxRepricesPerHour=Math.max(1,Math.min(60,Number(out.liveSafety.maxRepricesPerHour)||4));
  out.liveSafety.lossTightenPct=Math.max(.25,Math.min(50,Number(out.liveSafety.lossTightenPct)||2));
  out.liveSafety.lossPausePct=Math.max(out.liveSafety.lossTightenPct,Math.min(80,Number(out.liveSafety.lossPausePct)||5));
  out.liveSafety.minExitProfitPct=Math.max(0,Math.min(50,Number(out.liveSafety.minExitProfitPct)||5));
  out.liveSafety.minBookDepth=Math.max(1,Math.min(20,Math.round(Number(out.liveSafety.minBookDepth)||3)));
  out.liveSafety.bookMaxAgeMs=Math.max(3000,Math.min(120000,Math.round(Number(out.liveSafety.bookMaxAgeMs)||20000)));
  out.liveSafety.assetLossStreakLimit=Math.max(1,Math.min(10,Math.round(Number(out.liveSafety.assetLossStreakLimit)||2)));
  out.liveSafety.assetLossCooldownMs=Math.max(60000,Math.min(86400000,Math.round(Number(out.liveSafety.assetLossCooldownMs)||21600000)));
  out.liveSafety.globalLossStreakLimit=Math.max(2,Math.min(20,Math.round(Number(out.liveSafety.globalLossStreakLimit)||3)));
  out.liveSafety.globalLossCooldownMs=Math.max(60000,Math.min(86400000,Math.round(Number(out.liveSafety.globalLossCooldownMs)||7200000)));
  out.liveSafety.autoSellAfterBuy=out.liveSafety.autoSellAfterBuy!==false;
  out.liveSafety.autoRepricing=out.liveSafety.autoRepricing!==false;
  out.bankrolls=Array.from({length:4},(_,i)=>({gems:Math.max(0,Number(out.bankrolls?.[i]?.gems)||0),coins:Math.max(0,Number(out.bankrolls?.[i]?.coins)||0)}));
  out.accountProfiles=Array.from({length:4},(_,i)=>{const p=out.accountProfiles?.[i]||{},strategy=['conservative','balanced','aggressive','bootstrap'].includes(p.strategy)?p.strategy:'balanced',spendMode=['adaptive','percent','fixed'].includes(p.spendMode)?p.spendMode:'adaptive',bankrollMode=p.bankrollMode==='auto'?'auto':'manual';return {strategy,spendMode,spendPct:Math.max(1,Math.min(100,Number(p.spendPct)||20)),fixed:{gems:Math.max(0,Number(p.fixed?.gems)||0),coins:Math.max(0,Number(p.fixed?.coins)||0)},bankrollMode};});
  return out;
}

class JsonFallback{
  constructor(file){this.file=file;this.data={settings:null,positions:[],trades:[],audit:[],market:[],equity:[],marketActions:[],ownListings:Array.from({length:4},()=>[])};try{this.data={...this.data,...JSON.parse(fs.readFileSync(file,'utf8'))};}catch{}}
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file,JSON.stringify(this.data));}
}

class AlphaEngine{
  constructor(file){this.file=file;this.db=null;this.fallback=null;this.settings=deepClone(DEFAULT_SETTINGS);this.validation={marketProtocolMapped:false,marketSearchMapped:false,marketListingsMapped:false,buyRequestMapped:false,liveBuyValidated:false,sellRequestMapped:false,createListingValidated:false,cancelRequestMapped:false,cancelValidated:false,liveSellValidated:false,autoRepricingValidated:false,stateProtocolMapped:false,ownListingsMapped:false};this.ownListings=Array.from({length:4},()=>[]);this._init();}
  _init(){
    if(DatabaseSync){
      try{
        this.db=new DatabaseSync(this.file);
        this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS alpha_kv (key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS alpha_positions (id TEXT PRIMARY KEY, opened_at INTEGER, closed_at INTEGER, slot INTEGER, strategy TEXT, mode TEXT, asset_type TEXT, asset_id TEXT, name TEXT, currency TEXT, qty REAL, entry REAL, target REAL, fair_value REAL, mark REAL, alpha_score REAL, confidence REAL, liquidity REAL, status TEXT, exit REAL, fees REAL, pnl REAL, metadata TEXT);
        CREATE TABLE IF NOT EXISTS alpha_trades (id TEXT PRIMARY KEY, at INTEGER, slot INTEGER, strategy TEXT, mode TEXT, asset_type TEXT, asset_id TEXT, name TEXT, currency TEXT, qty REAL, entry REAL, exit REAL, fees REAL, pnl REAL, hold_ms INTEGER, metadata TEXT);
        CREATE TABLE IF NOT EXISTS alpha_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, type TEXT, slot INTEGER, message TEXT, data TEXT);
        CREATE TABLE IF NOT EXISTS alpha_market (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, listing_id TEXT, slot INTEGER, asset_type TEXT, asset_id TEXT, name TEXT, currency TEXT, price REAL, liquidity REAL, metadata TEXT);
        CREATE INDEX IF NOT EXISTS idx_alpha_market_asset ON alpha_market(asset_id,name,currency,at);
        CREATE INDEX IF NOT EXISTS idx_alpha_trades_at ON alpha_trades(at);
        CREATE TABLE IF NOT EXISTS alpha_equity (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, slot INTEGER, currency TEXT, operational REAL, reserved REAL, realized REAL, unrealized REAL);
        CREATE TABLE IF NOT EXISTS alpha_market_actions (event_key TEXT PRIMARY KEY, at INTEGER, slot INTEGER, action TEXT, status TEXT, listing_id TEXT, asset_type TEXT, asset_id TEXT, name TEXT, currency TEXT, price REAL, qty REAL, available_at INTEGER, data TEXT);
        CREATE INDEX IF NOT EXISTS idx_alpha_market_actions_at ON alpha_market_actions(at);`);
        const row=this.db.prepare('SELECT value FROM alpha_kv WHERE key=?').get('settings');
        if(row?.value)this.settings=mergeSettings(JSON.parse(row.value)); else this._saveSettings();
        const own=this.db.prepare('SELECT value FROM alpha_kv WHERE key=?').get('ownListings');try{if(own?.value)this.ownListings=JSON.parse(own.value);}catch{}
        return;
      }catch(e){try{this.db?.close();}catch{}this.db=null;}
    }
    this.fallback=new JsonFallback(this.file+'.json');
    this.settings=mergeSettings(this.fallback.data.settings||{});this.fallback.data.settings=this.settings;this.ownListings=Array.isArray(this.fallback.data.ownListings)?this.fallback.data.ownListings:Array.from({length:4},()=>[]);this.fallback.save();
  }
  close(){try{this.db?.close();}catch{}this.fallback?.save();}
  _saveSettings(){const value=JSON.stringify(this.settings);if(this.db)this.db.prepare('INSERT INTO alpha_kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('settings',value);else{this.fallback.data.settings=this.settings;this.fallback.save();}}
  audit(type,message,slot=null,data=null){const at=Date.now();if(this.db)this.db.prepare('INSERT INTO alpha_audit(at,type,slot,message,data) VALUES(?,?,?,?,?)').run(at,String(type),Number.isInteger(slot)?slot:null,String(message||''),data?JSON.stringify(data):null);else{this.fallback.data.audit.push({at,type,slot,message,data});this.fallback.data.audit=this.fallback.data.audit.slice(-5000);this.fallback.save();}}
  configure(patch={}){
    const next=mergeSettings({...this.settings,...patch,liveSafety:{...this.settings.liveSafety,...patch.liveSafety},professional:{...this.settings.professional,...patch.professional},bankrolls:patch.bankrolls||this.settings.bankrolls,strategies:patch.strategies||this.settings.strategies});
    if(patch.profitLockPercent!==undefined&&patch.reinvestPercent===undefined)next.reinvestPercent=Math.max(0,100-next.profitLockPercent);
    if(patch.reinvestPercent!==undefined&&patch.profitLockPercent===undefined)next.profitLockPercent=Math.max(0,100-next.reinvestPercent);
    this.settings=normalizeSettings(next);this._saveSettings();this.audit('config','Configuração do Alpha Terminal atualizada',null,{keys:Object.keys(patch)});return this.view();
  }
  setBankroll(slot,currency,amount){if(!Number.isInteger(slot)||slot<0||slot>3||!['gems','coins'].includes(currency))throw new Error('bankroll inválida');this.settings.bankrolls[slot][currency]=Math.max(0,Number(amount)||0);this._saveSettings();this.audit('bankroll',`Banca ${currency} da conta ${slot+1} definida`,slot,{amount:this.settings.bankrolls[slot][currency]});return this.view();}
  kill(on=true){this.settings.killSwitch=!!on;this._saveSettings();this.audit(on?'kill-on':'kill-off',on?'Emergency Kill Switch ativado':'Emergency Kill Switch desativado');return this.view();}
  setValidation(patch={}){for(const [k,v] of Object.entries(patch||{}))if(Object.prototype.hasOwnProperty.call(this.validation,k)&&typeof v==='boolean')this.validation[k]=this.validation[k]||v;return this.view();}
  unlockLive(on=false){this.settings.liveExecutionUnlocked=on===true;this._saveSettings();this.audit('live-lock',on?'Execução real desbloqueada':'Execução real bloqueada');return this.view();}
  upsertStrategy(strategy){if(!strategy||!strategy.id)throw new Error('Estratégia inválida');const i=this.settings.strategies.findIndex(x=>x.id===strategy.id);const clean={...(i>=0?this.settings.strategies[i]:{}),...strategy,id:String(strategy.id).slice(0,64),name:String(strategy.name||strategy.id).slice(0,80)};for(const k of ['minAlpha','minRoi','minConfidence','maxPositionPct','maxOpen','liquidityMin'])if(clean[k]!==undefined)clean[k]=Number(clean[k])||0;if(i>=0)this.settings.strategies[i]=clean;else this.settings.strategies.push(clean);this._saveSettings();this.audit('strategy','Estratégia salva',null,{id:clean.id});return this.view();}
  recordMarket(listing){
    if(!listing||!Number.isFinite(Number(listing.price))||Number(listing.price)<=0)return false;
    const row={at:Number(listing.at)||Date.now(),listingId:String(listing.listingId||listing.id||''),slot:Number.isInteger(listing.slot)?listing.slot:null,assetType:String(listing.assetType||'pokemon'),assetId:String(listing.assetId||''),name:String(listing.name||'').slice(0,120),currency:['gems','coins'].includes(listing.currency)?listing.currency:'gems',price:Number(listing.price),liquidity:clamp(listing.liquidity??0.5,0,1),metadata:listing.metadata||listing};
    if(this.db){this.db.prepare('INSERT INTO alpha_market(at,listing_id,slot,asset_type,asset_id,name,currency,price,liquidity,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)').run(row.at,row.listingId,row.slot,row.assetType,row.assetId,row.name,row.currency,row.price,row.liquidity,JSON.stringify(row.metadata));this.db.prepare('DELETE FROM alpha_market WHERE id IN (SELECT id FROM alpha_market ORDER BY id DESC LIMIT -1 OFFSET 50000)').run();}
    else{this.fallback.data.market.push(row);this.fallback.data.market=this.fallback.data.market.slice(-50000);this.fallback.save();}
    return true;
  }

  recordMarketAction(action={}){
    if(!action||!action.eventKey)return false;
    const row={eventKey:String(action.eventKey),at:Number(action.at)||Date.now(),slot:Number.isInteger(action.slot)?action.slot:null,action:String(action.action||'market'),status:String(action.status||''),listingId:String(action.listingId||''),assetType:String(action.assetType||''),assetId:String(action.assetId||''),name:String(action.name||'').slice(0,160),currency:['gems','coins'].includes(action.currency)?action.currency:'',price:Number.isFinite(Number(action.price))?Number(action.price):null,qty:Number.isFinite(Number(action.qty))?Number(action.qty):null,availableAt:Number.isFinite(Number(action.availableAt))?Number(action.availableAt):null,data:action.data||action};
    if(this.db){this.db.prepare('INSERT OR IGNORE INTO alpha_market_actions(event_key,at,slot,action,status,listing_id,asset_type,asset_id,name,currency,price,qty,available_at,data) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.eventKey,row.at,row.slot,row.action,row.status,row.listingId,row.assetType,row.assetId,row.name,row.currency,row.price,row.qty,row.availableAt,JSON.stringify(row.data));this.db.prepare('DELETE FROM alpha_market_actions WHERE event_key IN (SELECT event_key FROM alpha_market_actions ORDER BY at DESC LIMIT -1 OFFSET 5000)').run();}
    else{if(!this.fallback.data.marketActions.some(x=>x.eventKey===row.eventKey))this.fallback.data.marketActions.push(row);this.fallback.data.marketActions=this.fallback.data.marketActions.slice(-5000);this.fallback.save();}
    return true;
  }
  recentMarketActions(limit=120){if(this.db)return this.db.prepare('SELECT * FROM alpha_market_actions ORDER BY at DESC LIMIT ?').all(Math.max(1,Math.min(1000,Number(limit)||120))).map(x=>({...x,data:(()=>{try{return JSON.parse(x.data)}catch{return null}})()}));return (this.fallback.data.marketActions||[]).slice(-limit).reverse();}
  updateOwnListings(slot,rows=[],merge=false){if(!Number.isInteger(slot)||slot<0||slot>3)return false;const incoming=(rows||[]).map(x=>({...x})).slice(0,100);if(merge){const byId=new Map((this.ownListings[slot]||[]).map(x=>[String(x.listingId||x.assetType+':'+x.assetId+':'+x.price),x]));for(const x of incoming)byId.set(String(x.listingId||x.assetType+':'+x.assetId+':'+x.price),x);this.ownListings[slot]=[...byId.values()].slice(-100);}else this.ownListings[slot]=incoming;const value=JSON.stringify(this.ownListings);if(this.db)this.db.prepare('INSERT INTO alpha_kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('ownListings',value);else{this.fallback.data.ownListings=this.ownListings;this.fallback.save();}return true;}
  ingestProtocol(protocol={}){this.setValidation(protocol.validation||{});if(Number.isInteger(protocol.slot)){const rows=protocol.ownListings||[];if(protocol.ownListingsComplete===true){const seen=this.proState().ownSnapshots?.[protocol.slot]||0;if(Number(protocol.ownListingsAt)>seen){this.updateOwnListings(protocol.slot,rows,false);const state=this.proState();state.ownSnapshots={...state.ownSnapshots,[protocol.slot]:Number(protocol.ownListingsAt)};this.saveProState(state);}}else if(rows.length)this.updateOwnListings(protocol.slot,rows,true);else if(protocol.validation?.ownListingsMapped===true&&!('ownListingsComplete' in protocol))this.updateOwnListings(protocol.slot,[],false);}for(const a of protocol.actions||[])this.recordMarketAction(a);return this.view();}
  repricingPreview(slot,listing,competitors=[]){
    const serverNow=Date.now()+(Number(listing?.serverOffsetMs)||0),current=Number(listing?.price)||0,availableAt=Number(listing?.availableAt)||0,remainingMs=Math.max(0,availableAt-serverNow),currency=listing?.currency||'coins';
    const sameAsset=x=>x&&x.currency===currency&&x.assetType===listing?.assetType&&String(x.assetId||x.name)===String(listing?.assetId||listing?.name);
    const comparable=(competitors||[]).filter(x=>sameAsset(x)&&String(x.listingId)!==String(listing?.listingId)&&Number(x.price)>0).sort((a,b)=>a.price-b.price);
    const best=comparable[0]?.price||null,positions=this.positions(true).filter(x=>Number(x.slot)===Number(slot)&&x.currency===currency&&x.asset_type===listing?.assetType&&String(x.asset_id||x.name)===String(listing?.assetId||listing?.name));
    const entry=positions.length?Math.max(...positions.map(x=>Number(x.entry)||0)):0,feePct=Math.max(0,Number(this.settings.feePct?.[currency])||0),minProfitPct=Math.max(0,Number(this.settings.liveSafety?.minExitProfitPct)||5),netFactor=Math.max(.01,1-feePct/100),floor=entry>0?Math.ceil(entry*(1+minProfitPct/100)/netFactor):0;
    const competitive=best&&best>1?Math.max(1,Math.floor(best-1)):current,suggested=floor>0?Math.max(floor,competitive):competitive,delta=current>0?Math.abs(suggested-current)/current*100:0,competitorBelowFloor=!!(best&&floor>0&&best-1<floor);
    const canEdit=remainingMs<=0&&current>0&&suggested>0&&suggested!==current&&delta>=1&&!competitorBelowFloor;
    const reason=remainingMs>0?'Aguardando cooldown do Market':!best?'Sem concorrente comparável':competitorBelowFloor?`Concorrente abaixo do piso protegido (${floor})`:suggested===current?'Preço já competitivo':delta<1?'Diferença menor que 1%':'Repricing elegível com margem protegida';
    return {slot,listingId:listing?.listingId||'',name:listing?.name||'',currency,current,bestCompetitor:best,suggested,deltaPct:delta,availableAt,remainingMs,canEdit,reason,entry,floor,minProfitPct,competitorBelowFloor};
  }
  comparables(listing,limit=200){
    const assetId=String(listing.assetId||''),name=String(listing.name||''),currency=listing.currency||'gems',since=Date.now()-24*60*60*1000;let rows=[];
    if(this.db){if(assetId)rows=this.db.prepare('SELECT listing_id,price,liquidity,at,metadata FROM alpha_market WHERE asset_id=? AND currency=? AND at>=? ORDER BY at DESC LIMIT ?').all(assetId,currency,since,Math.max(limit*6,600));else if(name)rows=this.db.prepare('SELECT listing_id,price,liquidity,at,metadata FROM alpha_market WHERE name=? AND currency=? AND at>=? ORDER BY at DESC LIMIT ?').all(name,currency,since,Math.max(limit*6,600));}else rows=this.fallback.data.market.filter(x=>(assetId?x.assetId===assetId:x.name===name)&&x.currency===currency&&x.at>=since).slice(-Math.max(limit*6,600)).reverse().map(x=>({listing_id:x.listingId,price:x.price,liquidity:x.liquidity,at:x.at,metadata:x.metadata}));
    const unique=new Map();for(const row of rows){const id=String(row.listing_id||'').trim(),key=id?`id:${id}`:`fallback:${Number(row.price)||0}:${Math.floor((Number(row.at)||0)/60000)}`;let meta=row.metadata;try{if(typeof meta==='string')meta=JSON.parse(meta);}catch{meta={};}if(listing.assetType&&meta?.assetType&&meta.assetType!==listing.assetType)continue;if(!unique.has(key))unique.set(key,row);}return [...unique.values()].slice(0,limit);
  }
  estimateFairValue(listing){
    const rows=this.comparables(listing,200),prices=rows.map(x=>Number(x.price)).filter(x=>x>0).sort((a,b)=>a-b);if(!prices.length)return {fairValue:null,confidence:0,comparableCount:0,liquidity:clamp(listing.liquidity??0.5,0,1)};
    const med=median(prices),q35=prices[Math.max(0,Math.min(prices.length-1,Math.floor((prices.length-1)*.35)))],dev=median(prices.map(x=>Math.abs(x-med)))||0,spread=med>0?dev/med:1,count=prices.length,recency=Math.max(...rows.map(x=>Number(x.at)||0));
    const freshness=clamp(1-(Date.now()-recency)/(24*60*60*1000),0.05,1),confidence=clamp((Math.log10(count+1)/2)*freshness*(1-clamp(spread,0,0.75)),0.03,0.96),liq=rows.reduce((a,x)=>a+(Number(x.liquidity)||0),0)/Math.max(1,rows.length);
    return {fairValue:q35,askMedian:med,confidence,comparableCount:count,liquidity:clamp(liq||listing.liquidity||0.5,0,1),dispersion:spread,historyWindowMs:24*60*60*1000};
  }
  evaluate(listing,strategyId='balanced'){
    const strategy=this.settings.strategies.find(x=>x.id===strategyId)||this.settings.strategies[0],est=this.estimateFairValue(listing),price=Number(listing.price)||0,fair=Number(listing.fairValue)||est.fairValue,bookTarget=Number(listing.bookTarget)||0,bookDepth=Math.max(0,Number(listing.bookDepth)||0),bookAgeMs=Math.max(0,Number(listing.bookAgeMs)||0),bookRequired=listing.bookRequired===true,confidence=Number.isFinite(Number(listing.confidence))?clamp(listing.confidence,0,1):est.confidence,liquidity=Number.isFinite(Number(listing.liquidity))?clamp(listing.liquidity,0,1):est.liquidity,safety=this.settings.liveSafety||{},minBookDepth=Math.max(1,Number(safety.minBookDepth)||3),bookMaxAgeMs=Math.max(3000,Number(safety.bookMaxAgeMs)||20000);
    if(!(price>0&&(fair>0||bookTarget>0)))return {...est,alphaScore:0,roi:0,netProfit:null,eligible:false,reason:'Sem preço atual confiável para estimar saída'};
    if(bookRequired&&bookDepth<minBookDepth)return {...est,fairValue:fair,bookDepth,bookTarget,alphaScore:0,roi:0,netProfit:null,eligible:false,reason:`Book raso: ${bookDepth}/${minBookDepth} anúncios comparáveis`};
    if(bookRequired&&bookAgeMs>bookMaxAgeMs)return {...est,fairValue:fair,bookDepth,bookTarget,alphaScore:0,roi:0,netProfit:null,eligible:false,reason:'Book atual ficou velho; aguardando nova leitura'};
    const feePct=Number(this.settings.feePct[listing.currency||'gems'])||0,historicalTarget=fair>0?fair*.98:0,target=bookTarget>0&&historicalTarget>0?Math.min(bookTarget,historicalTarget):(bookTarget||historicalTarget),net=target*(1-feePct/100)-price,roi=price>0?net/price*100:0,discount=fair>0?(fair-price)/fair:0,minExitProfitPct=Math.max(0,Number(safety.minExitProfitPct)||5),floorPrice=Math.ceil(price*(1+minExitProfitPct/100)/Math.max(.01,1-feePct/100));
    const score=clamp(50+discount*70+roi*.7+(confidence-.5)*30+(liquidity-.5)*20+Math.min(8,bookDepth),0,100),marginProtected=target>=floorPrice;
    let eligible=marginProtected&&score>=Number(strategy.minAlpha||0)&&roi>=Number(strategy.minRoi||0)&&confidence>=Number(strategy.minConfidence||0)&&liquidity>=Number(strategy.liquidityMin||0);
    let reason=!marginProtected?`Saída estimada abaixo do piso líquido (${floorPrice})`:eligible?'Aprovado: book + taxa + margem conferidos':'Fora dos limites da estratégia';
    const professional=bookRequired&&listing.professionalRequired===true?Professional.assessMarket(listing,{target},this.comparables(listing,200),this.trades(),this.settings):null;if(professional&&!professional.ok){eligible=false;reason=professional.reasons[0];}
    return {...est,professional,fairValue:fair,target,bookTarget,bookDepth,bookAgeMs,confidence,liquidity,alphaScore:Math.round(score*10)/10,roi:Math.round(roi*10)/10,netProfit:Math.round(net*100)/100,floorPrice,minExitProfitPct,marginProtected,eligible,reason};
  }
  _rows(table){if(this.db)return this.db.prepare(`SELECT * FROM ${table} ORDER BY ${table==='alpha_positions'?'opened_at':'at'} DESC`).all();return this.fallback.data[table.replace('alpha_','')]||[];}
  positions(openOnly=true){let rows=this._rows('alpha_positions');if(openOnly)rows=rows.filter(x=>x.status==='open');return rows.map(x=>({...x,metadata:typeof x.metadata==='string'?(()=>{try{return JSON.parse(x.metadata)}catch{return null}})():x.metadata}));}
  trades(){return this._rows('alpha_trades').map(x=>({...x,metadata:typeof x.metadata==='string'?(()=>{try{return JSON.parse(x.metadata)}catch{return null}})():x.metadata}));}
  openPosition({slot=0,strategy='balanced',mode='paper',assetType='pokemon',assetId='',name='',currency='gems',qty=1,entry,target=0,fairValue=0,mark=0,alphaScore=0,confidence=0,liquidity=0,metadata={}}){
    const id=uid(),at=Date.now(),row={id,opened_at:at,closed_at:null,slot,strategy,mode,asset_type:assetType,asset_id:String(assetId),name:String(name),currency,qty:Number(qty)||1,entry:Number(entry)||0,target:Number(target)||0,fair_value:Number(fairValue)||0,mark:Number(mark)||Number(entry)||0,alpha_score:Number(alphaScore)||0,confidence:Number(confidence)||0,liquidity:Number(liquidity)||0,status:'open',exit:null,fees:0,pnl:0,metadata:JSON.stringify(metadata||{})};
    if(this.db)this.db.prepare('INSERT INTO alpha_positions(id,opened_at,closed_at,slot,strategy,mode,asset_type,asset_id,name,currency,qty,entry,target,fair_value,mark,alpha_score,confidence,liquidity,status,exit,fees,pnl,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row));else{this.fallback.data.positions.push(row);this.fallback.save();}
    this.audit('position-open',`${mode==='paper'?'Paper':'Real'}: posição aberta em ${name||assetId}`,slot,{id,entry:row.entry,currency});return id;
  }
  updatePositionMetadata(id,patch={}){const p=this.positions(false).find(x=>x.id===id);if(!p)return false;const next={...(p.metadata&&typeof p.metadata==='object'?p.metadata:{}),...(patch&&typeof patch==='object'?patch:{})},json=JSON.stringify(next);if(this.db)this.db.prepare('UPDATE alpha_positions SET metadata=? WHERE id=?').run(json,id);else{const row=this.fallback.data.positions.find(x=>x.id===id);if(!row)return false;row.metadata=json;this.fallback.save();}return true;}
  markPosition(id,mark){mark=Math.max(0,Number(mark)||0);if(this.db)this.db.prepare("UPDATE alpha_positions SET mark=? WHERE id=? AND status='open'").run(mark,id);else{const p=this.fallback.data.positions.find(x=>x.id===id);if(p&&p.status==='open'){p.mark=mark;this.fallback.save();}}}
  closePosition(id,exit,fees=null,receipt=null){
    const p=this.positions(false).find(x=>x.id===id);if(!p||p.status!=='open')throw new Error('Posição não encontrada');exit=Math.max(0,Number(exit)||0);const fee=fees===null?exit*p.qty*(Number(this.settings.feePct[p.currency])||0)/100:Math.max(0,Number(fees)||0),pnl=exit*p.qty-p.entry*p.qty-fee,closed=Date.now(),hold=closed-p.opened_at,forecast=p.metadata&&typeof p.metadata==='object'?p.metadata:{},expectedSale=Number(forecast.expectedSale)||Number(p.target)||0,expectedFee=Number.isFinite(Number(forecast.expectedFee))?Number(forecast.expectedFee):expectedSale*p.qty*(Number(this.settings.feePct[p.currency])||0)/100,expectedProfit=Number.isFinite(Number(forecast.expectedProfit))?Number(forecast.expectedProfit):(expectedSale>0?expectedSale*p.qty-p.entry*p.qty-expectedFee:NaN),forecastError=Number.isFinite(expectedProfit)?pnl-expectedProfit:null,tradeMeta={...forecast,...(receipt?{serverSaleKey:receipt.eventKey,feeKnown:receipt.feeKnown}:{}),positionId:id,expectedSale:expectedSale||null,expectedFee:Number.isFinite(expectedFee)?expectedFee:null,expectedProfit:Number.isFinite(expectedProfit)?expectedProfit:null,actualSale:exit,actualFee:fee,actualProfit:pnl,forecastError},trade={id:uid(),at:closed,slot:p.slot,strategy:p.strategy,mode:p.mode,asset_type:p.asset_type,asset_id:p.asset_id,name:p.name,currency:p.currency,qty:p.qty,entry:p.entry,exit,fees:fee,pnl,hold_ms:hold,metadata:JSON.stringify(tradeMeta)};
    if(this.db){this.db.exec("BEGIN IMMEDIATE");try{this.db.prepare("UPDATE alpha_positions SET closed_at=?,status='closed',exit=?,fees=?,pnl=?,mark=? WHERE id=?").run(closed,exit,fee,pnl,exit,id);this.db.prepare('INSERT INTO alpha_trades(id,at,slot,strategy,mode,asset_type,asset_id,name,currency,qty,entry,exit,fees,pnl,hold_ms,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(trade));this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}}
    else{const row=this.fallback.data.positions.find(x=>x.id===id);Object.assign(row,{closed_at:closed,status:'closed',exit,fees:fee,pnl,mark:exit});this.fallback.data.trades.push(trade);this.fallback.save();}
    this.audit('position-close',`${p.mode==='paper'?'Paper':'Real'}: posição encerrada em ${p.name||p.asset_id}`,p.slot,{id,exit,pnl,currency:p.currency});return {pnl,fee,trade};
  }
  canExecute(opportunity,slot,strategyId='balanced'){
    const s=this.settings,cur=opportunity.currency||'gems',profile=s.accountProfiles?.[slot]||{},resolvedStrategy=strategyId||profile.strategy||'balanced',strategy=s.strategies.find(x=>x.id===resolvedStrategy)||s.strategies.find(x=>x.id==='balanced')||s.strategies[0],summary=this.accountSummary(slot,cur),price=Number(opportunity.price)||0;
    if(!(price>0)||!Number.isFinite(price))return {ok:false,reason:'Preço inválido'};
    if(s.killSwitch)return {ok:false,reason:'Emergency Kill Switch ativo'};
    if(!['confirm','semi','auto'].includes(s.executionMode))return {ok:false,reason:'Modo atual não permite execução real'};
    if(!s.liveExecutionUnlocked)return {ok:false,reason:'Execução real ainda não desbloqueada'};
    const maxOrder=cur==='gems'?Number(s.liveSafety?.maxOrderGems)||0:Number(s.liveSafety?.maxOrderCoins)||0;if(maxOrder>0&&price>maxOrder)return {ok:false,reason:'Excede limite absoluto por ordem'};
    const maxByPct=summary.operational*clamp(strategy.maxPositionPct||20,1,100)/100,available=Math.max(0,summary.available),mode=profile.spendMode||'adaptive';let spendCap=maxByPct;
    if(mode==='percent')spendCap=Math.min(spendCap,available*clamp(profile.spendPct||20,1,100)/100);else if(mode==='fixed')spendCap=Math.min(spendCap,Math.max(0,Number(profile.fixed?.[cur])||0));
    if(price>available)return {ok:false,reason:'Capital disponível insuficiente'};
    if(price>maxByPct)return {ok:false,reason:'Excede limite por operação'};
    if(price>spendCap)return {ok:false,reason:mode==='fixed'?'Excede gasto fixo desta conta':'Excede percentual de gasto desta conta'};
    if(this.positions(true).filter(x=>x.mode==='real'&&x.slot===slot).length>=Number(strategy.maxOpen||5))return {ok:false,reason:'Limite de posições abertas atingido'};
    const target=s.dailyProfitTarget;if(target?.enabled&&target.currency===cur&&summary.todayPnl>=Number(target.amount||0))return {ok:false,reason:'Meta diária de lucro atingida'};
    if(summary.base>0&&summary.currentPnl<=-summary.base*(Number(s.liveSafety.lossPausePct)||5)/100)return {ok:false,reason:'Pausa de risco: perda diária mais estimativa em aberto atingiu o limite'};
    const maxLoss=Number(s.maxDailyLoss[cur])||0;if(maxLoss>0&&summary.currentPnl<=-maxLoss)return {ok:false,reason:'Limite diário de perda atingido (inclui posições em aberto)'};
    const now=Date.now(),realTrades=this.trades().filter(x=>x.mode==='real').sort((a,b)=>(Number(b.at)||0)-(Number(a.at)||0)),globalLimit=Math.max(2,Number(s.liveSafety?.globalLossStreakLimit)||3),globalCooldown=Math.max(60000,Number(s.liveSafety?.globalLossCooldownMs)||7200000);let globalStreak=0,lastGlobalLossAt=0;for(const t of realTrades){if(Number(t.pnl)<0){globalStreak++;lastGlobalLossAt=Math.max(lastGlobalLossAt,Number(t.at)||0);}else break;}if(globalStreak>=globalLimit&&now-lastGlobalLossAt<globalCooldown)return {ok:false,reason:`Circuit breaker: ${globalStreak} perdas seguidas`};
    const assetKey=String(opportunity.assetId||opportunity.name||''),assetLimit=Math.max(1,Number(s.liveSafety?.assetLossStreakLimit)||2),assetCooldown=Math.max(60000,Number(s.liveSafety?.assetLossCooldownMs)||21600000),assetTrades=realTrades.filter(t=>Number(t.slot)===Number(slot)&&t.currency===cur&&String(t.asset_id||t.name||'')===assetKey);let assetStreak=0,lastAssetLossAt=0;for(const t of assetTrades){if(Number(t.pnl)<0){assetStreak++;lastAssetLossAt=Math.max(lastAssetLossAt,Number(t.at)||0);}else break;}if(assetStreak>=assetLimit&&now-lastAssetLossAt<assetCooldown)return {ok:false,reason:`Ativo em cooldown: ${assetStreak} perdas seguidas`};
    return {ok:true,reason:'Risco aprovado',available,maxByPct,spendCap,spendMode:mode,strategyId:strategy.id,globalLossStreak:globalStreak,assetLossStreak:assetStreak};
  }
  accountSummary(slot,currency='gems',mode='real'){
    const base=Number(this.settings.bankrolls?.[slot]?.[currency])||0,trades=this.trades().filter(x=>x.mode===mode&&Number(x.slot)===slot&&x.currency===currency),positions=this.positions(true).filter(x=>x.mode===mode&&Number(x.slot)===slot&&x.currency===currency),realized=trades.reduce((a,x)=>a+(Number(x.pnl)||0),0),positive=trades.reduce((a,x)=>a+Math.max(0,Number(x.pnl)||0),0),locked=positive*clamp(this.settings.profitLockPercent,0,100)/100,feePct=Math.max(0,Number(this.settings.feePct?.[currency])||0),unrealized=positions.reduce((a,x)=>{const qty=Number(x.qty)||1,entry=(Number(x.entry)||0)*qty,mark=(Number(x.mark)||Number(x.entry)||0)*qty,projectedFee=mark*feePct/100;return a+(mark-entry-projectedFee);},0),inPositions=positions.reduce((a,x)=>a+(Number(x.entry)||0)*(Number(x.qty)||1),0),reinvested=Math.max(0,positive-locked),operational=Math.max(0,base+realized-locked),reserve=Number(this.settings.reserve[currency])||0,available=Math.max(0,operational-inPositions-reserve),day=nowDay(Date.now()),today=trades.filter(x=>nowDay(Number(x.at)||0)===day),todayPnl=today.reduce((a,x)=>a+(Number(x.pnl)||0),0),currentPnl=todayPnl+unrealized,wins=trades.filter(x=>Number(x.pnl)>0).length;
    return {slot,currency,base,realized,unrealized,totalPnl:realized+unrealized,locked,reinvested,operational,inPositions,reserve,available,todayPnl,currentPnl,feePct,trades:trades.length,wins,winRate:trades.length?wins/trades.length*100:0};
  }
  strategyRanking(currency='gems'){const trades=this.trades().filter(x=>x.mode==='real'&&x.currency===currency),by=new Map();for(const t of trades){const k=t.strategy||'unknown',r=by.get(k)||{id:k,trades:0,pnl:0,wins:0,holdMs:0,capitalTime:0};r.trades++;r.pnl+=Number(t.pnl)||0;if(Number(t.pnl)>0)r.wins++;r.holdMs+=Number(t.hold_ms)||0;r.capitalTime+=(Number(t.entry)||0)*(Number(t.hold_ms)||0);by.set(k,r);}return [...by.values()].map(r=>({...r,winRate:r.trades?r.wins/r.trades*100:0,profitPerHour:r.holdMs>0?r.pnl/(r.holdMs/3600000):0})).sort((a,b)=>b.pnl-a.pnl);}
  accountRanking(currency='gems'){return Array.from({length:4},(_,slot)=>this.accountSummary(slot,currency)).sort((a,b)=>b.totalPnl-a.totalPnl);}
  performanceByHour(currency='gems'){const buckets=Array.from({length:24},(_,hour)=>({hour,trades:0,pnl:0,wins:0}));for(const t of this.trades()){if(t.mode!=='real'||t.currency!==currency)continue;const b=buckets[new Date(Number(t.at)||0).getHours()];b.trades++;b.pnl+=Number(t.pnl)||0;if(Number(t.pnl)>0)b.wins++;}return buckets.map(x=>({...x,winRate:x.trades?x.wins/x.trades*100:0}));}
  performanceByAsset(currency='gems',limit=30){const m=new Map();for(const t of this.trades()){if(t.mode!=='real'||t.currency!==currency)continue;const k=t.asset_id||t.name||'desconhecido',x=m.get(k)||{assetId:k,name:t.name||k,trades:0,pnl:0,wins:0};x.trades++;x.pnl+=Number(t.pnl)||0;if(Number(t.pnl)>0)x.wins++;m.set(k,x);}return [...m.values()].map(x=>({...x,winRate:x.trades?x.wins/x.trades*100:0})).sort((a,b)=>b.pnl-a.pnl).slice(0,limit);}
  marketHeatmap(currency='gems',limit=20){let rows;if(this.db)rows=this.db.prepare('SELECT asset_id,name,COUNT(*) observations,AVG(price) avg_price,MIN(price) min_price,MAX(price) max_price,AVG(liquidity) liquidity,MAX(at) last_at FROM alpha_market WHERE currency=? AND at>=? GROUP BY asset_id,name ORDER BY observations DESC LIMIT ?').all(currency,Date.now()-7*86400000,limit);else{const m=new Map();for(const x of this.fallback.data.market.filter(x=>x.currency===currency&&x.at>=Date.now()-7*86400000)){const k=x.assetId||x.name,r=m.get(k)||{asset_id:x.assetId,name:x.name,observations:0,prices:[],liquidity:0,last_at:0};r.observations++;r.prices.push(x.price);r.liquidity+=x.liquidity||0;r.last_at=Math.max(r.last_at,x.at);m.set(k,r);}rows=[...m.values()].map(r=>({...r,avg_price:r.prices.reduce((a,b)=>a+b,0)/r.prices.length,min_price:Math.min(...r.prices),max_price:Math.max(...r.prices),liquidity:r.liquidity/r.observations})).sort((a,b)=>b.observations-a.observations).slice(0,limit);}return rows;}
  equityCurve(currency='gems',limit=500){const trades=this.trades().filter(x=>x.mode==='real'&&x.currency===currency).sort((a,b)=>a.at-b.at);const base=this.settings.bankrolls.reduce((a,x)=>a+(Number(x[currency])||0),0);let pnl=0;const out=[{at:trades[0]?.at||Date.now(),equity:base,pnl:0}];for(const t of trades){pnl+=Number(t.pnl)||0;out.push({at:Number(t.at)||Date.now(),equity:base+pnl,pnl});}return out.slice(-limit);}
  view(){
    const positions=this.positions(true),trades=this.trades(),gems=Array.from({length:4},(_,i)=>this.accountSummary(i,'gems')),coins=Array.from({length:4},(_,i)=>this.accountSummary(i,'coins'));
    return {professional:this.professionalView(),paperAccounts:{gems:Array.from({length:4},(_,i)=>this.accountSummary(i,'gems','paper')),coins:Array.from({length:4},(_,i)=>this.accountSummary(i,'coins','paper'))},settings:deepClone(this.settings),validation:deepClone(this.validation),positions:positions.slice(0,100),recentTrades:trades.slice(0,100),marketActions:this.recentMarketActions(120),ownListings:deepClone(this.ownListings),accounts:{gems,coins},rankings:{gems:this.accountRanking('gems'),coins:this.accountRanking('coins'),strategies:this.strategyRanking(),strategiesGems:this.strategyRanking('gems'),strategiesCoins:this.strategyRanking('coins')},heatmap:{gems:this.marketHeatmap('gems'),coins:this.marketHeatmap('coins')},performance:{hoursGems:this.performanceByHour('gems'),assetsGems:this.performanceByAsset('gems'),hoursCoins:this.performanceByHour('coins'),assetsCoins:this.performanceByAsset('coins')},equity:{gems:this.equityCurve('gems'),coins:this.equityCurve('coins')},features:{profitLock:true,markToMarket:true,opportunityHeatmap:true,autoRepricing:'live-guarded',strategyLab:true,backtestReplay:'data-ready',tradeJournal:true,marketRegime:'data-ready',opportunityAging:true,emergencyKillSwitch:true,goalMode:true,dailyProfitTarget:true,auditLog:true,paperVsReal:true,championAccount:true,equityCurve:true,performanceByHour:true,performanceByAsset:true,autoReserve:true,profitPerHour:true,capitalBootstrap:true,crossMarket:true,webSocketMarket:true,criticalMarketJournal:true,ownListings:true,paperDesk:true,semiAutoApprovalPreview:true,liveExecution:'confirm-semi-auto',autoMarketInspection:'background-read-only',fullAutopilot:true,autoMarketNavigation:true,smartBankroll:true,passiveMarketProbe:true,runtimeMarketHealth:true,failClosedAutopilot:true,serverClockCooldown:true}};
  }
  proState(){
    if(this._proState)return this._proState;let state=null;
    try{state=this.db?JSON.parse(this.db.prepare('SELECT value FROM alpha_kv WHERE key=?').get('professional')?.value||'null'):this.fallback.data.professional;}catch{}
    return this._proState=state||{orders:[],ownSnapshots:{},unmatchedSales:[]};
  }
  saveProState(state){const value=JSON.stringify(state);if(this.db)this.db.prepare('INSERT INTO alpha_kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('professional',value);else{this.fallback.data.professional=state;this.fallback.save();}this._proState=state;}
  beginOrder(slot,action,payload){const state=this.proState(),order={id:uid(),slot,action,payload,at:Date.now(),status:'prepared',sentAt:0};state.orders.push(order);state.orders=state.orders.filter(x=>!['confirmed','failed'].includes(x.status)).concat(state.orders.filter(x=>['confirmed','failed'].includes(x.status)).slice(-200));this.saveProState(state);return order;}
  updateOrder(id,patch){const state=this.proState(),order=state.orders.find(x=>x.id===id);if(order){Object.assign(order,patch,{updatedAt:Date.now()});this.saveProState(state);}return order;}
  pendingOrders(slot=null){return this.proState().orders.filter(x=>!['confirmed','failed'].includes(x.status)&&(slot===null||Number(x.slot)===Number(slot)));}
  decision(slot,reason,extra={}){this._decisions=this._decisions||this.proState().decisions||[];const last=this._decisions.find(x=>x.slot===slot);if(last?.reason===reason&&Date.now()-last.at<30000)return;this._decisions.unshift({at:Date.now(),slot,reason,...extra});this._decisions=this._decisions.slice(0,40);const state=this.proState();state.decisions=this._decisions;this.saveProState(state);}
  professionalView(){const state=this.proState();return {policy:Professional.policy(this.settings),profile:this.settings.professional?.profile||'balanced',coverage:Object.fromEntries([...Professional.allocateListings(this.positions(true),this.ownListings)].map(([id,x])=>[id,{covered:x.covered,uncoveredQty:x.uncoveredQty}])),pending:this.pendingOrders().map(x=>({id:x.id,slot:x.slot,action:x.action,status:x.status,at:x.at,sentAt:x.sentAt,name:x.payload?.listing?.name||x.payload?.name||'',reason:x.reason||''})),decisions:this._decisions||state.decisions||[],unmatchedSales:state.unmatchedSales||[],ownSnapshots:state.ownSnapshots||{},periods:Object.fromEntries(['coins','gems'].map(currency=>[currency,Object.fromEntries([['today',null],['week',7],['month',30]].map(([name,days])=>[name,Professional.performance(days===null?this.trades().filter(t=>nowDay(Number(t.at))===nowDay(Date.now())):this.trades(),currency,days===null?0:Date.now()-days*86400000)]))])),metrics:{coins:Professional.performance(this.trades(),'coins'),gems:Professional.performance(this.trades(),'gems')}};}
  recentAudit(limit=100){if(this.db)return this.db.prepare('SELECT * FROM alpha_audit ORDER BY at DESC LIMIT ?').all(Math.max(1,Math.min(1000,Number(limit)||100)));return this.fallback.data.audit.slice(-limit).reverse();}
}
module.exports={AlphaEngine,DEFAULT_SETTINGS,DEFAULT_STRATEGIES,median};
