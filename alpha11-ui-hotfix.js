'use strict';
const fs=require('node:fs'),path=require('node:path');const file=path.join(path.resolve(process.argv[2]||'gridium-build'),'sniper-ui.js');let s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
function patch(a,b){if(!s.includes(a))throw new Error('Sniper UI hotfix anchor missing: '+a.slice(0,120));s=s.replace(a,b);}
patch('let active=false,state=null,intel=null,pollTimer=null,intelTimer=null,localLogs=[];','let active=false,state=null,intel=null,pollTimer=null,intelTimer=null,localLogs=[],hydrated=false;');
patch('renderMetrics(state);renderQueue(state);renderPurchases(state);renderLogs(state);renderIntel();hydrate(s.policy||{});','renderMetrics(state);renderQueue(state);renderPurchases(state);renderLogs(state);renderIntel();if(!hydrated){hydrate(s.policy||{});hydrated=true;}');
patch("const auto=s.mode==='AUTO'&&!s.killSwitch,dry=s.mode==='OBSERVE';$('msLightningEnabled').checked=s.policy?.rules?.[0]?.enabled!==false;setText", "const auto=s.mode==='AUTO'&&!s.killSwitch,dry=s.mode==='OBSERVE';setText");
fs.writeFileSync(file,s);console.log('Sniper UI polling no longer overwrites unsaved form edits.');
