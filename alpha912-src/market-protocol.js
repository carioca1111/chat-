'use strict';

const asNum=v=>Number.isFinite(Number(v))?Number(v):null;
const gameCurrency=v=>String(v||'').toLowerCase()==='orb'?'gems':String(v||'').toLowerCase()==='gold'?'coins':String(v||'').toLowerCase();
const sameId=(a,b)=>String(a??'')===String(b??'');

function normalizePokemonFicha(f={}){
  if(!f||typeof f!=='object')return null;
  const ivs=f.ivs&&typeof f.ivs==='object'?{...f.ivs}:null;
  const ivTotal=asNum(f.ivTotal)!==null?asNum(f.ivTotal):(ivs?Object.values(ivs).reduce((a,x)=>a+(Number(x)||0),0):null);
  return {
    id:f.id??null,speciesId:f.speciesId??null,name:f.nome||f.apelido||'',nickname:f.apelido||null,
    level:asNum(f.level),power:asNum(f.poder),potency:asNum(f.potencia),quality:asNum(f.quality),grade:asNum(f.nota),
    ivTotal,ivs,stats:f.stats&&typeof f.stats==='object'?{...f.stats}:null,
    shiny:f.shiny===true,tmElemental:f.tmElemental??null,tmAoe:f.tmAoe===true,refinementTotal:asNum(f.refinoTotal),
    caughtAt:asNum(f.caughtAt),caughtBy:f.caughtBy??null,types:Array.isArray(f.tipos)?f.tipos.slice(0,4):[]
  };
}
function normalizeListing(row,slot,at=Date.now()){
  if(!row||typeof row!=='object')return null;
  const price=asNum(row.preco),currency=gameCurrency(row.moeda);
  if(!(price>0)||!['gems','coins'].includes(currency))return null;
  const pokemon=normalizePokemonFicha(row.ficha);
  const assetType=String(row.tipo||(row.pokemonId?'pokemon':row.itemId?'item':'unknown'));
  const assetId=String(row.pokemonId||row.itemId||pokemon?.speciesId||'');
  const name=pokemon?.name||row.ficha?.nome||row.nome||row.itemNome||`${assetType==='item'?'Item':'Ativo'} ${assetId||row.id||''}`.trim();
  return {
    at,slot,listingId:String(row.id??''),assetType,assetId,name,currency,price,qty:Math.max(1,asNum(row.qtd)||1),
    seller:row.vendedor||'',sellerId:row.vendedorId??null,availableAt:asNum(row.compravelEm),expiresAt:asNum(row.expiraEm),
    favorites:asNum(row.favoritos)||0,liquidity:0.5,pokemon,
    metadata:{source:'websocket-market',state:row.estado||'',createdAt:asNum(row.criadoEm),buyer:row.comprador??null,itemId:row.itemId??null,pokemonId:row.pokemonId??null}
  };
}
function normalizeOwnListing(row,slot,at=Date.now(),serverOffsetMs=0){
  const n=normalizeListing(row,slot,at);if(!n)return null;
  const created=asNum(row.criadoEm),available=asNum(row.compravelEm),offset=Number(serverOffsetMs)||0,serverNow=at+offset;
  return {...n,serverOffsetMs:offset,cooldownMs:available&&created?Math.max(0,available-created):(available?Math.max(0,available-serverNow):null),remainingCooldownMs:available?Math.max(0,available-serverNow):0};
}
function mergeAccountState(target={},src={}){
  if(!src||typeof src!=='object')return target;
  const map=[['id','id'],['nick','nick'],['level','level'],['xp','xp'],['xpNivel','xpLevel'],['xpProximo','xpNext'],['gold','gold'],['orbs','gems'],['diamonds','diamonds'],['huntSlug','huntSlug'],['outlandTier','outlandTier'],['servidorAgora','serverNow']];
  for(const [from,to] of map)if(src[from]!==undefined)target[to]=src[from];
  if(Array.isArray(src.pkMud))target.pokemonUpdates=mergePokemonUpdates(target.pokemonUpdates||[],src.pkMud);
  if(src.activeId!==undefined)target.activePokemonId=src.activeId;
  return target;
}
function mergePokemonUpdates(existing=[],updates=[]){const map=new Map(existing.map(x=>[String(x.id),x]));for(const raw of updates||[]){const p=normalizePokemonFicha(raw);if(p?.id!==null)map.set(String(p.id),p);}return [...map.values()].slice(-80);}
function marketSummaryRows(payload={}){
  const resumo=payload.resumo&&typeof payload.resumo==='object'?payload.resumo:{},medias=payload.medias&&typeof payload.medias==='object'?payload.medias:{};
  const ids=new Set([...Object.keys(resumo),...Object.keys(medias)]),rows=[];
  for(const id of ids){const r=resumo[id]||{},m=medias[id]||{},minGold=asNum(r.minGold),minGem=asNum(r.minOrb),avgGold=asNum(m.gold?.media),avgGem=asNum(m.orb?.media),goldUnits=asNum(m.gold?.unidades)||0,gemUnits=asNum(m.orb?.unidades)||0;rows.push({assetId:String(id),listings:asNum(r.anuncios)||0,units:asNum(r.unidades)||0,minCoins:minGold,minGems:minGem,avgCoins:avgGold,avgGems:avgGem,goldUnits,gemUnits,impliedMinCoinsPerGem:minGold>0&&minGem>0?minGold/minGem:null,impliedAvgCoinsPerGem:avgGold>0&&avgGem>0?avgGold/avgGem:null});}
  return rows;
}
function crossMarketPairs(listings=[]){const groups=new Map();for(const l of listings){const key=`${l.assetType}:${l.assetId||l.name}`,g=groups.get(key)||{key,name:l.name,assetType:l.assetType,assetId:l.assetId,coins:[],gems:[]};g[l.currency]?.push(l);groups.set(key,g);}const out=[];for(const g of groups.values()){if(!g.coins.length||!g.gems.length)continue;const coin=Math.min(...g.coins.map(x=>x.price)),gem=Math.min(...g.gems.map(x=>x.price));if(!(coin>0&&gem>0))continue;out.push({name:g.name,assetType:g.assetType,assetId:g.assetId,minCoins:coin,minGems:gem,coinsPerGem:coin/gem,coinListings:g.coins.length,gemListings:g.gems.length});}return out.sort((a,b)=>a.coinsPerGem-b.coinsPerGem).slice(0,100);}
function summarizeHuntTelemetry(events=[]){const kills=[],drops=new Map();let gold=0,xp=0,first=null,last=null,huntSlug='',nick='',level=null;for(const e of events){const p=e?.postData;if(!p||typeof p!=='object')continue;if(p.t==='welcome'&&p.estado){huntSlug=p.estado.huntSlug||huntSlug;nick=p.estado.nick||nick;level=p.estado.level??level;}if(p.t==='estado'&&p.estado){huntSlug=p.estado.huntSlug||huntSlug;level=p.estado.level??level;}if(p.t!=='batalha'||!Array.isArray(p.ev))continue;for(const ev of p.ev){if(ev?.k!=='morte'||ev.quem!=='selvagem')continue;const at=Number(e.at)||Date.now();first=first===null?at:Math.min(first,at);last=last===null?at:Math.max(last,at);kills.push({at,name:ev.nome||'',gold:asNum(ev.ouro)||0,xp:asNum(ev.xpTreinador)||0});gold+=asNum(ev.ouro)||0;xp+=asNum(ev.xpTreinador)||0;for(const d of ev.drops||[])drops.set(d.nome,(drops.get(d.nome)||0)+(asNum(d.qtd)||0));}}const windowMs=first!==null&&last!==null?Math.max(60000,last-first):0,rate=n=>windowMs>0?n*3600000/windowMs:0;return {nick,huntSlug,level,kills:kills.length,windowMs,killsPerHour:rate(kills.length),goldPerHour:rate(gold),xpPerHour:rate(xp),gold,xp,drops:[...drops.entries()].map(([name,qty])=>({name,qty})).sort((a,b)=>b.qty-a.qty).slice(0,25)};}

function actionKey(slot,at,action,listingId='',extra=''){return `${slot}:${Number(at)||0}:${action}:${listingId}:${extra}`;}
function analyzeProtocolEvents(events=[],slot=0){
  const sorted=[...events].sort((a,b)=>(Number(a.at)||0)-(Number(b.at)||0));
  const validation={marketProtocolMapped:false,marketSearchMapped:false,marketListingsMapped:false,buyRequestMapped:false,liveBuyValidated:false,sellRequestMapped:false,createListingValidated:false,cancelRequestMapped:false,cancelValidated:false,liveSellValidated:false,autoRepricingValidated:false,stateProtocolMapped:false,ownListingsMapped:false};
  const listings=[],species=[],summaries=[],buyAttempts=[],warnings=[],actions=[];const account={slot,pokemonUpdates:[]};let ownListings=[],ownListingsAt=0,ownListingsComplete=false,lastBuy=null,pendingCreate=null,pendingEdit=null,pendingCancel=null,serverOffsetMs=0;
  const addAction=(e,action,status,data={})=>{const at=Number(e?.at)||Date.now(),listingId=String(data.listingId??data.id??'');actions.push({eventKey:actionKey(slot,at,action,listingId,status)+':'+actions.filter(x=>x.at===at&&x.action===action&&x.status===status).length,at,slot,action,status,listingId,currency:data.currency||gameCurrency(data.moeda),price:asNum(data.price??data.preco),qty:asNum(data.qty??data.qtd),name:data.name||data.descricao||'',assetType:data.assetType||data.tipo||'',assetId:String(data.assetId??data.itemId??data.pokemonId??''),availableAt:asNum(data.availableAt??data.compravelEm),data});};
  for(const e of sorted){const p=e?.postData;if(!p||typeof p!=='object')continue;
    if(e.method==='SEND'){
      const t=String(p.t||'');if(t.startsWith('market.'))validation.marketProtocolMapped=true;
      if(t==='market.especies')validation.marketSearchMapped=true;if(t==='market.listar'||t==='market.itens')validation.marketListingsMapped=true;
      if(t==='market.comprar'){validation.buyRequestMapped=true;lastBuy={at:Number(e.at)||Date.now(),listingId:String(p.id??''),qty:asNum(p.qtd)||1,price:asNum(p.preco),currency:gameCurrency(p.moeda),status:'attempted',message:''};buyAttempts.push(lastBuy);addAction(e,'buy','attempted',{listingId:p.id,qty:p.qtd,price:p.preco,moeda:p.moeda});}
      if(t==='market.criar'){validation.sellRequestMapped=true;pendingCreate={at:Number(e.at)||Date.now(),...p};addAction(e,'create','attempted',{...p,listingId:''});}
      if(t==='market.editar'){pendingEdit={at:Number(e.at)||Date.now(),id:p.id,preco:asNum(p.preco),moeda:p.moeda};addAction(e,'reprice','attempted',{listingId:p.id,price:p.preco,moeda:p.moeda});}
      if(t==='market.cancelar'){validation.cancelRequestMapped=true;pendingCancel={at:Number(e.at)||Date.now(),id:p.id};addAction(e,'cancel','attempted',{listingId:p.id});}
    }
    if(e.method==='RECV'){
      if(p.t==='welcome'&&p.estado){mergeAccountState(account,p.estado);account.balanceTimes={...(account.balanceTimes||{})};for(const [field,key] of [['gold','gold'],['orbs','gems'],['diamonds','diamonds']])if(p.estado[field]!=null)account.balanceTimes[key]=Number(e.at)||Date.now();if(p.estado.gold!=null||p.estado.ouro!=null||p.estado.gems!=null||p.estado.orbs!=null)account.balanceObservedAt=Number(e.at)||Date.now();if(asNum(p.estado.servidorAgora)!==null)serverOffsetMs=Number(p.estado.servidorAgora)-(Number(e.at)||Date.now());account.serverOffsetMs=serverOffsetMs;validation.stateProtocolMapped=true;}if(p.t==='estado'&&p.estado){mergeAccountState(account,p.estado);account.balanceTimes={...(account.balanceTimes||{})};for(const [field,key] of [['gold','gold'],['orbs','gems'],['diamonds','diamonds']])if(p.estado[field]!=null)account.balanceTimes[key]=Number(e.at)||Date.now();if(p.estado.gold!=null||p.estado.ouro!=null||p.estado.gems!=null||p.estado.orbs!=null)account.balanceObservedAt=Number(e.at)||Date.now();if(asNum(p.estado.servidorAgora)!==null)serverOffsetMs=Number(p.estado.servidorAgora)-(Number(e.at)||Date.now());account.serverOffsetMs=serverOffsetMs;validation.stateProtocolMapped=true;}
      if(p.t==='market'){
        validation.marketProtocolMapped=true;
        {const arrays=[];for(const key of ['linhas','anuncios','lista','ofertas'])if(Array.isArray(p[key]))arrays.push(...p[key]);if(!['meus','especies'].includes(String(p.aba||''))&&arrays.length){let found=0;for(const row of arrays){const real=row&&row.id!=null&&Number(row.preco)>0&&['gold','orb'].includes(String(row.moeda||'').toLowerCase())&&(row.itemId!=null||row.pokemonId!=null||row.ficha||row.tipo);if(!real)continue;const n=normalizeListing(row,slot,Number(e.at)||Date.now());if(n&&n.listingId){listings.push(n);found++;}}if(found>0)validation.marketListingsMapped=true;}}
        if(p.aba==='especies'&&Array.isArray(p.linhas))for(const row of p.linhas)species.push({at:Number(e.at)||Date.now(),slot,speciesId:String(row.speciesId??''),name:row.nome||'',listings:asNum(row.anuncios)||0,shinies:asNum(row.shinys)||0,minCoins:asNum(row.minGold),minGems:asNum(row.minOrb),hasP5:row.temP5===true,types:Array.isArray(row.tipos)?row.tipos:[]});
        if(p.aba==='itens'&&(p.resumo||p.medias))summaries.push(...marketSummaryRows(p).map(x=>({...x,at:Number(e.at)||Date.now(),slot})));
        if(p.aba==='criado'&&p.anuncio){validation.sellRequestMapped=true;validation.createListingValidated=true;const n=normalizeOwnListing(p.anuncio,slot,Number(e.at)||Date.now(),serverOffsetMs);if(n){ownListings=ownListings.filter(x=>String(x.listingId)!==String(n.listingId)).concat(n);addAction(e,'create','success',{listingId:n.listingId,price:n.price,currency:n.currency,qty:n.qty,name:n.name,assetType:n.assetType,assetId:n.assetId,availableAt:n.availableAt,cooldownMs:n.cooldownMs});}pendingCreate=null;}
        if(p.aba==='meus'&&Array.isArray(p.linhas)){validation.ownListingsMapped=true;ownListingsAt=Number(e.at)||Date.now();ownListingsComplete=true;ownListings=p.linhas.map(row=>normalizeOwnListing(row,slot,Number(e.at)||Date.now(),serverOffsetMs)).filter(Boolean);if(pendingEdit){const found=ownListings.find(x=>sameId(x.listingId,pendingEdit.id));if(found&&Number(found.price)===Number(pendingEdit.preco)){validation.autoRepricingValidated=true;addAction(e,'reprice','success',{listingId:found.listingId,price:found.price,currency:found.currency,name:found.name,assetType:found.assetType,assetId:found.assetId,availableAt:found.availableAt,cooldownMs:found.cooldownMs});pendingEdit=null;}}}
      }
      if(p.t==='batalha'&&Array.isArray(p.ev))for(const ev of p.ev){
        if(ev?.k==='marketComprado'){validation.liveBuyValidated=true;if(lastBuy){lastBuy.status='success';lastBuy.message=ev.descricao||'marketComprado';}addAction(e,'buy','success',{listingId:lastBuy?.listingId||'',price:ev.total??lastBuy?.price,currency:gameCurrency(ev.moeda)||lastBuy?.currency,qty:lastBuy?.qty||1,name:ev.descricao||'',locked:ev.trancado===true,remaining:ev.sobra});}
        else if(ev?.k==='marketVendido'){validation.liveSellValidated=true;addAction(e,'sale','success',{name:ev.descricao||'',price:ev.valor,currency:gameCurrency(ev.moeda),gross:ev.bruto,listingId:ev.anuncioId||ev.marketId||'',assetId:ev.itemId||ev.pokemonId||'',assetType:ev.tipo||'',qty:ev.qtd});}
        else if(ev?.k==='marketCriado'){validation.sellRequestMapped=true;validation.createListingValidated=true;addAction(e,'create-receipt','success',{name:ev.descricao||'',price:ev.preco,currency:gameCurrency(ev.moeda),fee:ev.taxa});}
        else if(ev?.k==='marketCancelado'){validation.cancelRequestMapped=true;validation.cancelValidated=true;addAction(e,'cancel','success',{listingId:pendingCancel?.id||'',name:ev.descricao||''});pendingCancel=null;}
        else if(ev?.k==='aviso'){const msg=String(ev.msg||'');warnings.push(msg);if(lastBuy&&Math.abs((Number(e.at)||0)-lastBuy.at)<=7000){lastBuy.message=msg;if(/insuficiente|indispon[ií]vel|expir|vendid|preço|preco|falh|erro|trava/i.test(msg))lastBuy.status='failed';else if(/comprad|adquirid|sucesso/i.test(msg)){lastBuy.status='success';validation.liveBuyValidated=true;}}}
      }
    }
  }
  const unique=new Map();for(const l of listings)unique.set(`${l.slot}:${l.listingId}`,l);const list=[...unique.values()];
  return {slot,validation,account,listings:list,species,summaries,buyAttempts,warnings,ownListings,ownListingsAt,ownListingsComplete,actions:actions.slice(-250),crossMarket:crossMarketPairs(list),hunt:summarizeHuntTelemetry(sorted)};
}
function mergeValidation(items=[]){const keys=['marketProtocolMapped','marketSearchMapped','marketListingsMapped','buyRequestMapped','liveBuyValidated','sellRequestMapped','createListingValidated','cancelRequestMapped','cancelValidated','liveSellValidated','autoRepricingValidated','stateProtocolMapped','ownListingsMapped'],out={};for(const k of keys)out[k]=items.some(x=>x?.validation?.[k]===true);return out;}

module.exports={gameCurrency,normalizePokemonFicha,normalizeListing,normalizeOwnListing,marketSummaryRows,crossMarketPairs,summarizeHuntTelemetry,analyzeProtocolEvents,mergeValidation};
