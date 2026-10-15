'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
const must=(c,m)=>{if(!c)throw new Error('Alpha 11.8.2 Hunt performance/type background: '+m);};
const replaceOnce=(text,from,to,label)=>{must(text.includes(from),label+' anchor missing');return text.replace(from,to);};

let model=read('hunt-visual-model.js');
const bgAnchor="  function sameHunt(a,b){const x=clean(a),y=clean(b);return !!x&&!!y&&x===y;}";
const bgFn=`  function backgroundForPokemon(profile,fallback=''){
    const map={normal:'meadow',fire:'volcano',water:'lake',electric:'mountain',grass:'forest',ice:'ice',fighting:'mountain',poison:'swamp',ground:'desert',flying:'mountain',psychic:'ruins',bug:'forest',rock:'cave',ghost:'ruins',dragon:'mountain',dark:'cave',steel:'cave',fairy:'meadow'};
    const types=Array.isArray(profile?.types)?profile.types:[];
    for(const raw of types){const type=clean(raw);if(map[type])return \`assets/hunt/backgrounds/hunt-\${map[type]}.webp\`;}
    return backgroundFor(fallback);
  }
`;
model=replaceOnce(model,bgAnchor,bgFn+bgAnchor,'backgroundForPokemon insertion');
model=replaceOnce(model,'background:backgroundFor(huntName||hunt),profile','background:backgroundForPokemon(profile,huntName||hunt),profile','type based account background');
model=replaceOnce(model,'return {PERIODS,OBJECTIVES,clean,label,backgroundFor,sameHunt,periodBlock,recommend,connection,accountSnapshot,totals};','return {PERIODS,OBJECTIVES,clean,label,backgroundFor,backgroundForPokemon,sameHunt,periodBlock,recommend,connection,accountSnapshot,totals};','model export');
write('hunt-visual-model.js',model);

let ui=read('hunt-visual.js');
ui=replaceOnce(ui,
"const prefs=readPrefs(),ctx={visible:false,state:null,data:null,root:null,overview:null,individual:null,summary:null,tabs:null,period:null,lastOverview:new Map(),lastIndividual:'',lastTop:'',prefs};",
"const prefs=readPrefs(),ctx={visible:false,state:null,data:null,root:null,overview:null,individual:null,summary:null,tabs:null,period:null,lastOverview:new Map(),lastIndividual:'',lastTop:'',lastAlerts:'',pendingFrame:0,lastPaint:0,prefs};",
'render context');
ui=replaceOnce(ui,
"const spark=(series,metric='xp',large=false)=>{const k=metric==='gold'?'goldPerHour':'xpPerHour'",
"const spark=(series,metric='xp',large=false)=>{series=(series||[]).slice(-60);const k=metric==='gold'?'goldPerHour':'xpPerHour'",
'chart sample cap');
ui=replaceOnce(ui,
"const sig=JSON.stringify([s.name,s.hunt,s.profile,s.connection.status,s.current,s.progress,s.objective,s.recommendation,s.series.slice(-20),s.lastAt]);",
"const lastPoint=(s.series||[]).length?s.series[s.series.length-1]:null,sig=JSON.stringify([s.name,s.hunt,s.background,s.profile?.speciesId,s.profile?.name,s.profile?.level,s.profile?.shiny,s.profile?.types,s.connection.status,s.xpPerHour==null?null:Math.round(Number(s.xpPerHour)),s.goldPerHour==null?null:Math.round(Number(s.goldPerHour)),s.progress?Math.round(Number(s.progress.pct)||0):null,s.objective,s.recommendation?.status,s.recommendation?.title,s.recommendation?.detail,lastPoint?[Math.floor((Number(lastPoint.at)||0)/5000),Math.round(Number(lastPoint.xpPerHour)||0),Math.round(Number(lastPoint.goldPerHour)||0)]:null]);",
'overview coarse signature');
const oldAlerts="const alerts=snaps.filter(s=>!s.connection.online||!s.current);ctx.root.querySelector('.hv-alerts').innerHTML=alerts.length?`<h3>Alertas e atividade</h3>${alerts.map(s=>`<div><span class=\"hv-dot ${s.connection.status}\"></span><b>${esc(s.name)}</b><span>${!s.connection.online?esc(stateLabel(s.connection.status)):'Coletando dados da hunt'}</span><small>${s.lastAt?esc(ago(s.lastAt)):'Ainda sem leitura'}</small></div>`).join('')}`:'';";
const newAlerts="const alerts=snaps.filter(s=>!s.connection.online||!s.current),alertsHtml=alerts.length?`<h3>Alertas e atividade</h3>${alerts.map(s=>`<div><span class=\"hv-dot ${s.connection.status}\"></span><b>${esc(s.name)}</b><span>${!s.connection.online?esc(stateLabel(s.connection.status)):'Coletando dados da hunt'}</span><small>${s.lastAt?esc(ago(s.lastAt)):'Ainda sem leitura'}</small></div>`).join('')}`:'';if(alertsHtml!==ctx.lastAlerts){ctx.lastAlerts=alertsHtml;ctx.root.querySelector('.hv-alerts').innerHTML=alertsHtml;}";
ui=replaceOnce(ui,oldAlerts,newAlerts,'alerts churn guard');
ui=replaceOnce(ui,
"const s=snaps[slot],sig=JSON.stringify([slot,ctx.prefs.period,ctx.prefs.metric,s.name,s.hunt,s.profile,s.connection.status,s.current,s.progress,s.objective,s.recommendation,s.period.hunts,s.series,s.session,s.lastAt]);",
"const s=snaps[slot],lastPoint=(s.series||[]).length?s.series[s.series.length-1]:null,huntSig=(s.period.hunts||[]).map(h=>[h.huntSlug,h.xpPerHour==null?null:Math.round(Number(h.xpPerHour)),h.goldPerHour==null?null:Math.round(Number(h.goldPerHour)),Math.round(Number(h.observedMinutes)||0)]),sig=JSON.stringify([slot,ctx.prefs.period,ctx.prefs.metric,s.name,s.hunt,s.background,s.profile?.speciesId,s.profile?.name,s.profile?.level,s.profile?.shiny,s.profile?.types,s.connection.status,s.xpPerHour==null?null:Math.round(Number(s.xpPerHour)),s.goldPerHour==null?null:Math.round(Number(s.goldPerHour)),s.progress?Math.round(Number(s.progress.pct)||0):null,s.objective,s.recommendation?.status,s.recommendation?.title,s.recommendation?.detail,huntSig,s.session?.ms?Math.round(Number(s.session.ms)/5000):0,s.session?.xp,s.session?.goldMixed,lastPoint?[Math.floor((Number(lastPoint.at)||0)/5000),Math.round(Number(lastPoint.xpPerHour)||0),Math.round(Number(lastPoint.goldPerHour)||0)]:null]);",
'individual coarse signature');
ui=replaceOnce(ui,
"  function render(state,data){ctx.state=state;ctx.data=data;if(ctx.visible)renderNow(false);}\n  function setVisible(on){ctx.visible=!!on;mount();if(ctx.visible)renderNow(true);}",
"  function scheduleRender(){if(!ctx.visible||ctx.pendingFrame)return;const frame=ts=>{if(!ctx.visible){ctx.pendingFrame=0;return;}if(ts-ctx.lastPaint<200){ctx.pendingFrame=requestAnimationFrame(frame);return;}ctx.pendingFrame=0;ctx.lastPaint=ts;renderNow(false);};ctx.pendingFrame=requestAnimationFrame(frame);}\n  function render(state,data){ctx.state=state;ctx.data=data;if(ctx.visible)scheduleRender();}\n  function setVisible(on){ctx.visible=!!on;mount();if(!ctx.visible&&ctx.pendingFrame){cancelAnimationFrame(ctx.pendingFrame);ctx.pendingFrame=0;}if(ctx.visible){ctx.lastPaint=performance.now();renderNow(true);}}",
'coalesced rendering');
write('hunt-visual.js',ui);

const cssPath=path.join(root,'hunt-visual.css');
let css=fs.readFileSync(cssPath,'utf8');
if(!css.includes('Alpha 11.8.2 Hunt performance overrides'))css+='\n/* Alpha 11.8.2 Hunt performance overrides */\n.hv-account-card{contain:layout paint;box-shadow:none}.hv-scene,.hv-hero-scene{contain:paint}.hv-pokemon{filter:none}.hv-account-grid{contain:layout}.hv-spark{pointer-events:none}\n';
fs.writeFileSync(cssPath,css,'utf8');

const pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
must(pkg.version==='3.0.0-alpha.11.8.1','base 11.8.1 expected, current '+pkg.version);
pkg.version='3.0.0-alpha.11.8.2';
pkg.description='Gridium Alpha 11.8.2: Hunt smooth rendering + Pokemon type backgrounds';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

const finalModel=read('hunt-visual-model.js'),finalUi=read('hunt-visual.js');
must(finalModel.includes('backgroundForPokemon(profile'),'type background helper missing');
must(finalUi.includes('requestAnimationFrame(frame)'),'render coalescing missing');
must(finalUi.includes("slice(-60)"),'chart cap missing');
must(finalUi.includes("lastAlerts:''"),'alerts guard missing');
console.log('Gridium Alpha 11.8.2: Hunt renderer coalesced and landscapes mapped by Pokemon type.');
