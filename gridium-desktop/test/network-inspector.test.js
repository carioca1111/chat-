'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {redactUrl,summarizePostData,isLikelyMarketRequest}=require('../network-inspector');

test('redactUrl oculta parâmetros sensíveis',()=>{
  const out=redactUrl('https://pokeidle.io/api/market?token=abc&listing=42');
  assert.match(out,/token=%5Bredacted%5D/);
  assert.match(out,/listing=42/);
});

test('summarizePostData preserva campos de mercado e oculta auth',()=>{
  const out=summarizePostData(JSON.stringify({listingId:42,price:1200,token:'segredo'}));
  assert.equal(out.listingId,42);assert.equal(out.price,1200);assert.equal(out.token,'[redacted]');
});

test('isLikelyMarketRequest detecta operações relevantes',()=>{
  assert.equal(isLikelyMarketRequest({url:'https://pokeidle.io/api/market/buy',postData:{listingId:2}}),true);
  assert.equal(isLikelyMarketRequest({url:'https://pokeidle.io/api/profile',postData:null}),false);
});
