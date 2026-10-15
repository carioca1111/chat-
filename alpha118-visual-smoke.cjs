'use strict';
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]||'gridium-build');
const out=path.join(root,'alpha118-screenshots');
fs.mkdirSync(out,{recursive:true});
const now=Date.now();
const hunts=(name,xp,gold)=>({minutes:60,hunts:[{huntSlug:name,xpPerHour:xp,goldPerHour:gold,observedMs:3480000,observedMinutes:58,samples:8,lastAt:now,confidence:'moderada',confidenceDetails:{score:.62,label:'moderada',observedMinutes:58,samples:8,ageMs:0}},{huntSlug:name==='volcano'?'cave':'forest',xpPerHour:Math.round(xp*.88),goldPerHour:Math.round(gold*1.12),observedMs:2520000,observedMinutes:42,samples:6,lastAt:now-60000,confidence:'moderada',confidenceDetails:{score:.55,label:'moderada',observedMinutes:42,samples:6,ageMs:60000}}]});
const intel=(nick,id,speciesId,poke,level,hunt,xp,gold,shiny=false)=>({identity:{id,nick},account:{level:80,xp:720,xpNext:1000,huntSlug:hunt},profile:{id,speciesId,name:poke,level,shiny,types:poke==='Charizard'?['Fogo','Voador']:poke==='Gyarados'?['Água','Voador']:poke==='Gengar'?['Fantasma','Veneno']:['Normal'],ivs:{hp:24,atk:28,def:21,spa:30,spd:22,vel:27}},currentHunt:hunt,lastAt:now,samples:8,periods:{'15':hunts(hunt,xp,gold),'60':hunts(hunt,xp,gold),'180':hunts(hunt,xp,gold),'360':hunts(hunt,xp,gold)},series:Array.from({length:18},(_,i)=>({at:now-(17-i)*180000,huntSlug:hunt,xpPerHour:xp-25+((i*11)%40),goldPerHour:gold-3+((i*7)%6)}))});
const state={accounts:[
 {slot:0,intelligence:intel('Conta 1','A',6,'Charizard',82,'volcano',248000,18400)},
 {slot:1,intelligence:intel('Conta 2','B',130,'Gyarados',76,'lake',230000,21600)},
 {slot:2,intelligence:intel('Conta 3','C',94,'Gengar',69,'ruins',204000,14600,true)},
 {slot:3,intelligence:intel('Conta 4','D',143,'Snorlax',64,'forest',170000,12500)}
]};
const data={rows:[
 {slot:0,status:'online',health:'online',record:{nick:'Conta 1',updated:now,ms:3480000,values:{xpTreinador:239700,gold:17800},live:{browserOnline:true,trainerXp:720,trainerXpMax:1000}}},
 {slot:1,status:'online',health:'online',record:{nick:'Conta 2',updated:now,ms:3300000,values:{xpTreinador:221000,gold:20300},live:{browserOnline:true,trainerXp:460,trainerXpMax:1000}}},
 {slot:2,status:'online',health:'online',record:{nick:'Conta 3',updated:now,ms:3100000,values:{xpTreinador:204000,gold:14600},live:{browserOnline:true,trainerXp:810,trainerXpMax:1000}}},
 {slot:3,status:'offline',health:'offline',record:{nick:'Conta 4',updated:now-480000,ms:0,values:{},live:{browserOnline:false}}}
]};
state.visual={at:now,catalog:[{id:'desert',name:'Deserto sem amostra'}],accounts:state.accounts.map((a,i)=>{const x=a.intelligence,h=x.periods['60'].hunts,windows={};for(const minutes of [15,60,180,360])windows[minutes]={current:{ms:3480000,xp:239700,gold:17800,xpPerHour:h[0].xpPerHour,goldPerHour:h[0].goldPerHour,samples:58},hunts:h.map(y=>({id:y.huntSlug,name:y.huntSlug,ms:y.observedMs,xpPerHour:y.xpPerHour,goldPerHour:y.goldPerHour,samples:y.samples})),chart:x.series};return {slot:i,id:x.identity.id,name:x.identity.nick,connected:i<3,lastAt:now,profile:x.profile,hunt:x.currentHunt,huntName:x.currentHunt,windows};})};
function q(s){return JSON.stringify(s);}
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#06111f;color:#eaf5ff;font-family:Inter,Segoe UI,Arial,sans-serif}body{padding:18px}#hunt{display:block!important}</style><link rel="stylesheet" href="hunt-visual.css"></head><body><p style="color:#9ab4c9;font-size:12px">VALIDAÇÃO VISUAL · DADOS SIMULADOS · NÃO É UMA SESSÃO REAL</p><section id="hunt"></section><script src="hunt-visual-model.js"></script><script src="asset-resolver.js"></script><script src="hunt-visual.js"></script><script>window.__fixture={state:${q(state)},data:${q(data)}}; HuntVisual.setVisible(true); HuntVisual.render(window.__fixture.state,window.__fixture.data);</script></body></html>`;
const fixture=path.join(root,'alpha118-visual-fixture.html');fs.writeFileSync(fixture,html);
async function shot(win,name){await new Promise(r=>setTimeout(r,450));const image=await win.webContents.capturePage();fs.writeFileSync(path.join(out,name),image.toPNG());}
app.whenReady().then(async()=>{let win;try{win=new BrowserWindow({width:1920,height:1080,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});await win.loadFile(fixture);await shot(win,'hunt-overview-1920x1080.png');await win.setSize(1366,768);await win.webContents.executeJavaScript(`document.querySelector('[data-hv-action="view"][data-slot="0"]')?.click()`);await shot(win,'hunt-individual-1366x768.png');await win.setSize(1920,1080);await shot(win,'hunt-individual-1920x1080.png');await win.setSize(1366,768);await win.webContents.executeJavaScript(`document.querySelector('[data-tab=all]').click()`);await shot(win,'hunt-overview-1366x768.png');const overflow=await win.webContents.executeJavaScript(`document.documentElement.scrollWidth>innerWidth`);if(overflow)throw new Error('Horizontal overflow');console.log('Alpha 11.7 screenshots:',out);app.exit(0);}catch(e){console.error(e);app.exit(1);}finally{try{win?.destroy();}catch{}}});
