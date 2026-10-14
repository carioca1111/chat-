'use strict';
const fs=require('node:fs'),path=require('node:path');
const target=path.resolve(process.argv[2]||'gridium-build'),source=path.join(__dirname,'alpha10-src');
const read=n=>fs.readFileSync(path.join(target,n),'utf8'),write=(n,s)=>fs.writeFileSync(path.join(target,n),s);
const pkg=JSON.parse(read('package.json'));
if(pkg.version==='3.0.0-alpha.10')throw Error('Alpha 10 already applied. Assemble a fresh Alpha 9.17 first.');
if(pkg.version!=='3.0.0-alpha.9.17')throw Error('Expected Alpha 9.17, got '+pkg.version);
const outputs=new Map();
function patch(n,from,to){let s=outputs.get(n)??read(n);if(!s.includes(from))throw Error('Alpha 10 integration anchor missing: '+n+' / '+from.slice(0,80));outputs.set(n,s.replace(from,to));}
patch('main.js',"const {Stats,FIELDS}=require('./stats');","const {Stats,FIELDS}=require('./stats');\nconst {ShinyTelemetry}=require('./shiny-telemetry');\nlet shinyTelemetry=null,shinyQuitReady=false;");
patch('main.js','function persist(){saveError=!save();}',"function persist(){saveError=!save();void shinyTelemetry?.save();}");
// Shiny state is intentionally NOT embedded in the global Gridium snapshot. The renderer
// requests it only while the Shiny tab is visible, avoiding repeated serialization/IPC.
patch('main.js',"['games','dashboard','hunt','alpha']","['games','dashboard','hunt','shiny-assistant','alpha']");
patch('main.js',"handler('grid:hunt-state',()=>huntView());",`handler('grid:shiny-state',()=>shinyTelemetry?.view()||{accounts:[],error:'Dados temporariamente indisponíveis'});
  handler('grid:shiny-history',filters=>shinyTelemetry?.history(filters)||{rows:[],total:0,accounts:[]});
  handler('grid:shiny-config',patch=>{if(!shinyTelemetry)throw Error('Telemetria indisponível');return shinyTelemetry.configure(patch);});
  handler('grid:hunt-state',()=>huntView());`);
patch('main.js','stats=new Stats(saved);',`stats=new Stats(saved);shinyTelemetry=new ShinyTelemetry(path.join(app.getPath('userData'),'gridium-shiny.json'),{onShiny:event=>{if(win&&!win.isDestroyed())win.webContents.send('grid:shiny-event',event);if(settings.alerts.desktop&&settings.alerts.shiny)notification('Gridium · Roll shiny',event.accountName+' · '+event.pokemonName+' · '+(event.captured===true?'Capturou':event.captured===false?'Escapou':'Resultado não informado'));}});networkInspector.onGamePacket=(slot,packet,at)=>shinyTelemetry?.frame(slot,packet,at);networkInspector.onGameDisconnect=slot=>shinyTelemetry?.disconnect(slot);`);
patch('main.js',"app.on('before-quit',()=>{", "app.on('before-quit',async event=>{if(shinyTelemetry&&!shinyQuitReady&&event?.preventDefault){event.preventDefault();await shinyTelemetry.close();shinyQuitReady=true;app.quit();return;}");

// Fast telemetry path. PokeIdle campo/campo.init frames are consumed by Shiny but are not
// copied/redacted/stored in NetworkInspector because Market/Hunt protocol analysis never uses
// them. Other game frames reuse the already parsed object so JSON.parse happens only once.
patch('network-inspector.js',"function summarizeSocketPayload(payload='',opcode=1){","const GAME_FRAME_TYPE_RE=/\\\"t\\\"\\s*:\\s*\\\"(?:welcome|estado|batalha|campo(?:\\.init)?)\\\"/;\nfunction summarizeSocketPayload(payload='',opcode=1){");
patch('network-inspector.js','const now=Date.now();const inactive=',`const now=Date.now();if(method==='Network.webSocketFrameReceived'&&Number(p.response?.opcode)===1){try{const url=state.sockets.get(String(p.requestId||''))||'';if(/^wss:\\/\\/(?:www\\.)?pokeidle\\.io(?:\\/|$)/i.test(url)){const raw=String(p.response?.payloadData||'');if(GAME_FRAME_TYPE_RE.test(raw)){const packet=JSON.parse(raw);if(['welcome','estado','batalha','campo','campo.init'].includes(packet?.t)){this.onGamePacket?.(slot,packet,now);if(packet.t==='campo'||packet.t==='campo.init')return;p.__gridiumGamePacket=packet;}}}}catch{}}if(method==='Network.webSocketClosed')this.onGameDisconnect?.(slot);const inactive=`);
patch('network-inspector.js','postData:summarizeSocketPayload(frame.payloadData,frame.opcode)','postData:p.__gridiumGamePacket?redactValue(p.__gridiumGamePacket):summarizeSocketPayload(frame.payloadData,frame.opcode)');
patch('network-inspector.js','detach(slot){const state=', 'detach(slot){this.onGameDisconnect?.(slot);const state=');
patch('network-inspector.js',"wc.debugger.once('detach',()=>{const x=this.states.get(slot);if(x)x.attached=false});","state.detachHandler=()=>{state.attached=false;this.onGameDisconnect?.(slot);};wc.debugger.once('detach',state.detachHandler);");
patch('network-inspector.js',"try{if(state.handler)state.wc?.debugger?.removeListener('message',state.handler)}","try{if(state.detachHandler)state.wc?.debugger?.removeListener('detach',state.detachHandler);if(state.handler)state.wc?.debugger?.removeListener('message',state.handler)}");

patch('preload.js',"state:()=>ipcRenderer.invoke('grid:state'),",`state:()=>ipcRenderer.invoke('grid:state'),
  shinyState:()=>ipcRenderer.invoke('grid:shiny-state'),
  shinyHistory:filters=>ipcRenderer.invoke('grid:shiny-history',filters),
  shinyConfig:patch=>ipcRenderer.invoke('grid:shiny-config',patch),
  onShiny:callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('grid:shiny-event',listener);return ()=>ipcRenderer.removeListener('grid:shiny-event',listener);},`);
patch('index.html','<link rel="stylesheet" href="styles.css">','<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="shiny.css">');
patch('index.html','<button class="tab" data-section="hunt">Hunt Intelligence</button>', '<button class="tab" data-section="hunt">Hunt Intelligence</button>\n    <button class="tab shiny-nav" data-section="shiny-assistant">✧ Shiny Assistente</button>');
patch('index.html','<section id="alpha"',fs.readFileSync(path.join(source,'shiny.html'),'utf8')+'\n<section id="alpha"');
patch('index.html','<script src="renderer.js"></script>','<script src="shiny-ui.js"></script>\n<script src="renderer.js"></script>');
patch('renderer.js','function render(data){','function render(data){\n  window.ShinyAssistant?.setVisible?.(activeSection===\'shiny-assistant\');');
patch('renderer.js',"function setSection(id){activeSection=id;","function setSection(id){activeSection=id;window.ShinyAssistant?.setVisible?.(id==='shiny-assistant');if(id==='shiny-assistant')window.ShinyAssistant?.open();");
// Validate all anchors before any source is changed.
for(const [name,content] of outputs)write(name,content);
for(const n of ['shiny-telemetry.js','shiny-ui.js','shiny.css'])fs.copyFileSync(path.join(source,n),path.join(target,n));
for(const n of fs.readdirSync(path.join(source,'test')))fs.copyFileSync(path.join(source,'test',n),path.join(target,'test',n));

// The assistant polls its dedicated IPC only while visible. Hidden tabs do zero Shiny DOM work
// and do not serialize the Shiny dashboard state.
function patchCopied(n,from,to){let s=read(n).replace(/\r\n/g,'\n');if(!s.includes(from))throw Error('Alpha 10 copied anchor missing: '+n+' / '+from.slice(0,80));write(n,s.replace(from,to));}
patchCopied('shiny-ui.js',
"  let historyBusy = false, historyQueued = false, toastTimer = null, audio = null, historyTotal = 0, filterTimer = null;",
"  let historyBusy = false, historyQueued = false, toastTimer = null, audio = null, historyTotal = 0, filterTimer = null;\n  let refreshBusy = false, refreshTimer = null;");
patchCopied('shiny-ui.js',
"  async function refresh() {\n    try { data = await window.gridAPI.shinyState(); render(); }\n    catch (e) { fail(e); }\n  }",
`  async function refresh(force = false) {
    if ((!active && !force) || refreshBusy) return;
    refreshBusy = true;
    try {
      const next = await window.gridAPI.shinyState();
      if (next) { data = next; render(); }
    } catch (e) { fail(e); }
    finally { refreshBusy = false; }
  }

  function stopPolling() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }
  function startPolling() {
    if (!active || refreshTimer) return;
    void refresh(true);
    refreshTimer = setInterval(() => { if (active) void refresh(); }, 3000);
  }
  function setVisible(visible) {
    visible = visible === true;
    if (active === visible) { if (visible && !refreshTimer) startPolling(); return; }
    active = visible;
    if (active) startPolling(); else stopPolling();
  }`);
patchCopied('shiny-ui.js',
"    unsubscribe(); clearTimeout(toastTimer); clearTimeout(filterTimer); void audio?.close();",
"    unsubscribe(); clearTimeout(toastTimer); clearTimeout(filterTimer); stopPolling(); void audio?.close();");
patchCopied('shiny-ui.js',
`  window.ShinyAssistant = {
    update(value, visible) {
      const changed = visible !== active || value?.at !== data?.at;
      active = visible;
      if (value) data = value;
      if (!changed) return;
      try { render(); } catch (e) { fail(e); }
    },
    open() { active = true; void refresh(); }
  };`,
`  window.ShinyAssistant = {
    setVisible,
    update(value, visible) {
      setVisible(visible);
      if (value && active) { data = value; try { render(); } catch (e) { fail(e); } }
    },
    open() { setVisible(true); void refresh(true); }
  };`);

pkg.version='3.0.0-alpha.10';write('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('Gridium Alpha 10 — Shiny Assistente integrated with low-overhead telemetry');
