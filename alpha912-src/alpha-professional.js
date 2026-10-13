'use strict';
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const med=values=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const key=x=>[x.assetType||x.asset_type,x.assetId||x.asset_id||x.name,x.currency].join(':');
const PRESETS={defensive:{maxExposurePct:40,maxAssetPct:15,cashReservePct:25,stressPct:6,minSamples:10,minSellers:3},balanced:{maxExposurePct:50,maxAssetPct:20,cashReservePct:20,stressPct:4,minSamples:8,minSellers:2},growth:{maxExposurePct:60,maxAssetPct:25,cashReservePct:15,stressPct:3,minSamples:8,minSellers:2}};
function policy(settings={}){return {...PRESETS[settings.professional?.profile]||PRESETS.balanced};}
function saleCommission(gross,currency,type='item'){
 const value=Math.max(0,n(gross));
 return currency==='gems'&&type==='pokemon'?Math.min(value,500)*.13+Math.min(Math.max(0,value-500),4500)*.10+Math.max(0,value-5000)*.075:value*.15;
}
function marketRulesGuard(listing,slot,ownLists=[],actions=[],snapshots={},now=Date.now()){
 const own=ownLists[slot]||[],same=x=>(x.assetType||x.asset_type)===(listing.assetType||listing.asset_type)&&String(x.assetId||x.asset_id)===String(listing.assetId||listing.asset_id);
 let reason='Regras do Market conferidas';
 if(listing.assetType==='pokemon')reason='Revenda automática de Pokémon aguarda confirmação da tarifa em Coins; capital preservado';
 else if(!snapshots[slot]||now-Number(snapshots[slot])>90000)reason='Aguardando Meus anúncios atualizado para conferir vagas e duplicidade';
 else if(own.length>=20)reason='As 20 vagas de anúncios desta conta estão ocupadas';
 else if(own.some(same))reason='Este ativo já tem anúncio nesta conta; aguardando venda antes de comprar/relistar';
 else if(actions.some(x=>Number(x.slot)===Number(slot)&&['sale','cancel'].includes(x.action)&&x.status==='success'&&now-Number(x.at)<1800000&&(same(x)||!x.assetId&&normalizeSaleName(x.name)===normalizeSaleName(listing.name)||x.listingId&&own.some(y=>String(y.listingId)===String(x.listingId)&&same(y)))))reason='Cooldown de 30 minutos após venda/cancelamento deste ativo';
 return {ok:reason==='Regras do Market conferidas',reason};
}
function assessMarket(listing,evaluation,history=[],trades=[],settings={},now=Date.now()){
 const p=policy(settings),reasons=[],fresh=history.filter(x=>n(x.at)>now-86400000&&n(x.price)>0),samples=new Set(fresh.map(x=>String(x.listing_id||x.listingId||'')).filter(Boolean)).size;
 const fee=n(settings.feePct?.[listing.currency]),target=n(evaluation.target),stressExit=target*(1-p.stressPct/100),stressProfit=stressExit*(1-fee/100)-n(listing.price),stressRoi=n(listing.price)>0?stressProfit/n(listing.price)*100:0;
 const recent=fresh.filter(x=>n(x.at)>now-300000),older=fresh.filter(x=>n(x.at)<=now-300000),recentMedian=med(recent.map(x=>n(x.price))),olderMedian=med(older.map(x=>n(x.price))),trendPct=olderMedian&&recent.length>=3&&older.length>=3?(recentMedian/olderMedian-1)*100:null;
 const realized=trades.filter(t=>t.mode==='real'&&key(t)===key(listing)).sort((a,b)=>n(b.at)-n(a.at)).slice(0,10),lossEvidence=realized.length>=5&&realized.reduce((s,t)=>s+n(t.pnl),0)<0&&now-n(realized[0].at)<21600000;
 if(samples<p.minSamples)reasons.push(`Aprendendo o preço: ${samples}/${p.minSamples} anúncios distintos observados`);
 if(n(listing.bookSellers)<p.minSellers)reasons.push(`Poucos vendedores independentes: ${n(listing.bookSellers)}/${p.minSellers}`);
 if(stressProfit<=0)reasons.push(`A margem desaparece se o preço cair ${p.stressPct}%`);
 if(trendPct!==null&&trendPct< -8)reasons.push(`Preço em queda: ${trendPct.toFixed(1)}% frente ao histórico anterior`);
 if(lossEvidence)reasons.push('Este ativo teve resultado líquido negativo nas últimas vendas; pausa de 6h');
 return {ok:reasons.length===0,reasons,samples,stressExit,stressProfit,stressRoi,trendPct,independentSellers:n(listing.bookSellers),salesObserved:realized.length,liquidityNote:'Anúncios são ofertas; não comprovam compradores nem prazo de venda.',profile:settings.professional?.profile||'balanced'};
}
function portfolioGuard(listing,slot,positions,summary,settings={},now=Date.now()){
 const p=policy(settings),rows=positions.filter(x=>x.mode==='real'&&x.status==='open'&&Number(x.slot)===Number(slot)&&x.currency===listing.currency),base=n(summary.operational),cost=n(listing.price)*Math.max(1,n(listing.qtyToBuy)||1),exposure=rows.reduce((s,x)=>s+n(x.entry)*n(x.qty||1),0),same=rows.filter(x=>key(x)===key(listing)),assetExposure=same.reduce((s,x)=>s+n(x.entry)*n(x.qty||1),0),limit=base*p.maxExposurePct/100,assetLimit=base*p.maxAssetPct/100;
 let reason='Capital e concentração aprovados';
 if(exposure+cost>limit)reason=`Limite de capital em itens: ${p.maxExposurePct}% da banca`;
 else if(assetExposure+cost>assetLimit)reason=`Limite por ativo: ${p.maxAssetPct}% da banca`;
 else if(n(summary.available)-cost<base*p.cashReservePct/100)reason=`Reserva mínima de ${p.cashReservePct}% protegida`;
 else if(same.some(x=>now-n(x.opened_at)>21600000))reason='Já há estoque deste ativo parado há mais de 6h; esperando vender';
 else if(rows.some(x=>['pending','recovering','unknown'].includes(x.metadata?.listingStatus)&&now-n(x.opened_at)>120000))reason='Resolva os anúncios pendentes desta conta antes de ampliar o estoque';
 return {ok:reason==='Capital e concentração aprovados',reason,exposure,assetExposure,limit,assetLimit,reservePct:p.cashReservePct};
}
function allocateListings(positions,ownListings){
 const allocations=new Map(),remaining=new Map();
 for(const list of ownListings||[])for(const row of list||[])if(row?.listingId)remaining.set(`${row.slot}:${row.listingId}`,Math.max(0,n(row.qty)||1));
 const rows=positions.filter(p=>p.mode==='real'&&p.status==='open').sort((a,b)=>n(a.opened_at)-n(b.opened_at));
 for(const p of rows){let needed=Math.max(1,n(p.qty)),matches=[];const own=(ownListings[Number(p.slot)]||[]).filter(x=>key(x)===key(p)).sort((a,b)=>(String(b.listingId)===String(p.metadata?.sellListingId))-(String(a.listingId)===String(p.metadata?.sellListingId)));
 for(const x of own){const k=`${x.slot}:${x.listingId}`,available=remaining.get(k)||0;if(!available)continue;const used=Math.min(needed,available);remaining.set(k,available-used);matches.push({listing:x,qty:used});needed-=used;if(!needed)break;}
 allocations.set(p.id,{covered:needed===0,uncoveredQty:needed,matches});}
 return allocations;
}
function performance(trades,currency,since=0){
 const rows=trades.filter(x=>x.mode==='real'&&x.currency===currency&&n(x.at)>=since).sort((a,b)=>n(a.at)-n(b.at)),wins=rows.filter(x=>n(x.pnl)>0),losses=rows.filter(x=>n(x.pnl)<0),profit=wins.reduce((s,x)=>s+n(x.pnl),0),loss=-losses.reduce((s,x)=>s+n(x.pnl),0);let running=0,peak=0,drawdown=0;
 for(const t of rows){running+=n(t.pnl);peak=Math.max(peak,running);drawdown=Math.max(drawdown,peak-running);}
 return {averageWin:wins.length?profit/wins.length:null,averageLoss:losses.length?loss/losses.length:null,unknownFeeCount:rows.filter(x=>x.metadata?.feeKnown===false).length,trades:rows.length,realized:running,fees:rows.reduce((s,x)=>s+n(x.fees),0),winRate:rows.length?wins.length/rows.length*100:null,expectancy:rows.length?running/rows.length:null,profitFactor:loss>0?profit/loss:null,maxDrawdown:drawdown,medianHoldMs:med(rows.map(x=>n(x.hold_ms))),sampleSufficient:rows.length>=30};
}
function normalizeSaleName(value){return String(value||'').trim().replace(/^\s*\d+\s*[x×]\s*/i,'').toLocaleLowerCase('pt-BR');}
function matchSale(action,positions,trades){
 if(action.action!=='sale'||action.status!=='success'||!action.eventKey)return {reason:'Sem confirmação de venda'};
 if(trades.some(t=>t.metadata?.serverSaleKey===action.eventKey))return {duplicate:true};
 const raw=action.data||{},qty=n(action.qty)||Number(String(action.name||'').match(/^\s*(\d+)\s*[x×]/i)?.[1])||1,net=Number(action.price),gross=Number(raw.gross),hasGross=Number.isFinite(gross)&&gross>0;
 if(!Number.isFinite(net)||net<=0||(hasGross&&gross<net))return {reason:'Valores de venda incompletos ou inconsistentes'};
 const matches=positions.filter(x=>x.mode==='real'&&x.status==='open'&&Number(x.slot)===Number(action.slot)&&x.currency===action.currency&&n(x.opened_at)<=n(action.at)&&n(x.qty)===qty&&(action.listingId?String(x.metadata?.sellListingId)===String(action.listingId):action.assetId?String(x.asset_id)===String(action.assetId)&&(!action.assetType||x.asset_type===action.assetType):normalizeSaleName(x.name)===normalizeSaleName(action.name)));
 if(matches.length!==1)return {reason:matches.length?'Mais de uma posição combina com a venda; aguardando identificação':'Venda sem posição correspondente; não altera seu lucro'};
 return {position:matches[0],exit:(hasGross?gross:net)/qty,fees:hasGross?gross-net:0,feeKnown:hasGross};
}
module.exports={saleCommission,marketRulesGuard,policy,PRESETS,assessMarket,portfolioGuard,allocateListings,performance,matchSale,key};
