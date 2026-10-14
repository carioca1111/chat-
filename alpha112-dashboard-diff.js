'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build'),file=path.join(root,'renderer.js');let s=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.2 dashboard diff: '+m);};
for(const name of ['renderComparison','renderHealth','renderResources','renderGoals']){const a='function '+name+'(';must(s.includes(a),name+' ausente');s=s.replace(a,'function '+name+'112Raw(');}
const wrappers=`
const dashboardModuleSig112={comparison:'',health:'',resources:'',goals:''};
function dashboardSignature112(value){try{return window.GridiumUltra?.signature?window.GridiumUltra.signature(value):JSON.stringify(value);}catch{return String(Date.now());}}
function renderComparison(data){const sig=dashboardSignature112([selected,data?.total?.values,(data?.rows||[]).map(x=>[x.status,x.record?.ms,x.record?.values])]);if(sig===dashboardModuleSig112.comparison)return;dashboardModuleSig112.comparison=sig;return renderComparison112Raw(data);}
function renderHealth(data){const sig=dashboardSignature112([selected,(data?.rows||[]).map(x=>[x.status,x.health,x.forecast?.hpMs,x.forecast?.stockMs,x.record?.updated])]);if(sig===dashboardModuleSig112.health)return;dashboardModuleSig112.health=sig;return renderHealth112Raw(data);}
function renderResources(value){const sig=dashboardSignature112([selected,value]);if(sig===dashboardModuleSig112.resources)return;dashboardModuleSig112.resources=sig;return renderResources112Raw(value);}
function renderGoals(){const data=current,sig=dashboardSignature112([selected,data?.settings?.goals,data?.settings?.goal,(data?.rows||[]).map(x=>[x.record?.values,x.record?.ms]),data?.total?.values]);if(sig===dashboardModuleSig112.goals)return;dashboardModuleSig112.goals=sig;return renderGoals112Raw();}
function invalidateDashboard112(){dashboardModuleSig112.comparison=dashboardModuleSig112.health=dashboardModuleSig112.resources=dashboardModuleSig112.goals='';}
`;
const anchor='window.gridAPI.onState(render);';must(s.includes(anchor),'onState anchor ausente');s=s.replace(anchor,wrappers+'\n'+anchor);
// User-driven selection/settings changes must redraw even if the numeric state did not move.
s=s.replace("$('scope').onchange=()=>{selected=$('scope').value;render(current);void refreshExtras(true);};","$('scope').onchange=()=>{selected=$('scope').value;invalidateDashboard112();render(current);void refreshExtras(true);};");
fs.writeFileSync(file,s,'utf8');console.log('Gridium Alpha 11.2: Dashboard usa assinaturas por módulo; DOM só muda quando os dados relevantes mudam.');
