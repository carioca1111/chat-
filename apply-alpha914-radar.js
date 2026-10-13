'use strict';
const fs=require('fs');
const path=require('path');

const root=path.resolve(process.argv[2]||'gridium-build');
const file=path.join(root,'main.js');
let main=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const must=(cond,msg)=>{if(!cond)throw new Error(msg);};
const replaceOnce=(from,to,label)=>{
  must(main.includes(from),`Alpha Radar: marcador nao encontrado: ${label}`);
  const first=main.indexOf(from),second=main.indexOf(from,first+from.length);
  must(second<0,`Alpha Radar: marcador ambiguo: ${label}`);
  main=main.replace(from,to);
};

const helper=`
const ALPHA_RADAR_ENDPOINT='https://pokeidle-alpha-radar-live.onrender.com/api/market-event';
const alphaRadarSeen=new Map();
let alphaRadarPushBusy=false,alphaRadarLastAt=0,alphaRadarLastError=null;
function alphaRadarListingEvent(l){
  if(!l||!l.listingId||!(Number(l.price)>0)||!String(l.name||'').trim())return null;
  const key=String(l.slot)+':'+String(l.listingId);
  const signature=[l.price,l.currency,l.name,l.assetType,l.assetId].join('|');
  const previous=alphaRadarSeen.get(key);
  if(previous===signature)return null;
  alphaRadarSeen.set(key,signature);
  if(alphaRadarSeen.size>6000){const oldest=alphaRadarSeen.keys().next().value;alphaRadarSeen.delete(oldest);}
  return {
    type:previous?'listing_updated':'listing_created',
    name:String(l.name),
    kind:l.assetType==='pokemon'?'pokemon':'item',
    currency:l.currency==='coins'?'COIN':'GEM',
    price:Number(l.price),
    seller:l.seller?String(l.seller):null,
    listingId:String(l.listingId),
    ts:Number(l.at)||Date.now(),
    marketUrl:'https://pokeidle.io/app',
    meta:{
      slot:Number(l.slot),
      assetId:l.assetId==null?null:String(l.assetId),
      qty:Number(l.qty)||1,
      sellerId:l.sellerId??null,
      availableAt:l.availableAt??null,
      expiresAt:l.expiresAt??null,
      favorites:Number(l.favorites)||0,
      pokemon:l.pokemon&&typeof l.pokemon==='object'?l.pokemon:null,
      source:l.metadata?.source||'gridium-market'
    }
  };
}
async function pushAlphaRadarListings(listings=[]){
  if(alphaRadarPushBusy)return;
  const rows=(listings||[]).map(alphaRadarListingEvent).filter(Boolean).slice(0,400);
  if(!rows.length)return;
  alphaRadarPushBusy=true;
  try{
    const response=await fetch(ALPHA_RADAR_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(rows)});
    if(!response.ok)throw new Error('HTTP '+response.status);
    alphaRadarLastAt=Date.now();alphaRadarLastError=null;
  }catch(error){alphaRadarLastError=String(error?.message||error);}
  finally{alphaRadarPushBusy=false;}
}
`;

replaceOnce(
  'refreshProtocolFromNetwork.lastAt=0;refreshProtocolFromNetwork.lastRecordAt=0;',
  helper+'\nrefreshProtocolFromNetwork.lastAt=0;refreshProtocolFromNetwork.lastRecordAt=0;',
  'instalacao do publicador'
);
replaceOnce(
  'void sniperRuntime?.ingest(allListings,latestMarketProtocol);',
  'void sniperRuntime?.ingest(allListings,latestMarketProtocol);void pushAlphaRadarListings(listings);',
  'envio do feed real'
);

fs.writeFileSync(file,main,'utf8');
console.log('Alpha Radar: feed real do Market conectado.');
