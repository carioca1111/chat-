'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = x => String(x ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 0});
  const pctFmt = new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 2, style: 'percent'});
  const number = x => x == null ? '—' : fmt.format(x);
  const percent = x => x == null ? '—' : pctFmt.format(x);
  const duration = x => {
    if (x == null || !Number.isFinite(x)) return '—';
    if (x < 60_000) return '< 1 min';
    const h = Math.floor(x / 3_600_000), m = Math.floor(x % 3_600_000 / 60_000);
    if (h >= 48) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
    return h ? `${h}h ${m}min` : `${m}min`;
  };
  const date = x => new Date(x).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo'});
  const fact = (title, value, cls='') => `<div class="sh-fact ${cls}"><span>${esc(title)}</span><b>${esc(value)}</b></div>`;
  const boost = x => x === null || x === undefined ? 'Não informado' : x ? 'Ativo' : 'Inativo';
  const setHTML = (id, html) => { const el=$(id); if (el && el.innerHTML !== html) el.innerHTML = html; };
  const setText = (id, text) => { const el=$(id); const v=String(text ?? ''); if (el && el.textContent !== v) el.textContent = v; };
  const clamp = n => Math.max(0, Math.min(100, Number(n) || 0));

  let data = null, account = '', active = false, offset = 0, historyVersion = -1;
  let historyBusy = false, historyQueued = false, toastTimer = null, audio = null, historyTotal = 0, filterTimer = null;

  function fail(e) {
    $('shError').hidden = false;
    setText('shError', 'Dados temporariamente indisponíveis · ' + String(e?.message || e).slice(0, 180));
  }

  async function configure(p) {
    try {
      const prefs = await window.gridAPI.shinyConfig(p);
      if (data) data.preferences = prefs;
      await refresh();
      return true;
    } catch (e) { fail(e); return false; }
  }

  function setOptions(id, items, value) {
    const el = $(id);
    const html = items.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    if (el.innerHTML !== html) el.innerHTML = html;
    if (el.value !== value) el.value = value;
  }

  function recommendation(a) {
    if (!a) return 'Entre em uma conta no Gridium. A coleta começa automaticamente quando o jogo envia o estado da conta.';
    if (!a.online) return 'A conta está sem telemetria ao vivo. O histórico foi preservado e voltará a atualizar após reconectar.';
    if (a.status === 'SEM BOLAS') return 'Ação necessária: estoque de bolas zerado. O farm pode continuar, mas novas tentativas de captura ficam comprometidas.';
    if (a.status === 'BOLAS < 15 MIN') return `Ação necessária: no ritmo atual, o estoque dura aproximadamente ${duration(a.ballRunwayMs)}.`;
    if (a.status === 'Lure termina em breve') return `Secret Lure termina em ${duration(a.boosts?.lureMs)}. Reavalie a hunt quando o bônus mudar, porque o contexto comparável também muda.`;
    if (a.rate == null) return 'Calibrando: precisamos de pelo menos 1 minuto de tempo observado para calcular o ritmo recente.';
    if ((a.measurementQuality ?? 0) < 60) return `Medição ainda ganhando confiança (${number(a.measurementQuality)}%). Continue nesta hunt por mais alguns minutos antes de trocar.`;
    if (!a.best) return 'Continue medindo hunts: faltam comparações com pelo menos 5 minutos e 20 tentativas nas mesmas condições.';
    if (a.improvement > 5) return `${a.best.name} foi ${number(a.improvement)}% mais rápida nas mesmas condições observadas. É a melhor candidata medida até agora.`;
    if (a.stability != null && a.stability < 60) return 'O ritmo dos últimos 5 minutos está oscilando bastante. Espere estabilizar antes de tomar uma decisão.';
    return 'Manter esta hunt: o ritmo atual está competitivo dentro das medições comparáveis disponíveis.';
  }

  function renderPulse(a) {
    const trend = a?.trendPct == null ? '—' : a.trendPct > 8 ? `▲ ${number(a.trendPct)}%` : a.trendPct < -8 ? `▼ ${number(Math.abs(a.trendPct))}%` : '≈ estável';
    setHTML('shPulse', [
      ['Qualidade da medição', a ? number(a.measurementQuality) + '%' : '—', (a?.measurementQuality ?? 0) >= 75 ? 'good' : (a?.measurementQuality ?? 0) >= 45 ? 'warn' : 'info'],
      ['Estabilidade 5m × 15m', a?.stability == null ? '—' : number(a.stability) + '%', (a?.stability ?? 0) >= 75 ? 'good' : 'warn'],
      ['Tendência recente', trend, a?.trendPct > 8 ? 'good' : a?.trendPct < -8 ? 'bad' : 'info'],
      ['Autonomia de bolas', duration(a?.ballRunwayMs), a?.ballRunwayMs != null && a.ballRunwayMs < 15*60_000 ? 'bad' : 'good'],
      ['Chance teórica / 1h', percent(a?.chanceHour), 'info']
    ].map(x => `<div class="sh-pulse ${x[2]}"><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join(''));
  }

  function render() {
    if (!active || !data) return;
    $('shLoading').hidden = true;
    $('shError').hidden = !data.error;
    if (data.error) setText('shError', data.error);

    const accounts = data.accounts || [];
    if (!accounts.some(a => a.id === account)) account = accounts[0]?.id || '';
    setOptions('shAccount', accounts.length ? accounts : [{id:'', name:'Nenhuma conta com telemetria'}], account);
    const a = accounts.find(x => x.id === account), prefs = data.preferences || {};

    $('shSound').checked = prefs.sound !== false;
    if (document.activeElement !== $('shTarget')) $('shTarget').value = prefs.target || '';
    $('shMode').value = prefs.mode || 'more';

    setText('shStatus', a?.status || 'Aguardando conexão');
    setText('shScore', a?.efficiency == null ? '—' : number(a.efficiency));
    setText('shScoreNote', a?.efficiency == null ? 'CALIBRANDO…' : '/ 100');
    $('shRing').setAttribute('stroke-dasharray', `${clamp(a?.efficiency) * 3.14} 315`);
    renderPulse(a);

    setHTML('shFarmFacts', [
      ['Tentativas/h · 15 min', number(a?.rate)],
      ['Tentativas hoje', number(a?.today?.attempts)],
      ['Desde último shiny', number(a?.sinceShiny)],
      ['Hunt atual', a?.hunt || '—']
    ].map(x => fact(...x)).join(''));
    setText('shRecommendation', recommendation(a));

    const inventory = a?.online ? a.inventory : null;
    const ball = name => {
      const b = data.catalog?.find(x => x.nome?.toLowerCase().includes(name));
      return b && inventory ? number(inventory[b.id] ?? 0) : '—';
    };
    setHTML('shRadar', [
      ['Tentativas hoje', number(a?.today?.attempts)],
      ['Tentativas/h · 5 min', number(a?.windows?.[5]?.rate)],
      ['Tentativas/h · 15 min', number(a?.windows?.[15]?.rate)],
      ['Tentativas/h · 60 min', number(a?.windows?.[60]?.rate)],
      ['Qualidade medição', a ? number(a.measurementQuality) + '%' : '—'],
      ['Estabilidade', a?.stability == null ? '—' : number(a.stability) + '%'],
      ['Autonomia de bolas', duration(a?.ballRunwayMs)],
      ['Chance teórica · 1h', percent(a?.chanceHour)],
      ['Janela teórica · 50%', duration(a?.eta50Ms)],
      ['Farm observado · sessão', duration(a?.farmMs)],
      ['Prob. acumulada observada', percent(a?.probability)],
      ['Shinies encontrados', number(a?.seen)],
      ['Capturados', number(a?.captured)],
      ['Escaparam', number(a?.escaped)],
      ['Ultra Balls', ball('ultra')],
      ['Beast Balls', ball('beast')],
      ['Secret Lure restante', duration(a?.online ? a.boosts?.lureMs : null)],
      ['Capture Boost restante', duration(a?.online ? a.boosts?.captureMs : null)],
      ['Sem shiny há', duration(a?.lastShiny ? data.at - a.lastShiny : null)],
      ['Tentativas no modelo', number(a?.probabilityAttempts)]
    ].map(x => fact(...x)).join(''));

    const ranks = a?.rankings || [];
    setHTML('shRanking', ranks.length ? ranks.slice(0, 5).map((r, i) => `
      <div class="sh-rank"><strong>${i + 1}</strong><div><b>${esc(r.name)}</b>
      <small>${number(r.rate)} tentativas/h${prefs.mode === 'target' ? ' do alvo' : ''} · ${duration(r.observedMs)} observados</small>
      <progress max="100" value="${ranks[0].rate > 0 ? r.rate / ranks[0].rate * 100 : 0}"></progress>
      <small>${number(r.killsRate)} abates/h · ${number(r.bodiesRate)} corpos/h</small></div></div>`).join('')
      : '<p class="sh-empty">Calibrando… Meça outras hunts nas mesmas condições para criar uma comparação confiável.</p>');

    setHTML('shSpecies', (a?.species || []).map(s => `<option value="${esc(s)}"></option>`).join(''));
    const targetMode = prefs.mode === 'target' && prefs.target;
    setHTML('shTargetFacts', [
      ['Alvo', prefs.target || 'Escolha uma espécie'],
      ['Melhor hunt medida', targetMode ? a?.best?.name || 'Calibrando…' : 'Ative o modo específico'],
      ['Tentativas/h do alvo', targetMode ? number(a?.best?.rate) : '—'],
      ['Chance teórica · 1h', percent(a?.chanceHour)],
      ['Janela teórica · 50%', duration(a?.eta50Ms)],
      ['Chance de captura', 'Ainda não validada'],
      ['Bola recomendada', 'Aguardando chance/custos'],
      ['Secret Lure', boost(a?.online ? a.boosts?.secretLure : null)],
      ['Capture Boost', boost(a?.online ? a.boosts?.captureBoost : null)],
      ['Kick Shiny / Capture', boost(a?.online ? a.boosts?.kickShiny : null) + ' / ' + boost(a?.online ? a.boosts?.kickCapture : null)]
    ].map(x => fact(...x)).join(''));

    setText('shAccountCount', accounts.filter(x => x.online).length + ' com telemetria');
    setHTML('shAccounts', accounts.length ? accounts.map(x => `
      <button data-sh-account="${esc(x.id)}" class="sh-account ${x.id === account ? 'selected' : ''} ${!x.online || x.stock === 0 || x.status === 'Hunt sem roll shiny' ? 'sh-bad' : x.status === 'BOLAS < 15 MIN' ? 'sh-warn' : x.rate === null ? 'sh-info' : ''}">
      <b><span class="sh-dot"></span>${esc(x.name)}</b><small>${esc(x.status)}</small>
      <small>${number(x.rate)} tentativas/h · ${number(x.stock)} bolas · ${duration(x.ballRunwayMs)} de autonomia</small></button>`).join('')
      : '<p class="sh-empty">Nenhuma conta enviou o estado do jogo. Abra Contas e faça login.</p>');

    const recent = accounts.flatMap(x => x.recent || []).sort((x, y) => y.timestamp - x.timestamp).slice(0, 5);
    setHTML('shEvents', recent.length ? recent.map(e => `<div class="sh-event"><b>✧ ROLL SHINY DETECTADO</b><small>${esc(e.pokemonName)} · ${esc(e.accountName)} · ${esc(e.huntName)}</small><small>${esc(date(e.timestamp))} · ${esc(e.ball)}</small><span class="sh-result ${e.captured === false ? 'escaped' : ''}">${e.captured === true ? 'CAPTUROU ✓' : e.captured === false ? 'ESCAPOU ✕' : 'RESULTADO NÃO INFORMADO'}</span></div>`).join('')
      : '<p class="sh-empty">Nenhum roll shiny registrado. A detecção usa o evento real da tentativa de captura.</p>');

    if (historyVersion !== data.historyRevision) { historyVersion = data.historyRevision; void history(); }
  }

  async function history() {
    if (historyBusy) { historyQueued = true; return; }
    historyBusy = true;
    try {
      const h = await window.gridAPI.shinyHistory({days: Number($('shDays').value), account: $('shHistoryAccount').value, species: $('shFilterSpecies').value, result: $('shResult').value, offset});
      historyTotal = h.total;
      setOptions('shHistoryAccount', [{id:'', name:'Todas as contas'}, ...h.accounts], $('shHistoryAccount').value);
      setHTML('shHistory', h.rows.length ? h.rows.map(e => `<tr><td>${esc(e.pokemonName)}</td><td>${esc(e.accountName)}</td><td>${esc(e.huntName)}</td><td>${esc(date(e.timestamp))}</td><td class="sh-result ${e.captured === false ? 'escaped' : ''}">${e.captured === true ? 'Capturou' : e.captured === false ? 'Escapou' : 'Não informado'}</td><td>${esc(e.ball)}</td><td>${esc(['secretLure','captureBoost','kickShiny','kickCapture'].map((k,i) => ['Lure','Capture','Kick Shiny','Kick Capture'][i] + ': ' + boost(e[k])).join(' · '))}</td></tr>`).join('')
        : '<tr><td colspan="7">Nenhum roll para estes filtros.</td></tr>');
      setText('shHistoryCount', number(h.total) + ' registros neste filtro');
      $('shPrevious').disabled = offset === 0;
      $('shNext').disabled = offset + 50 >= h.total;
      setText('shPage', `${Math.floor(offset / 50) + 1} / ${Math.max(1, Math.ceil(h.total / 50))}`);
    } catch (e) { fail(e); }
    finally { historyBusy = false; if (historyQueued) { historyQueued = false; void history(); } }
  }

  async function refresh() {
    try { data = await window.gridAPI.shinyState(); render(); }
    catch (e) { fail(e); }
  }

  function play() {
    if (data?.preferences?.sound === false) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audio ??= new AudioCtx();
      void audio.resume().then(() => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(880, audio.currentTime);
        o.frequency.exponentialRampToValueAtTime(1320, audio.currentTime + .2);
        g.gain.setValueAtTime(.07, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .5);
        o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + .5);
      });
    } catch {/* OS may deny sound until the first user gesture. */}
  }

  function event(e) {
    const t = $('shToast');
    t.textContent = `✧ ${e.pokemonName} · ${e.accountName} · ${e.captured === true ? 'CAPTUROU ✓' : e.captured === false ? 'ESCAPOU ✕' : 'Roll shiny detectado'}`;
    t.hidden = false;
    account = e.accountId;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 12_000);
    play(); historyVersion = -1;
    if (active) void refresh();
  }

  $('shToast').onclick = () => { $('shToast').hidden = true; document.querySelector('[data-section="shiny-assistant"]')?.click(); };
  $('shRefresh').onclick = () => { void refresh(); void history(); };
  $('shAccount').onchange = e => { account = e.target.value; render(); };
  $('shSound').onchange = e => void configure({sound: e.target.checked});
  $('shMode').onchange = e => void configure({mode: e.target.value});
  $('shTargetForm').onsubmit = async e => {
    e.preventDefault();
    if (await configure({target: $('shTarget').value, mode: 'target'})) setText('shStrategyNote', 'Alvo salvo para análise. Troque de hunt manualmente conforme a recomendação.');
  };

  $('shAccounts').onclick = e => {
    const button = e.target.closest?.('[data-sh-account]');
    if (!button) return;
    account = button.dataset.shAccount;
    render();
  };

  for (const id of ['shDays', 'shHistoryAccount', 'shResult']) $(id).onchange = () => { offset = 0; void history(); };
  $('shFilterSpecies').oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => { offset = 0; void history(); }, 250);
  };
  $('shPrevious').onclick = () => { offset = Math.max(0, offset - 50); void history(); };
  $('shNext').onclick = () => { if (offset + 50 < historyTotal) offset += 50; void history(); };

  const unsubscribe = window.gridAPI.onShiny(event);
  window.addEventListener('beforeunload', () => {
    unsubscribe(); clearTimeout(toastTimer); clearTimeout(filterTimer); void audio?.close();
  }, {once: true});

  window.ShinyAssistant = {
    update(value, visible) {
      const changed = visible !== active || value?.at !== data?.at;
      active = visible;
      if (value) data = value;
      if (!changed) return;
      try { render(); } catch (e) { fail(e); }
    },
    open() { active = true; void refresh(); }
  };
})();
