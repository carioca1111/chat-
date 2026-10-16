'use strict';
(()=>{
  const RELAY='https://pokegrid-relay-209e4eb1d9.onrender.com',BACKOFF=[1000,2000,5000,10000,30000];
  const nav=document.getElementById('nav'),dash=document.getElementById('dash');if(!nav||!dash)return;
  const navButton=document.createElement('button');navButton.dataset.tab='espelhamento';navButton.innerHTML='<b>▦</b>Espelho';const settingsButton=nav.querySelector('[data-tab="ajustes"]');nav.insertBefore(navButton,settingsButton||null);
  const section=document.createElement('section');section.id='sec-espelhamento';section.className='section';section.innerHTML=`
    <div class="card"><div class="mirror-head"><div><div class="muted" style="font-size:11px">ESPELHAMENTO</div><h2 style="margin:3px 0 0">4 contas em tempo real</h2></div><span id="mirrorPcState" class="mirror-pc-state"><i></i><span>PC offline</span></span></div>
    <button id="mirrorBack" class="mirror-back">← Voltar para 2×2</button>
    <div id="mirrorGrid" class="mirror-grid">
      ${[0,1,2,3].map(i=>`<div class="mirror-tile" data-slot="${i}" data-state="offline" data-has-video="false"><video id="mirrorVideo${i}" autoplay playsinline muted></video><div class="mirror-tile-head"><strong id="mirrorName${i}">Conta ${i+1}</strong><span class="mirror-badge"><i></i><span id="mirrorState${i}">Offline</span></span></div><div id="mirrorOverlay${i}" class="mirror-overlay">Aguardando sessão…</div><span id="mirrorQuality${i}" class="mirror-quality">—</span></div>`).join('')}
    </div></div>
    <div class="card"><div class="mirror-settings"><div><b>Qualidade</b><small class="muted" style="display:block;margin-top:3px">Automática prioriza o PC.</small></div><select id="mirrorProfile"><option value="auto">Automática</option><option value="economy">Economia</option><option value="balanced">Balanceada</option><option value="high">Alta</option></select><label class="mirror-data-toggle"><input id="mirrorSaveData" type="checkbox"> Economizar dados móveis</label><span id="mirrorNetwork" class="muted">Rede: detectando…</span></div>
    <div class="mirror-metrics"><div class="mirror-metric"><span>CPU Gridium</span><b id="mirrorCpu">—</b></div><div class="mirror-metric"><span>RAM Gridium</span><b id="mirrorRam">—</b></div><div class="mirror-metric"><span>Upload</span><b id="mirrorUpload">—</b></div><div class="mirror-metric"><span>Codec / encoder</span><b id="mirrorCodec">—</b></div></div><p class="mirror-note">Somente visualização. Toques nunca são enviados para o jogo. Ao sair desta aba, bloquear a tela ou colocar o app em segundo plano, a transmissão é suspensa.</p></div>`;
  dash.appendChild(section);
  const $m=id=>document.getElementById(id),tiles=[...section.querySelectorAll('.mirror-tile')],videos=[0,1,2,3].map(i=>$m('mirrorVideo'+i));
  const profile=$m('mirrorProfile'),saveData=$m('mirrorSaveData'),pcState=$m('mirrorPcState');
  profile.value=localStorage.getItem('gridium:mirrorProfile')||'auto';saveData.checked=localStorage.getItem('gridium:mirrorSaveData')!=='0';
  let active=false,foreground=true,suspended=false,sessionId='',iceServers=[],pc=null,pollController=null,retryTimer=null,retryIndex=0,generation=0,view='grid',selectedSlot=0,pendingIce=[],metrics=null;
  const token=()=>localStorage.getItem('pokegrid:deviceToken')||'';
  function androidCall(name,...args){try{if(window.Android&&typeof Android[name]==='function')return Android[name](...args)}catch{}return null;}
  function networkType(){const native=String(androidCall('getNetworkType')||'').toLowerCase();if(native)return native;const t=String(navigator.connection?.type||'').toLowerCase();return t||'unknown';}
  function isCellular(){return networkType()==='cellular';}
  function renderNetwork(){const t=networkType();$m('mirrorNetwork').textContent='Rede: '+(t==='wifi'?'Wi‑Fi':t==='cellular'?'dados móveis':t==='ethernet'?'Ethernet':'não identificada');}
  function setPc(text,online=false){pcState.classList.toggle('online',online);pcState.querySelector('span').textContent=text;}
  function setTile(slot,state,text,hasVideo){const tile=tiles[slot];if(!tile)return;tile.dataset.state=state;tile.dataset.hasVideo=hasVideo?'true':'false';$m('mirrorState'+slot).textContent=text||state;$m('mirrorOverlay'+slot).textContent=state==='connecting'?'Conectando…':state==='offline'?'Conta não está ativa.':'Aguardando vídeo…';}
  function formatRate(b){b=Number(b)||0;return b>=1000000?(b/1000000).toFixed(2)+' Mbps':Math.round(b/1000)+' kbps';}
  async function mirrorApi(path,options={}){const t=token();if(!t){const e=new Error('not-paired');e.status=401;throw e}const r=await fetch(RELAY+path,{...options,headers:{'content-type':'application/json',authorization:'Bearer '+t,...(options.headers||{})},cache:'no-store'});let d={};try{d=await r.json()}catch{}if(!r.ok){const e=new Error(d.error||String(r.status));e.status=r.status;throw e}return d;}
  function statePayload(extra={}){return {active,suspended,sessionId,profile:profile.value,view,selectedSlot,cellular:isCellular(),saveData:saveData.checked,...extra};}
  async function sendState(extra={}){const d=await mirrorApi('/api/v1/mirror/mobile/state',{method:'POST',body:JSON.stringify(statePayload(extra))});sessionId=String(d.sessionId||'');iceServers=Array.isArray(d.iceServers)?d.iceServers:iceServers;return d;}
  async function signal(type,payload){if(!sessionId)return;return mirrorApi('/api/v1/mirror/mobile/signal',{method:'POST',body:JSON.stringify({sessionId,type,payload})});}
  function closePeer(){if(pc){try{pc.ontrack=null;pc.onicecandidate=null;pc.onconnectionstatechange=null;pc.close()}catch{}pc=null;}pendingIce=[];for(let i=0;i<4;i++){try{videos[i].srcObject=null}catch{}tiles[i].dataset.hasVideo='false';}}
  function stopPoll(){try{pollController?.abort()}catch{}pollController=null;}
  function clearRetry(){clearTimeout(retryTimer);retryTimer=null;}
  function expirePairing(){clearRetry();stopPoll();generation++;closePeer();active=false;suspended=false;sessionId='';setPc('Pareamento expirado',false);for(let i=0;i<4;i++)setTile(i,'offline','Offline',false);}
  function scheduleReconnect(reason){if(!active||suspended||!foreground)return;stopPoll();closePeer();clearRetry();setPc(reason||'Reconectando…',false);for(let i=0;i<4;i++)setTile(i,'connecting','Conectando',false);const wait=BACKOFF[Math.min(retryIndex++,BACKOFF.length-1)];sessionId='';retryTimer=setTimeout(()=>void connect(),wait);}
  async function makePeer(offer){
    closePeer();pc=new RTCPeerConnection({iceServers,bundlePolicy:'max-bundle',rtcpMuxPolicy:'require'});const local=pc;
    pc.ontrack=e=>{if(local!==pc)return;let slot=Number(e.transceiver?.mid);if(!Number.isInteger(slot)||slot<0||slot>3)slot=videos.findIndex(v=>!v.srcObject);if(slot<0)slot=0;const stream=e.streams?.[0]||new MediaStream([e.track]);videos[slot].srcObject=stream;setTile(slot,'online','Online',true);e.track.onmute=()=>{if(local===pc)$m('mirrorQuality'+slot).textContent='Pausado'};e.track.onunmute=()=>{if(local===pc)$m('mirrorQuality'+slot).textContent='Recebendo'};};
    pc.onicecandidate=e=>{if(e.candidate&&local===pc)void signal('ice',e.candidate.toJSON?e.candidate.toJSON():e.candidate).catch(()=>{})};
    pc.onconnectionstatechange=()=>{if(local!==pc)return;const s=pc.connectionState;if(s==='connected'){retryIndex=0;setPc('PC conectado',true);for(let i=0;i<4;i++)if(videos[i].srcObject)setTile(i,'online','Online',true);}else if(s==='connecting'||s==='new')setPc('Conectando…',false);else if(s==='failed')scheduleReconnect('Falha de stream');else if(s==='disconnected')setTimeout(()=>{if(local===pc&&pc?.connectionState==='disconnected')scheduleReconnect('Reconectando…')},2500);};
    await pc.setRemoteDescription(offer);for(const c of pendingIce.splice(0))try{await pc.addIceCandidate(c)}catch{}const answer=await pc.createAnswer();await pc.setLocalDescription(answer);await signal('answer',{type:pc.localDescription.type,sdp:pc.localDescription.sdp});
  }
  function applyMetrics(m){metrics=m||{};const sys=m?.system||{},rawDelta=m?.cpuDelta,delta=rawDelta==null?NaN:Number(rawDelta);$m('mirrorCpu').textContent=sys.cpu==null?'—':sys.cpu.toFixed?.(1)+'%'+(Number.isFinite(delta)?' ('+(delta>=0?'+':'')+delta.toFixed(1)+'%)':'');$m('mirrorRam').textContent=sys.memoryMB==null?'—':Math.round(sys.memoryMB)+' MB';$m('mirrorUpload').textContent=formatRate(m?.totalBitrate);$m('mirrorCodec').textContent=[m?.codec?.replace?.('video/',''),m?.encoderImplementation].filter(Boolean).join(' · ')||'não exposto';
    for(const a of m?.accounts||[]){const slot=Number(a.slot);if(slot<0||slot>3)continue;$m('mirrorName'+slot).textContent=a.name||('Conta '+(slot+1));if(a.online===false&&!videos[slot].srcObject)setTile(slot,'offline','Offline',false);}
    for(const s of m?.streams||[]){const slot=Number(s.slot);if(slot<0||slot>3)continue;const q=s.qualityLimitationReason==='bandwidth'?'Rede limitada':s.qualityLimitationReason==='cpu'?'PC reduzindo':'Boa';$m('mirrorQuality'+slot).textContent=(s.codec?.replace?.('video/','')||'Vídeo')+' · '+q;}
  }
  async function handleEvent(event){if(!event)return;if(event.type==='offer'){await makePeer(event.payload);return}if(event.type==='ice'){if(pc?.remoteDescription)try{await pc.addIceCandidate(event.payload)}catch{}else pendingIce.push(event.payload);return}if(event.type==='metrics'){applyMetrics(event.payload);return}if(event.type==='bye')scheduleReconnect('PC reiniciando…');}
  async function pollLoop(gen){
    while(active&&!suspended&&foreground&&gen===generation&&sessionId){
      try{pollController=new AbortController();const d=await mirrorApi('/api/v1/mirror/mobile/poll?sessionId='+encodeURIComponent(sessionId),{signal:pollController.signal});pollController=null;if(gen!==generation)return;await handleEvent(d.event);}
      catch(e){pollController=null;if(gen!==generation||!active||suspended||!foreground||e.name==='AbortError')return;if(e.status===401){expirePairing();return}scheduleReconnect(e.status===409?'Sessão renovando…':'Conexão instável');return;}
    }
  }
  async function connect(){
    if(!active||suspended||!foreground)return;if(!token()){setPc('Pareie o celular',false);return}clearRetry();const gen=++generation;setPc('Conectando…',false);for(let i=0;i<4;i++)setTile(i,'connecting','Conectando',false);
    try{const d=await sendState({active:true,suspended:false});if(gen!==generation)return;iceServers=Array.isArray(d.iceServers)?d.iceServers:[];void pollLoop(gen);}
    catch(e){if(gen!==generation)return;if(e.status===401){expirePairing();return}scheduleReconnect('PC indisponível');}
  }
  async function start(){if(active&&!suspended)return;active=true;suspended=false;retryIndex=0;renderNetwork();await connect();}
  async function stop({suspend=false}={}){clearRetry();stopPoll();generation++;const had=active||sessionId;suspended=suspend;closePeer();if(had&&token())try{await sendState({active:suspend, suspended:suspend})}catch{}if(!suspend){active=false;sessionId='';}setPc(suspend?'Espelhamento suspenso':'PC offline',false);for(let i=0;i<4;i++)setTile(i,'offline',suspend?'Pausado':'Offline',false);}
  async function updateState(){if(!active||suspended||!foreground)return;try{await sendState()}catch(e){if(e.status===401)expirePairing();else scheduleReconnect('Atualizando…')}}
  function setView(next,slot=selectedSlot){view=next==='single'?'single':'grid';selectedSlot=Math.max(0,Math.min(3,Number(slot)||0));section.classList.toggle('mirror-single',view==='single');tiles.forEach((t,i)=>t.classList.toggle('selected',i===selectedSlot));void updateState();}
  navButton.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===navButton));document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x===section));void start();};
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-tab]');if(b&&b!==navButton&&active)void stop({suspend:false})});
  tiles.forEach((tile,i)=>tile.addEventListener('click',()=>{if(view==='grid')setView('single',i)}));$m('mirrorBack').onclick=()=>setView('grid',selectedSlot);
  profile.onchange=()=>{localStorage.setItem('gridium:mirrorProfile',profile.value);void updateState()};saveData.onchange=()=>{localStorage.setItem('gridium:mirrorSaveData',saveData.checked?'1':'0');void updateState()};
  function visibility(on){foreground=on===true&&!document.hidden;if(!foreground){if(active)void stop({suspend:true});return}if(suspended&&section.classList.contains('active')){suspended=false;active=true;void connect();}}
  window.__gridiumVisibility=on=>visibility(on);document.addEventListener('visibilitychange',()=>visibility(!document.hidden));navigator.connection?.addEventListener?.('change',()=>{renderNetwork();if(active&&!suspended)void updateState()});renderNetwork();
})();
