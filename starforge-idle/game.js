(() => {
  const SAVE_KEY = 'starforge-alpha-0.1';
  const resources = {
    iron: { name: 'Iron Ore', base: 3, weight: 62 },
    nickel: { name: 'Nickel', base: 7, weight: 23 },
    cobalt: { name: 'Cobalt', base: 13, weight: 10 },
    titanium: { name: 'Titanium', base: 28, weight: 4 },
    crystal: { name: 'Crystal', base: 65, weight: 1 }
  };

  const sectors = [
    { id: 'sol', name: 'Sol Belt', unlock: 0, mult: 1, flavor: 'Órbita segura · minérios básicos' },
    { id: 'red', name: 'Red Veil', unlock: 1400, mult: 1.7, flavor: 'Nebulosa hostil · mais Titanium' },
    { id: 'void', name: 'Void Reach', unlock: 5200, mult: 2.8, flavor: 'Fronteira profunda · Crystal abundante' }
  ];

  const defaultState = () => ({
    credits: 260,
    gems: 35,
    inventory: { iron: 0, nickel: 0, cobalt: 0, titanium: 0, crystal: 0 },
    cargo: 0,
    shipLevel: 1,
    laserLevel: 1,
    cargoLevel: 1,
    efficiencyLevel: 1,
    sector: 'sol',
    mining: false,
    cycleProgress: 0,
    lastSeen: Date.now()
  });

  let state = load();
  let lastTick = performance.now();
  let toastTimer;

  const el = id => document.getElementById(id);
  const creditsEl = el('credits');
  const gemsEl = el('gems');
  const scene = el('spaceScene');
  const progressFill = el('progressFill');
  const mineButton = el('mineButton');

  const cargoCapacity = () => 100 + (state.cargoLevel - 1) * 40;
  const miningRate = () => 1 + (state.laserLevel - 1) * 0.35;
  const efficiency = () => 1 + (state.efficiencyLevel - 1) * 0.05;
  const sector = () => sectors.find(s => s.id === state.sector) || sectors[0];
  const upgradeCost = (type) => {
    const level = type === 'laser' ? state.laserLevel : type === 'cargo' ? state.cargoLevel : state.efficiencyLevel;
    const base = type === 'laser' ? 150 : type === 'cargo' ? 200 : 300;
    return Math.round(base * Math.pow(1.62, level - 1));
  };

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
    } catch {
      return defaultState();
    }
  }

  function save() {
    state.lastSeen = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  }

  function weightedResource() {
    const s = sector();
    const weights = { iron: 62, nickel: 23, cobalt: 10, titanium: 4, crystal: 1 };
    if (s.id === 'red') Object.assign(weights, { iron: 43, nickel: 25, cobalt: 15, titanium: 14, crystal: 3 });
    if (s.id === 'void') Object.assign(weights, { iron: 24, nickel: 22, cobalt: 20, titanium: 24, crystal: 10 });
    const roll = Math.random() * 100;
    let running = 0;
    for (const [key, value] of Object.entries(weights)) {
      running += value;
      if (roll <= running) return key;
    }
    return 'iron';
  }

  function addOre(amount) {
    const available = cargoCapacity() - state.cargo;
    const units = Math.min(available, Math.max(0, amount));
    if (units <= 0) return;
    let remaining = units;
    while (remaining >= 1) {
      const key = weightedResource();
      state.inventory[key] += 1;
      state.cargo += 1;
      remaining -= 1;
    }
    state.cycleProgress = remaining;
    if (state.cargo >= cargoCapacity()) {
      state.mining = false;
      showToast('Carga cheia. Venda ou aumente a capacidade.');
    }
  }

  function calculateOffline() {
    const elapsed = Math.max(0, Date.now() - (state.lastSeen || Date.now())) / 1000;
    if (!state.mining || elapsed < 5) return;
    const capped = Math.min(elapsed, 60 * 60 * 4);
    const mined = capped * miningRate() * sector().mult * 0.35;
    const before = state.cargo;
    addOre(mined);
    const gained = Math.max(0, Math.floor(state.cargo - before));
    if (gained > 0) setTimeout(() => showToast(`Mineração offline: +${gained} unidades`), 350);
  }

  function tick(now) {
    const dt = Math.min(0.25, (now - lastTick) / 1000);
    lastTick = now;
    if (state.mining && state.cargo < cargoCapacity()) {
      const gain = miningRate() * sector().mult * dt;
      state.cycleProgress += gain;
      while (state.cycleProgress >= 1 && state.cargo < cargoCapacity()) {
        addOre(1);
        state.cycleProgress -= 1;
      }
    }
    render();
    requestAnimationFrame(tick);
  }

  function sellCargo() {
    if (state.cargo <= 0) return showToast('Sua carga está vazia.');
    let total = 0;
    for (const [key, amount] of Object.entries(state.inventory)) total += resources[key].base * amount;
    total = Math.round(total * efficiency() * sector().mult);
    state.credits += total;
    Object.keys(state.inventory).forEach(k => state.inventory[k] = 0);
    state.cargo = 0;
    showToast(`Carga vendida por ${fmt(total)} Credits.`);
    save();
    render();
  }

  function buyUpgrade(type) {
    const cost = upgradeCost(type);
    if (state.credits < cost) return showToast('Credits insuficientes.');
    state.credits -= cost;
    if (type === 'laser') state.laserLevel += 1;
    if (type === 'cargo') state.cargoLevel += 1;
    if (type === 'efficiency') state.efficiencyLevel += 1;
    state.shipLevel = Math.floor((state.laserLevel + state.cargoLevel + state.efficiencyLevel) / 3);
    showToast('Upgrade instalado.');
    save();
    render();
  }

  function marketSell() {
    if (state.inventory.titanium < 50) return showToast('Você precisa de 50 Titanium.');
    state.inventory.titanium -= 50;
    state.cargo -= 50;
    const gross = 120;
    const net = Math.floor(gross * 0.9);
    state.gems += net;
    showToast(`Ordem concluída: +${net} Gems após 10% de taxa.`);
    save();
    render();
  }

  function marketBuy() {
    if (state.gems < 85) return showToast('Gems insuficientes. Este saldo é apenas simulado.');
    state.gems -= 85;
    state.laserLevel += 2;
    showToast('Mining Core Mk-I instalado: Laser +2 níveis.');
    save();
    render();
  }

  function renderResources() {
    el('resourceList').innerHTML = Object.entries(resources).map(([key, r]) => `
      <div class="resource-row"><span>${r.name}</span><strong>${Math.floor(state.inventory[key] || 0)}</strong><em>${r.base} C</em></div>
    `).join('');
  }

  function renderSectors() {
    el('sectorList').innerHTML = sectors.map(s => {
      const unlocked = state.credits >= s.unlock || s.id === 'sol' || state.sector === s.id;
      return `<button class="sector-option" data-sector="${s.id}" ${unlocked ? '' : 'disabled'}>
        <span><strong>${s.name}</strong><small>${s.flavor}</small></span>
        <b>${unlocked ? `x${s.mult.toFixed(1)}` : `${fmt(s.unlock)} C`}</b>
      </button>`;
    }).join('');
    document.querySelectorAll('[data-sector]').forEach(btn => btn.addEventListener('click', () => {
      state.sector = btn.dataset.sector;
      el('sectorModal').hidden = true;
      save();
      render();
      showToast(`Rota definida: ${sector().name}.`);
    }));
  }

  function render() {
    const cap = cargoCapacity();
    const pct = Math.min(100, (state.cargo / cap) * 100);
    creditsEl.textContent = fmt(state.credits);
    gemsEl.textContent = fmt(state.gems);
    el('sectorName').textContent = sector().name;
    el('operationText').textContent = state.mining ? `Minerando em ${sector().name}` : 'Aguardando ordem';
    el('rateValue').textContent = (miningRate() * sector().mult).toFixed(2);
    el('progressText').textContent = `${pct.toFixed(0)}%`;
    el('cargoText').textContent = `Carga ${Math.floor(state.cargo)} / ${cap}`;
    el('cargoBadge').textContent = `${pct.toFixed(0)}%`;
    progressFill.style.width = `${pct}%`;
    mineButton.textContent = state.mining ? 'PAUSAR MINERAÇÃO' : 'INICIAR MINERAÇÃO';
    scene.classList.toggle('mining', state.mining);
    el('shipLevel').textContent = state.shipLevel;
    el('laserStat').textContent = `${miningRate().toFixed(2)}/s`;
    el('cargoStat').textContent = cap;
    el('efficiencyStat').textContent = `${Math.round(efficiency() * 100)}%`;
    el('laserCost').textContent = `${fmt(upgradeCost('laser'))} C`;
    el('cargoCost').textContent = `${fmt(upgradeCost('cargo'))} C`;
    el('efficiencyCost').textContent = `${fmt(upgradeCost('efficiency'))} C`;
    renderResources();
  }

  function fmt(n) { return Math.floor(n).toLocaleString('pt-BR'); }
  function showToast(message) {
    const t = el('toast');
    t.textContent = message;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  mineButton.addEventListener('click', () => {
    if (!state.mining && state.cargo >= cargoCapacity()) return showToast('Carga cheia.');
    state.mining = !state.mining;
    save();
    render();
  });
  el('sellButton').addEventListener('click', sellCargo);
  document.querySelectorAll('[data-upgrade]').forEach(b => b.addEventListener('click', () => buyUpgrade(b.dataset.upgrade)));
  el('marketSell').addEventListener('click', marketSell);
  el('marketBuy').addEventListener('click', marketBuy);
  el('sectorButton').addEventListener('click', () => { renderSectors(); el('sectorModal').hidden = false; });
  el('closeSector').addEventListener('click', () => el('sectorModal').hidden = true);
  el('sectorModal').addEventListener('click', e => { if (e.target === el('sectorModal')) el('sectorModal').hidden = true; });
  window.addEventListener('beforeunload', save);
  setInterval(save, 5000);

  calculateOffline();
  render();
  requestAnimationFrame(tick);
})();
