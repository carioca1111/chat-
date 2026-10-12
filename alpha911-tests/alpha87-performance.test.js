'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');
test('probe automático usa market.item sem varrer scripts',()=>{const a=src.indexOf('async function sendPassiveMarketProbe('),b=src.indexOf('function mergeNetworkRows',a),seg=src.slice(a,b);assert.match(seg,/lastClientCommand='market\.item'/);assert.doesNotMatch(seg,/collectMarketSourceHints\(/);assert.match(src,/const cmd=\{t:'market\.item',tipo:'item',itemId:id,pagina:1\}/);});
test('health não reprocessa protocolo inteiro',()=>{const a=src.indexOf('function marketRuntimeHealth(){'),b=src.indexOf('function setAutopilotSafeStop',a),seg=src.slice(a,b);assert.doesNotMatch(seg,/analyzeProtocolEvents\(/);});
test('refresh de protocolo tem throttle e janela reduzida',()=>{assert.match(src,/lastAt\)\|\|0\)<3500/);assert.match(src,/limit:marketLimit,marketOnly:true/);});
