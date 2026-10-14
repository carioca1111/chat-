'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const {computeShiny}=require('./shiny-cloud-compute');

const TOKEN=String(process.env.POKEGRID_TOKEN||'').trim();
const originalCreateServer=http.createServer;
const safe=(a,b)=>{a=Buffer.from(String(a));b=Buffer.from(String(b));return a.length===b.length&&crypto.timingSafeEqual(a,b);};
const bearer=req=>{const h=String(req.headers?.authorization||'');return h.startsWith('Bearer ')?h.slice(7).trim():'';};
const json=(res,status,data)=>{const out=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(out),'cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'authorization, content-type','access-control-allow-methods':'GET,POST,OPTIONS'});res.end(out);};
const body=(req,limit=262144)=>new Promise((resolve,reject)=>{let n=0,chunks=[];req.on('data',chunk=>{n+=chunk.length;if(n>limit){reject(new Error('too-large'));req.destroy();return;}chunks.push(chunk);});req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));req.on('error',reject);});

function wrap(listener){
  return async(req,res)=>{
    let url;try{url=new URL(req.url,'http://relay.local');}catch{return listener(req,res);}
    if(url.pathname!=='/api/v1/shiny/compute'||req.method!=='POST')return listener(req,res);
    if(!TOKEN||!safe(bearer(req),TOKEN))return json(res,401,{error:'unauthorized'});
    try{
      const payload=JSON.parse(await body(req)||'{}');
      return json(res,200,computeShiny(payload));
    }catch(error){
      const message=String(error?.message||'bad-request');
      return json(res,message==='too-large'?413:400,{error:message==='invalid-shiny-payload'?'invalid-shiny-payload':'bad-request'});
    }
  };
}

http.createServer=function(options,listener){
  if(typeof options==='function')return originalCreateServer.call(http,wrap(options));
  return originalCreateServer.call(http,options,wrap(listener));
};

require('./server');
