'use strict';
// Somente leitura. Não dispara compra, venda, clique ou mutação do jogo.
const MARKET_DISCOVERY_SCRIPT=`(() => {
  const clean=s=>String(s||'').replace(/\\s+/g,' ').trim();
  const result={at:Date.now(),url:location.href,title:document.title,marketVisible:false,blocks:[],resources:[],globals:[]};
  const marketNodes=[...document.querySelectorAll('[id*="market" i],[class*="market" i],[id*="mercado" i],[class*="mercado" i],[id*="trade" i],[class*="trade" i],[id*="auction" i],[class*="auction" i]')];
  result.marketVisible=marketNodes.some(x=>x.offsetParent!==null);
  for(const el of marketNodes.slice(0,80)){const text=clean(el.textContent);if(!text||text.length>1200)continue;result.blocks.push({tag:el.tagName,id:el.id||'',className:String(el.className||'').slice(0,180),text:text.slice(0,1000)});}
  try{result.resources=performance.getEntriesByType('resource').map(x=>{try{const u=new URL(x.name);return u.origin+u.pathname}catch{return ''}}).filter(x=>/market|mercado|listing|trade|sale|sell|buy|auction|offer/i.test(x)).slice(-100);}catch{}
  try{result.globals=Object.keys(window).filter(k=>/market|listing|trade|auction|offer|sale/i.test(k)).slice(0,100);}catch{}
  return result;
})()`;
function normalizeListings(scan,slot){
  if(!scan||!Array.isArray(scan.blocks))return [];
  const out=[];for(const b of scan.blocks){const text=String(b.text||'');const price=text.match(/([0-9][0-9.,]*)\\s*(gem|gems|💎|coin|coins|gold|🪙)/i);if(!price)continue;const n=Number(price[1].replace(/[^0-9]/g,''));if(!n)continue;out.push({slot,listingId:b.id||'',assetType:'unknown',assetId:'',name:text.slice(0,120),currency:/gem|💎/i.test(price[2])?'gems':'coins',price:n,liquidity:0.5,metadata:{source:'dom-discovery',block:b}});}
  return out.slice(0,200);
}
module.exports={MARKET_DISCOVERY_SCRIPT,normalizeListings};
