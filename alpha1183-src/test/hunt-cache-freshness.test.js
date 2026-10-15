'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {HuntVisualStore}=require('../hunt-visual-store');
const MINUTE=60000,T=Math.floor(Date.now()/MINUTE)*MINUTE-2*MINUTE;
const welcome={t:'welcome',estado:{id:'A',nick:'A',activeId:1,huntSlug:'forest',pokemons:[{id:1,speciesId:6,nome:'Charizard',level:80,tipos:['fire','flying']}]},hunts:[{slug:'forest',nome:'Forest'}]};
const battle=xp=>({t:'batalha',ev:[{k:'morte',quem:'selvagem',xpTreinador:xp,ouro:10}]});
test('dados aceitos no mesmo minuto invalidam a view cache imediatamente',()=>{const s=new HuntVisualStore();s.frame(0,welcome,T);s.frame(0,battle(100),T+5000);const now=T+MINUTE+1000,a=s.view(now).accounts[0],r1=a.revision,k1=a.windows[60].current.kills;s.frame(0,battle(200),T+10000);const b=s.view(now+1).accounts[0];assert.ok(b.revision>r1);assert.equal(b.windows[60].current.kills,k1+1);assert.notStrictEqual(b.windows,a.windows);});
test('fingerprint de recompensa independe da ordem das chaves do evento',()=>{const s=new HuntVisualStore();s.frame(0,welcome,T);const a={t:'batalha',ev:[{k:'morte',quem:'selvagem',xpTreinador:100,ouro:10,id:7}]},b={t:'batalha',ev:[{id:7,ouro:10,xpTreinador:100,quem:'selvagem',k:'morte'}]};s.frame(0,a,T+5000);s.frame(0,b,T+5000);const kills=s.accounts.get('A').bins.reduce((n,x)=>n+x.kills,0);assert.equal(kills,1);});
