const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let state = { opportunities: [], anomalies: [], recentEvents: [], stats: {}, dataMode: 'WAITING_REAL_FEED' };
let selectedKey = null;

function money(v, currency='GEM') {
  if (!Number.isFinite(v)) return '—';
  if (currency === 'COIN') {
    if (v >= 1e9) return `${(v/1e9).toFixed(2)} B`;
    if (v >= 1e6) return `${(v/1e6).toFixed(1)} M`;
    if (v >= 1e3) return `${(v/1e3).toFixed(1)} K`;
    return Math.round(v).toLocaleString('pt-BR');
  }
  return `${Math.round(v).toLocaleString('pt-BR')} 💎`;
}
function pct(v){return `${v>=0?'+':''}${Number(v||0).toFixed(1)}%`}
function ago(ts){const s=Math.max(0,(Date.now()-ts)/1000);if(s<60)return `${Math.floor(s)}s`;if(s<3600)return `${Math.floor(s/60)}min`;if(s<86400)return `${Math.floor(s/3600)}h`;return `${Math.floor(s/86400)}d`}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

async function load(){
  try{
    const r=await fetch('/api/dashboard',{cache:'no-store'}); state=await r.json(); render();
  }catch(e){ $('#updated').textContent='Sem conexão'; }
}

function filtered(items){
  const q=$('#search').value.trim().toLowerCase(); const cur=$('#currency').value; const ms=Number($('#minScore').value); const net=$('#onlyNet').checked;
  return items.filter(x=>(!q||x.name.toLowerCase().includes(q))&&(cur==='ALL'||x.currency===cur)&&x.score>=ms&&(!net||x.netProfit>0));
}

function render(){
  const live=state.dataMode==='REAL_FEED';
  $('#kAssets').textContent=state.stats.trackedAssets??0; $('#kAnoms').textContent=state.stats.anomalies??0; $('#kOpps').textContent=state.stats.strongOpportunities??0; $('#kEvents').textContent=(state.stats.events??0).toLocaleString('pt-BR');
  $('#updated').textContent=live?`feed real • ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`:'Aguardando feed real • nenhum dado simulado';
  if($('#dataMode')) $('#dataMode').textContent=live?'FEED REAL CONECTADO':'AGUARDANDO FEED REAL';
  if($('#dataModeText')) $('#dataModeText').textContent=live?'Exibindo somente eventos recebidos do coletor real do Market.':'Nenhum Pokémon, item, preço ou oportunidade será inventado. O painel só exibirá dados recebidos do Market.';
  renderCards(); renderTable(); renderAnomalies(); renderFeed();
  if(selectedKey) openDrawer(selectedKey, false);
}

function waitingMessage(){return state.dataMode==='REAL_FEED'?'Nenhuma oportunidade atende aos filtros agora.':'Aguardando o feed real do Market. Nenhum dado fictício será exibido.'}

function renderCards(){
  const rows=filtered(state.opportunities).slice(0,9); const host=$('#cards');
  if(!rows.length){host.innerHTML=`<div class="empty">${waitingMessage()}</div>`;return}
  host.innerHTML=rows.map(x=>`<article class="opp-card ${x.severity}" data-key="${esc(x.key)}"><div class="card-accent"></div><div class="card-body">
    <div class="card-head"><div><div class="asset-name">${esc(x.name)}</div><div class="asset-meta">${x.kind==='pokemon'?'POKÉMON':'ITEM'} • ${x.currency}</div></div><div class="score">${x.score}</div></div>
    <div class="price-grid"><div class="metric"><span>Floor agora</span><b>${money(x.floor,x.currency)}</b></div><div class="metric"><span>Valor justo</span><b>${money(x.fairValue,x.currency)}</b></div><div class="metric"><span>Desconto</span><b class="good">${pct(x.discountPct)}</b></div><div class="metric"><span>Lucro líquido est.</span><b class="good">${money(x.netProfit,x.currency)}</b></div></div>
    <div class="badges">${x.anomalyTypes.slice(0,3).map((t,i)=>`<span class="badge ${i===0&&x.score>=80?'hot':''}">${esc(t)}</span>`).join('')}</div>
    <div class="mini-row"><span>Liquidez <b>${x.liquidity}/100</b></span><span>Confiança <b>${x.confidence}%</b></span><span>${ago(x.updatedAt)}</span></div>
  </div></article>`).join('');
  host.querySelectorAll('[data-key]').forEach(el=>el.onclick=()=>openDrawer(el.dataset.key));
}

function renderTable(){
  const rows=filtered(state.opportunities); $('#oppTable').innerHTML=rows.map(x=>`<tr data-key="${esc(x.key)}"><td><strong>${esc(x.name)}</strong><br><small>${x.kind} • ${x.currency}</small></td><td>${money(x.floor,x.currency)}</td><td>${money(x.fairValue,x.currency)}</td><td class="positive">${pct(x.discountPct)}</td><td class="positive">${money(x.netProfit,x.currency)}</td><td>${x.liquidity}/100</td><td>${x.confidence}%</td><td><span class="score-pill">${x.score}</span></td></tr>`).join('') || `<tr><td colspan="8">${waitingMessage()}</td></tr>`;
  $$('#oppTable tr[data-key]').forEach(el=>el.onclick=()=>openDrawer(el.dataset.key));
}

function renderAnomalies(){
  const rows=filtered(state.anomalies); $('#anomalyList').innerHTML=rows.map(x=>`<article class="anomaly-item" data-key="${esc(x.key)}"><div class="anom-icon">⚡</div><div><h3>${esc(x.name)}</h3><p>${x.anomalyTypes.join(' • ')} · floor ${money(x.floor,x.currency)} · valor justo ${money(x.fairValue,x.currency)}</p></div><div class="anom-score">${x.score}</div></article>`).join('') || `<div class="empty">${state.dataMode==='REAL_FEED'?'Nenhuma anomalia nos filtros atuais.':'Aguardando dados reais suficientes para detectar anomalias.'}</div>`;
  $$('#anomalyList [data-key]').forEach(el=>el.onclick=()=>openDrawer(el.dataset.key));
}

function renderFeed(){
  $('#feedList').innerHTML=state.recentEvents.slice(0,50).map(e=>`<article class="feed-item"><span class="feed-time">${new Date(e.ts).toLocaleTimeString('pt-BR')}<br>${ago(e.ts)}</span><div><strong>${esc(e.name)}</strong><p>${eventLabel(e.type)} ${e.seller?'• '+esc(e.seller):''}</p></div><span class="feed-price">${money(e.price,e.currency)}</span></article>`).join('') || `<div class="empty">${state.dataMode==='REAL_FEED'?'Nenhum evento recente.':'Nenhum evento real recebido ainda.'}</div>`;
}
function eventLabel(t){return ({listing_created:'Novo anúncio',listing_updated:'Preço alterado',listing_sold:'Vendido',listing_cancelled:'Cancelado'})[t]||t}

function openDrawer(key, doOpen=true){
  const x=[...state.opportunities,...state.anomalies].find(i=>i.key===key); if(!x)return; selectedKey=key;
  $('#drawerContent').innerHTML=`<span class="eyebrow">ANÁLISE DO SINAL</span><h2>${esc(x.name)}</h2><div class="drawer-sub">${x.kind.toUpperCase()} • ${x.currency} • atualizado há ${ago(x.updatedAt)}</div>
    <div class="hero-score"><div class="big-score"><strong>${x.score}</strong><span>OPPORTUNITY SCORE</span></div><div class="reason-list">${(x.anomalyTypes.length?x.anomalyTypes:['SEM ANOMALIA FORTE']).map(t=>`<div class="reason">✓ ${esc(t)}</div>`).join('')}</div></div>
    <div class="drawer-grid"><div class="drawer-metric"><span>FLOOR</span><b>${money(x.floor,x.currency)}</b></div><div class="drawer-metric"><span>VALOR JUSTO</span><b>${money(x.fairValue,x.currency)}</b></div><div class="drawer-metric"><span>DESCONTO</span><b class="positive">${pct(x.discountPct)}</b></div><div class="drawer-metric"><span>LUCRO LÍQUIDO EST.</span><b class="positive">${money(x.netProfit,x.currency)}</b></div><div class="drawer-metric"><span>LIQUIDEZ</span><b>${x.liquidity}/100</b></div><div class="drawer-metric"><span>CONFIANÇA</span><b>${x.confidence}%</b></div><div class="drawer-metric"><span>VENDAS 24H</span><b>${x.sales24h}</b></div><div class="drawer-metric"><span>ANÚNCIOS ATIVOS</span><b>${x.activeListings}</b></div></div>
    <div class="chart"><canvas id="chart" width="800" height="240"></canvas></div>
    <div class="risk-note">A estimativa usa exclusivamente eventos recebidos pelo feed conectado e aplica uma taxa configurada para calcular margem líquida. Preço de mercado pode mudar e não há garantia de venda ou lucro.</div>`;
  drawChart(x.timeline||[]); if(doOpen)$('#drawer').classList.add('open');
}

function drawChart(points){
  const c=$('#chart');if(!c)return;const ctx=c.getContext('2d');const dpr=devicePixelRatio||1;c.width=c.clientWidth*dpr;c.height=c.clientHeight*dpr;ctx.scale(dpr,dpr);const w=c.clientWidth,h=c.clientHeight;ctx.clearRect(0,0,w,h);
  const vals=points.flatMap(p=>[p.floor,p.fair]).filter(Boolean);if(vals.length<2){ctx.fillStyle='#597269';ctx.font='11px system-ui';ctx.fillText('Histórico insuficiente',14,24);return}
  const min=Math.min(...vals)*.97,max=Math.max(...vals)*1.03, X=i=>10+i*(w-20)/Math.max(1,points.length-1), Y=v=>h-10-(v-min)*(h-20)/(max-min||1);
  ctx.strokeStyle='#1d322b';ctx.lineWidth=1;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(8,i*h/4);ctx.lineTo(w-8,i*h/4);ctx.stroke()}
  const line=(field,color)=>{ctx.beginPath();let started=false;points.forEach((p,i)=>{if(!p[field])return;const x=X(i),y=Y(p[field]);if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y)});ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke()};line('fair','#547bff');line('floor','#62f5b1');
}

$$('.nav').forEach(b=>b.onclick=()=>{$$('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.tab-panel').forEach(x=>x.classList.remove('active'));$('#'+b.dataset.tab).classList.add('active')});
['search','currency','minScore','onlyNet'].forEach(id=>$('#'+id).addEventListener(id==='search'?'input':'change',render));
$('#refreshBtn').onclick=load; $$('[data-close]').forEach(x=>x.onclick=()=>{$('#drawer').classList.remove('open');selectedKey=null});

try{const es=new EventSource('/api/stream');es.addEventListener('radar',e=>{const msg=JSON.parse(e.data);if(msg.type==='update')load()});es.onerror=()=>{}}catch{}
load();setInterval(load,12000);
