'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {redactUrl,redactText,summarizePostData,summarizeSocketPayload,isLikelyMarketRequest}=require('../network-inspector');

test('redactUrl oculta parâmetros sensíveis',()=>{
  const out=redactUrl('https://pokeidle.io/api/market?token=abc&listing=42');
  assert.match(out,/token=%5Bredacted%5D/);
  assert.match(out,/listing=42/);
});

test('summarizePostData preserva campos de mercado e oculta auth',()=>{
  const out=summarizePostData(JSON.stringify({listingId:42,price:1200,token:'segredo'}));
  assert.equal(out.listingId,42);assert.equal(out.price,1200);assert.equal(out.token,'[redacted]');
});

test('summarizeSocketPayload entende JSON puro e redige token',()=>{
  const out=summarizeSocketPayload(JSON.stringify({event:'market-buy',listingId:7,token:'abc'}),1);
  assert.equal(out.event,'market-buy');assert.equal(out.listingId,7);assert.equal(out.token,'[redacted]');
});

test('summarizeSocketPayload entende prefixo Socket.IO',()=>{
  const out=summarizeSocketPayload('42["market:list",{"price":100,"token":"abc"}]',1);
  assert.equal(out.protocolPrefix,'42');
  assert.equal(out.data[0],'market:list');
  assert.equal(out.data[1].price,100);
  assert.equal(out.data[1].token,'[redacted]');
});

test('summarizeSocketPayload não persiste frame binário',()=>{
  const out=summarizeSocketPayload('opaque-data',2);
  assert.deepEqual(out,{binary:true,bytes:11});
});

test('redactText remove bearer e email',()=>{
  const out=redactText('Authorization: Bearer abc.def usuario@example.com');
  assert.doesNotMatch(out,/abc\.def/);assert.doesNotMatch(out,/usuario@example\.com/);
});

test('isLikelyMarketRequest detecta operações relevantes',()=>{
  assert.equal(isLikelyMarketRequest({url:'wss://pokeidle.io/socket',postData:{event:'market-buy',listingId:2}}),true);
  assert.equal(isLikelyMarketRequest({url:'https://pokeidle.io/api/profile',postData:null}),false);
});
