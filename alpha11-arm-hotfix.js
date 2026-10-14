'use strict';
const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(target,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(target,n),s,'utf8');
function replaceOnce(name,from,to){const s=read(name);if(!s.includes(from))throw new Error(`Alpha 11.1 anchor missing: ${name}`);write(name,s.replace(from,to));}

const pkg=JSON.parse(read('package.json'));
if(pkg.version!=='3.0.0-alpha.11')throw new Error(`Alpha 11.1 expects Alpha 11, got ${pkg.version}`);

replaceOnce('index.html',
  '<div class="ms-action-row"><button id="msDryRun" class="ghost-red">RADAR / DRY RUN</button><button id="msArm" class="red">ARMAR AUTO</button><button id="msKill" class="dark">KILL SWITCH</button></div>',
  '<div class="ms-action-row"><button id="msDryRun" class="ghost-red">RADAR / DRY RUN</button><button id="msArm" class="red">ARMAR AUTO</button><button id="msKill" class="dark">KILL SWITCH</button></div>\n        <div id="msArmConfirm" class="ms-arm-confirm" hidden>\n          <div><b>Confirmar compras reais</b><span>Digite <strong>ATIVAR SNIPER</strong> para liberar o modo AUTO.</span></div>\n          <input id="msArmPhrase" autocomplete="off" spellcheck="false" placeholder="ATIVAR SNIPER">\n          <div class="ms-arm-confirm-actions"><button id="msArmConfirmBtn" class="red">CONFIRMAR AUTO</button><button id="msArmCancel" class="dark">CANCELAR</button></div>\n        </div>');

replaceOnce('sniper-ui.js',
  "  async function arm(){try{await saveConfig();const phrase=prompt('Digite ATIVAR SNIPER para liberar compras reais.');if(phrase==null)return;state=await window.gridAPI.sniperArm(true,phrase);render();notice('Sniper Relâmpago armado.');}catch(e){notice(String(e?.message||e));}}",
  "  function showArmConfirm(){const box=$('msArmConfirm'),input=$('msArmPhrase');if(!box)return;box.hidden=false;if(input){input.value='';setTimeout(()=>{input.focus();input.select();},0);}notice('Confirme o modo AUTO para liberar compras reais.');}\n  function hideArmConfirm(){const box=$('msArmConfirm');if(box)box.hidden=true;}\n  async function arm(){try{await saveConfig();showArmConfirm();}catch(e){notice('Não foi possível preparar o AUTO: '+String(e?.message||e));}}\n  async function confirmArm(){const input=$('msArmPhrase'),button=$('msArmConfirmBtn'),phrase=String(input?.value||'').trim();if(phrase.toUpperCase()!=='ATIVAR SNIPER'){notice('Digite exatamente ATIVAR SNIPER para confirmar.');input?.focus();input?.select();return;}try{if(button)button.disabled=true;notice('Armando Sniper AUTO...');state=await window.gridAPI.sniperArm(true,phrase);render();hideArmConfirm();notice('Sniper Relâmpago armado: compras reais liberadas.');}catch(e){notice('Não foi possível armar: '+String(e?.message||e));}finally{if(button)button.disabled=false;}}"
);

replaceOnce('sniper-ui.js',
  "    $('msSave')?.addEventListener('click',saveConfig);$('msDryRun')?.addEventListener('click',dryRun);$('msArm')?.addEventListener('click',arm);$('msKill')?.addEventListener('click',kill);$('msRefreshIntel')?.addEventListener('click',refreshIntel);",
  "    $('msSave')?.addEventListener('click',saveConfig);$('msDryRun')?.addEventListener('click',dryRun);$('msArm')?.addEventListener('click',arm);$('msArmConfirmBtn')?.addEventListener('click',confirmArm);$('msArmCancel')?.addEventListener('click',()=>{hideArmConfirm();notice('Armamento cancelado.');});$('msArmPhrase')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void confirmArm();}else if(e.key==='Escape'){e.preventDefault();hideArmConfirm();notice('Armamento cancelado.');}});$('msKill')?.addEventListener('click',kill);$('msRefreshIntel')?.addEventListener('click',refreshIntel);"
);

let css=read('sniper.css');
css += `\n.ms-arm-confirm{margin-top:9px;padding:10px;border:1px solid #ff3650;border-radius:8px;background:#26070d;display:grid;grid-template-columns:minmax(190px,1fr) minmax(180px,.8fr) auto;gap:9px;align-items:center;box-shadow:inset 0 0 18px rgba(255,35,60,.08)}.ms-arm-confirm[hidden]{display:none}.ms-arm-confirm>div:first-child{display:grid;gap:2px}.ms-arm-confirm b{color:#fff}.ms-arm-confirm span{font-size:10px;color:#d7a3aa}.ms-arm-confirm strong{color:#ff6d7e}.ms-arm-confirm input{min-width:0;background:#080d13;color:#fff;border:1px solid #a72c3e;border-radius:6px;padding:8px 9px;outline:0;text-transform:uppercase}.ms-arm-confirm input:focus{border-color:#ff4057;box-shadow:0 0 0 2px rgba(255,48,72,.12)}.ms-arm-confirm-actions{display:flex;gap:6px}.ms-arm-confirm-actions button{border-radius:6px;padding:7px 10px;cursor:pointer}.ms-arm-confirm-actions .red{background:#b20d27;border:1px solid #ff3650;color:#fff;font-weight:700}.ms-arm-confirm-actions .dark{background:#15191f;border:1px solid #49525b;color:#d9efff}.ms-arm-confirm-actions button:disabled{opacity:.55;cursor:wait}@media(max-width:980px){.ms-arm-confirm{grid-template-columns:1fr}.ms-arm-confirm-actions{justify-content:flex-start}}\n`;
write('sniper.css',css);

pkg.version='3.0.0-alpha.11.1';
write('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('Gridium Alpha 11.1: inline Sniper ARM confirmation applied; window.prompt removed.');
