'use strict';
const fs=require('fs');
const path=require('path');
const root=process.argv[2]?path.resolve(process.argv[2]):process.cwd();
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(f,s)=>fs.writeFileSync(path.join(root,f),s);
const must=(cond,msg)=>{if(!cond)throw new Error('Alpha 8.3: '+msg);};

const pkgPath=path.join(root,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
pkg.version='3.0.0-alpha.8.3';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
html=html.replace(/<p>Alpha 8\.1:[^<]*<\/p>/,"<p>Alpha 8.3: automático em 1 clique · LIVE liberado sozinho somente quando o feed real estiver saudável.</p>");
html=html.replace(/<button id="alphaLiveToggle"([^>]*)>/,(_m,attrs)=>`<button id="alphaLiveToggle"${attrs} hidden aria-hidden="true" tabindex="-1">`);
html=html.replace('title="Um clique: Auto + LIVE + scanner + navegação + execução dentro dos limites"','title="Um clique: inicia o automático; o LIVE é liberado sozinho somente após todas as verificações"');
must(html.includes('id="alphaAutopilot"'),'botão automático ausente');
must(html.includes('id="alphaLiveToggle"')&&html.includes('aria-hidden="true"'),'controle LIVE não foi ocultado');
write('index.html',html);

let css=read('styles.css');
if(!css.includes('GRID_ALPHA83_ONE_CLICK'))css += `\n/* GRID_ALPHA83_ONE_CLICK */\n#notice,#alphaLiveToggle{display:none!important}\n`;
write('styles.css',css);

let renderer=read('renderer.js');
const oldNotify="function notify(text){$('notice').textContent=text;$('notice').hidden=!text;}";
must(renderer.includes(oldNotify),'função notify esperada não encontrada');
renderer=renderer.replace(oldNotify,"function notify(text){const n=$('notice');if(n){n.textContent='';n.hidden=true;}if(text)console.debug('[Gridium]',String(text));}");
write('renderer.js',renderer);

let main=read('main.js');
const oldArm=`function maybeArmAutopilot(){if(!alphaEngine||autopilotStatus.enabled!==true)return;const health=marketRuntimeHealth();autopilotStatus={...autopilotStatus,runtimeHealth:health,accountsReady:health.attached,listingsSeen:(latestMarketProtocol.listings||[]).length};const live=alphaEngine.settings.liveExecutionUnlocked===true,kill=alphaEngine.settings.killSwitch===true;if(health.ready){if(!live)alphaEngine.unlockLive(true);if(kill)alphaEngine.kill(false);autopilotStatus={...autopilotStatus,state:'armed',lastAt:Date.now(),lastAction:'Feed real pronto · Auto Trader liberado',lastError:null};}else{if(!kill)alphaEngine.kill(true);if(live)alphaEngine.unlockLive(false);autopilotStatus={...autopilotStatus,state:'warming',lastAt:Date.now(),lastAction:health.marketRx?'Aguardando anúncios detalhados válidos':'Aguardando resposta real do Market',lastError:null};}}`;
const newArm=`function maybeArmAutopilot(){if(!alphaEngine||autopilotStatus.enabled!==true)return;const health=marketRuntimeHealth(),protocolReady=liveValidationReady();autopilotStatus={...autopilotStatus,runtimeHealth:health,accountsReady:health.attached,listingsSeen:(latestMarketProtocol.listings||[]).length};const live=alphaEngine.settings.liveExecutionUnlocked===true,kill=alphaEngine.settings.killSwitch===true;if(protocolReady&&health.ready){if(!live)alphaEngine.unlockLive(true);if(kill)alphaEngine.kill(false);autopilotStatus={...autopilotStatus,state:'armed',lastAt:Date.now(),lastAction:'Tudo verde · LIVE liberado automaticamente · Auto Trader ativo',lastError:null};}else{if(!kill)alphaEngine.kill(true);if(live)alphaEngine.unlockLive(false);const reason=!protocolReady?'Aguardando validação segura do protocolo':health.marketRx?'Aguardando anúncios detalhados válidos':'Aguardando resposta real do Market';autopilotStatus={...autopilotStatus,state:'warming',lastAt:Date.now(),lastAction:reason,lastError:null};}}`;
must(main.includes(oldArm),'função maybeArmAutopilot esperada não encontrada');
main=main.replace(oldArm,newArm);
main=main.replace("if(!live){halt('LIVE bloqueado — clique ARMAR LIVE');return;}","if(!live){halt(autopilotStatus.enabled===true?'LIVE aguardando liberação automática':'LIVE bloqueado');return;}");
const legacyGate="if(on){if(!liveValidationReady())throw new Error('Protocolo histórico ainda não está validado');refreshProtocolFromNetwork({recordMarket:true});";
must(main.includes(legacyGate),'gate manual do autopilot não encontrado');
main=main.replace(legacyGate,"if(on){refreshProtocolFromNetwork({recordMarket:true});");
main=main.replace(/Alpha 8\.2 Autopilot iniciou em aquecimento/g,'Alpha 8.3 Autopilot 1-clique iniciou em aquecimento');
main=main.replace(/Alpha 8\.2 Autopilot parado/g,'Alpha 8.3 Autopilot parado');
write('main.js',main);

console.log('Alpha 8.3 one-click + silent click notices applied');
