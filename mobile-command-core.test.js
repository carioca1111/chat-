'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('./mobile-command-core');
const secret='x'.repeat(40),payload={id:'dev-1',name:'Meu celular',iat:Date.now()},token=C.signDevice(payload,secret);
test('device token roundtrip e revogação',()=>{assert.equal(C.verifyDevice(token,secret).id,'dev-1');assert.equal(C.verifyDevice(token,secret,{revokedIds:['dev-1']}),null);});
test('comandos remotos têm allowlist e não existe AUTO arm',()=>{assert.deepEqual(C.sanitizeCommand({type:'sniper-kill'}),{type:'sniper-kill',payload:{}});assert.deepEqual(C.sanitizeCommand({type:'reconnect-account',payload:{slot:2}}).payload,{slot:2});assert.throws(()=>C.sanitizeCommand({type:'sniper-arm'}),/command-not-allowed/);});
test('snapshot mobile não carrega campos arbitrários',()=>{const x=C.projectMobileSnapshot({at:123,total:{rates:{capturas:10}},rows:[{slot:0,record:{nick:'A',values:{capturas:2}}}],gridium:{mobile:{desktop:{online:true}},secret:'nope'},secret:'nope'});assert.equal(x.at,123);assert.equal(x.secret,undefined);assert.equal(x.gridium.secret,undefined);assert.equal(x.rows[0].record.nick,'A');});
