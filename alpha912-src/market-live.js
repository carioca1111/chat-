'use strict';

const VALID_TYPES=new Set(['item','pokemon','caixa','casa','bicicleta']);
const gameCurrency=c=>c==='gems'||String(c).toLowerCase()==='orb'?'orb':'gold';
const finitePositive=v=>Number.isFinite(Number(v))&&Number(v)>0;
const intPositive=v=>Number.isInteger(Number(v))&&Number(v)>0;

function validateMarketCommand(input={}){
  const t=String(input.t||'');
  if(t==='market.comprar'){
    if(!intPositive(input.id)||!intPositive(input.qtd)||!finitePositive(input.preco))throw new Error('Compra inválida');
    if(!['gold','orb'].includes(String(input.moeda)))throw new Error('Moeda inválida');
    return {t,id:Number(input.id),qtd:Math.min(9999,Number(input.qtd)),preco:Number(input.preco),moeda:String(input.moeda)};
  }
  if(t==='market.editar'){
    if(!intPositive(input.id)||!finitePositive(input.preco))throw new Error('Repricing inválido');
    if(!['gold','orb'].includes(String(input.moeda)))throw new Error('Moeda inválida');
    return {t,id:Number(input.id),preco:Number(input.preco),moeda:String(input.moeda)};
  }
  if(t==='market.cancelar'){
    if(!intPositive(input.id))throw new Error('Cancelamento inválido');
    return {t,id:Number(input.id)};
  }
  if(t==='market.criar'){
    const tipo=String(input.tipo||'');if(!VALID_TYPES.has(tipo)||!finitePositive(input.preco))throw new Error('Anúncio inválido');
    if(!['gold','orb'].includes(String(input.moeda)))throw new Error('Moeda inválida');
    if(!intPositive(input.qtd))throw new Error('Quantidade do anúncio inválida');
    const out={t,tipo,itemId:null,pokemonId:null,caixaId:null,casaId:null,bicicletaId:null,qtd:Math.min(9999,Math.max(1,Number(input.qtd)||1)),preco:Number(input.preco),moeda:String(input.moeda),dias:input.dias??null};
    const key={item:'itemId',pokemon:'pokemonId',caixa:'caixaId',casa:'casaId',bicicleta:'bicicletaId'}[tipo];
    if(!intPositive(input[key]))throw new Error('ID do ativo inválido');out[key]=Number(input[key]);return out;
  }
  throw new Error('Comando de Market não permitido');
}
function buildBuyCommand(listing={}){return validateMarketCommand({t:'market.comprar',id:listing.listingId||listing.id,qtd:Math.max(1,Number(listing.qtyToBuy)||1),preco:listing.price,moeda:gameCurrency(listing.currency)});}
function buildCreateCommand(listing={},price,qty=1){
  const tipo=String(listing.assetType||'');const key={item:'itemId',pokemon:'pokemonId',caixa:'caixaId',casa:'casaId',bicicleta:'bicicletaId'}[tipo];if(!key)throw new Error('Tipo de ativo não suportado para venda automática');
  return validateMarketCommand({t:'market.criar',tipo,[key]:listing.assetId,qtd:qty,preco:price,moeda:gameCurrency(listing.currency),dias:null});
}
function buildEditCommand(listing={},price){return validateMarketCommand({t:'market.editar',id:listing.listingId||listing.id,preco:price,moeda:gameCurrency(listing.currency)});}
function buildCancelCommand(listing={}){return validateMarketCommand({t:'market.cancelar',id:listing.listingId||listing.id});}

const MARKET_BRIDGE_SOURCE="(()=>{try{if(window.__gridiumMarketBridgeInstalled){try{window.__gridiumFindGameSocket&&window.__gridiumFindGameSocket()}catch{}return true}const Native=window.WebSocket,P=Native&&Native.prototype;if(!P||typeof P.send!=='function')return false;const native=P.send;window.__gridiumFindGameSocket=function(){try{const last=window.__gridiumLastGameSocket;if(last&&last.readyState===1)return last;for(const k of Object.keys(window).slice(0,2500)){let v;try{v=window[k]}catch{continue}try{if(v instanceof Native&&v.readyState===1){window.__gridiumLastGameSocket=v;return v}}catch{}}}catch{}return null};if(!native.__gridiumWrapped){const wrapped=function(data){try{window.__gridiumLastGameSocket=this}catch{}return native.call(this,data)};try{Object.defineProperty(wrapped,'__gridiumWrapped',{value:true})}catch{}P.send=wrapped}window.__gridiumMarketSend=function(payload){try{const ws=window.__gridiumLastGameSocket||window.__gridiumFindGameSocket();if(!ws||ws.readyState!==1)return {ok:false,reason:'socket-unavailable'};const text=typeof payload==='string'?payload:JSON.stringify(payload);native.call(ws,text);return {ok:true,url:String(ws.url||'')}}catch(e){return {ok:false,reason:String(e&&e.message||e)}}};window.__gridiumMarketBridgeInstalled=true;try{window.__gridiumFindGameSocket()}catch{}return true}catch(e){return false}})()";function eventPayloads(event){const p=event?.postData;if(!p||typeof p!=='object')return [];if(p.t==='batalha'&&Array.isArray(p.ev))return p.ev;return [p];}
function findMarketOutcome(events=[],action,startedAt=0,expected={}){
  const rows=events.filter(e=>(Number(e.at)||0)>=Number(startedAt||0)&&e.method==='RECV');
  for(const e of rows){for(const p of eventPayloads(e)){
    if(action==='buy'&&p?.k==='marketComprado'){
      if(!finitePositive(p.total)||(expected.price&&Number(p.total)>Number(expected.price)))continue;
      if(expected.currency&&String(p.moeda)!==gameCurrency(expected.currency))continue;
      const buyId=p.anuncioId||p.marketId;if(expected.listingId&&buyId&&String(buyId)!==String(expected.listingId))continue;
      const competing=events.filter(x=>x.method==='SEND'&&Number(x.at)>=Number(startedAt)&&Number(x.at)<=Number(e.at)&&x.postData?.t==='market.comprar'&&expected.listingId&&String(x.postData.id)!==String(expected.listingId));if(competing.length)continue;
      return {done:true,ok:true,at:e.at,name:p.descricao||'',price:Number(p.total)||Number(expected.price)||0,currency:String(p.moeda||''),locked:p.trancado===true,remaining:Number(p.sobra)||0,raw:p};
    }
    if(action==='create'&&((p?.k==='marketCriado')||(e.postData?.t==='market'&&e.postData?.aba==='criado'))){const a=e.postData?.anuncio||p;if(expected.price&&Number(a.preco)!==Number(expected.price))continue;if(expected.currency&&a.moeda&&a.moeda!==gameCurrency(expected.currency))continue;const asset=a.itemId||a.pokemonId;if(expected.assetId&&asset&&String(asset)!==String(expected.assetId))continue;return {done:true,ok:true,at:e.at,listingId:String(a.id||''),name:a.ficha?.nome||p.descricao||'',price:Number(a.preco)||Number(expected.price)||0,raw:a};}
    if(action==='reprice'&&e.postData?.t==='market'&&e.postData?.aba==='meus'&&Array.isArray(e.postData.linhas)){
      const found=e.postData.linhas.find(x=>String(x.id)===String(expected.listingId)&&Number(x.preco)===Number(expected.price));if(found)return {done:true,ok:true,at:e.at,listingId:String(found.id),price:Number(found.preco),availableAt:Number(found.compravelEm)||0,raw:found};
    }
    if(action==='cancel'&&p?.k==='marketCancelado')return {done:true,ok:true,at:e.at,name:p.descricao||'',listingId:String(expected.listingId||''),raw:p};
    if(p?.k==='aviso'){
      const msg=String(p.msg||'');if(/saldo.*insuficiente|an[uú]ncio.*(?:indispon|expir|vendid)|pre[cç]o.*(?:mud|alter)|item.*travad/i.test(msg))return {done:true,ok:false,at:e.at,error:msg,raw:p};
    }
  }}
  return {done:false,ok:false};
}

module.exports={VALID_TYPES,validateMarketCommand,buildBuyCommand,buildCreateCommand,buildEditCommand,buildCancelCommand,MARKET_BRIDGE_SOURCE,findMarketOutcome,gameCurrency};
