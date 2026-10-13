const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 4173);
const PUBLIC = path.join(__dirname, 'public');
const MAX_HISTORY = 6000;

const state = {
  events: [],
  assets: new Map(),
  clients: new Set(),
  startedAt: Date.now(),
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function mad(arr, med = median(arr)) {
  if (!arr.length) return 0;
  return median(arr.map(x => Math.abs(x - med))) || 1;
}
function pct(a, b) { return b ? ((a - b) / b) * 100 : 0; }
function assetKey(e) { return `${e.currency || 'GEM'}::${e.kind || 'item'}::${String(e.name || 'Desconhecido').trim()}`; }
function feeRate(kind, currency, price) {
  if (currency === 'COIN') return 0.15;
  if (kind !== 'pokemon') return 0.15;
  if (price <= 500) return 0.13;
  if (price <= 5000) return 0.10;
  return 0.075;
}
function safeMarketUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(String(value));
    const host = u.hostname.toLowerCase();
    if (u.protocol !== 'https:') return null;
    if (host !== 'pokeidle.io' && !host.endsWith('.pokeidle.io')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function ensureAsset(e) {
  const key = assetKey(e);
  if (!state.assets.has(key)) {
    state.assets.set(key, {
      key,
      name: e.name,
      kind: e.kind || 'item',
      currency: e.currency || 'GEM',
      listings: new Map(),
      sold: [],
      priceObs: [],
      timeline: [],
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    });
  }
  return state.assets.get(key);
}

function ingest(raw) {
  const now = Number(raw.ts || Date.now());
  const name = String(raw.name || '').trim();
  if (!name) return null;

  const e = {
    id: String(raw.id || `${now}-${Math.random().toString(36).slice(2, 8)}`),
    type: raw.type || 'listing_created',
    name,
    kind: raw.kind === 'pokemon' ? 'pokemon' : 'item',
    currency: raw.currency === 'COIN' ? 'COIN' : 'GEM',
    price: Math.max(0, Number(raw.price || 0)),
    seller: raw.seller ? String(raw.seller) : null,
    listingId: raw.listingId ? String(raw.listingId) : null,
    marketUrl: safeMarketUrl(raw.marketUrl || raw.url),
    ts: now,
    meta: raw.meta || {},
  };
  if (!e.price && !['listing_cancelled'].includes(e.type)) return null;

  state.events.push(e);
  if (state.events.length > MAX_HISTORY) state.events.splice(0, state.events.length - MAX_HISTORY);
  const a = ensureAsset(e);
  a.lastSeen = now;

  if (e.type === 'listing_created' || e.type === 'listing_updated') {
    const lid = e.listingId || e.id;
    const prev = a.listings.get(lid) || {};
    a.listings.set(lid, {
      id: lid,
      price: e.price,
      ts: now,
      seller: e.seller || prev.seller || null,
      marketUrl: e.marketUrl || prev.marketUrl || null,
    });
    a.priceObs.push({ price: e.price, ts: now, source: 'listing' });
  } else if (e.type === 'listing_sold') {
    const lid = e.listingId || e.id;
    if (e.listingId) a.listings.delete(lid);
    a.sold.push({ price: e.price, ts: now });
    a.priceObs.push({ price: e.price, ts: now, source: 'sale' });
  } else if (e.type === 'listing_cancelled') {
    if (e.listingId) a.listings.delete(e.listingId);
  }

  const cutoff7d = now - 7 * 864e5;
  const cutoff48h = now - 48 * 36e5;
  a.sold = a.sold.filter(x => x.ts >= cutoff7d).slice(-1500);
  a.priceObs = a.priceObs.filter(x => x.ts >= cutoff7d).slice(-2500);
  a.timeline = a.timeline.filter(x => x.ts >= cutoff48h).slice(-800);

  const snap = analyzeAsset(a, now);
  a.timeline.push({ ts: now, floor: snap.floor, fair: snap.fairValue, score: snap.score });
  broadcast({ type: 'update', data: snap });
  return e;
}

function analyzeAsset(a, now = Date.now()) {
  const active = [...a.listings.values()].filter(x => x.ts > now - 72 * 36e5);
  const activePrices = active.map(x => x.price).filter(Boolean);
  const sold7d = a.sold.filter(x => x.ts >= now - 7 * 864e5);
  const sold24h = a.sold.filter(x => x.ts >= now - 864e5);
  const soldPrices = sold7d.map(x => x.price).filter(Boolean);
  const obs = a.priceObs.filter(x => x.ts >= now - 7 * 864e5).map(x => x.price).filter(Boolean);

  const floorListing = active.length ? [...active].sort((x, y) => x.price - y.price || y.ts - x.ts)[0] : null;
  const floor = floorListing ? floorListing.price : (obs.length ? obs[obs.length - 1] : 0);
  const listMedian = median(activePrices);
  const saleMedian = median(soldPrices);
  const historyMedian = median(obs);

  let fairValue = saleMedian || listMedian || historyMedian || floor;
  if (saleMedian && listMedian) fairValue = saleMedian * 0.68 + listMedian * 0.32;

  const dispersionBase = soldPrices.length >= 4 ? soldPrices : (obs.length >= 4 ? obs : activePrices);
  const med = median(dispersionBase);
  const robustMad = mad(dispersionBase, med);
  const robustZ = floor && robustMad ? 0.6745 * (floor - med) / robustMad : 0;
  const discountPct = fairValue ? ((fairValue - floor) / fairValue) * 100 : 0;

  const salesPerDay = sold7d.length / 7;
  const listingCount = active.length;
  const liquidity = clamp(
    (Math.log1p(salesPerDay) / Math.log(11)) * 65 +
    (Math.log1p(listingCount) / Math.log(21)) * 20 +
    (sold24h.length > 0 ? 15 : 0), 0, 100
  );

  const obsRecent = a.priceObs.filter(x => x.ts >= now - 6 * 36e5).map(x => x.price);
  const obsPrev = a.priceObs.filter(x => x.ts < now - 6 * 36e5 && x.ts >= now - 24 * 36e5).map(x => x.price);
  const recentMed = median(obsRecent);
  const prevMed = median(obsPrev);
  const momentumPct = prevMed ? pct(recentMed, prevMed) : 0;

  const soldLastHour = a.sold.filter(x => x.ts >= now - 36e5).length;
  const expectedPerHour = Math.max(0.05, salesPerDay / 24);
  const volumeSpike = soldLastHour / expectedPerHour;

  const isOutlier = robustZ <= -2.6 || discountPct >= 25;
  const floorFalseRisk = activePrices.length >= 3 && floor < median(activePrices) * 0.78;
  const confidence = clamp(
    Math.min(40, sold7d.length * 4) + Math.min(35, obs.length * 1.2) + Math.min(25, active.length * 3),
    0, 100
  );

  const fee = feeRate(a.kind, a.currency, fairValue || floor);
  const netSaleAtFair = fairValue * (1 - fee);
  const netProfit = Math.max(0, netSaleAtFair - floor);
  const netMarginPct = floor ? (netProfit / floor) * 100 : 0;

  const score = confidence < 20 ? 0 : clamp(Math.round(
    clamp(discountPct, 0, 45) * 1.35 +
    liquidity * 0.23 +
    confidence * 0.18 +
    clamp(netMarginPct, 0, 50) * 0.42 +
    clamp(volumeSpike - 1, 0, 4) * 3 +
    (isOutlier ? 9 : 0) +
    (momentumPct > 0 ? clamp(momentumPct, 0, 12) * 0.55 : clamp(momentumPct, -20, 0) * 0.45) -
    (floorFalseRisk && discountPct < 10 ? 10 : 0)
  ), 0, 100);

  const severity = score >= 85 ? 'critical' : score >= 70 ? 'high' : score >= 55 ? 'medium' : 'low';
  const anomalyTypes = [];
  if (confidence >= 20 && isOutlier) anomalyTypes.push('PREÇO FORA DA CURVA');
  if (confidence >= 20 && volumeSpike >= 2.5) anomalyTypes.push('VOLUME DISPAROU');
  if (confidence >= 20 && momentumPct >= 7) anomalyTypes.push('MOMENTUM POSITIVO');
  if (confidence >= 20 && momentumPct <= -7) anomalyTypes.push('QUEDA ACELERADA');
  if (confidence >= 20 && floorFalseRisk) anomalyTypes.push('FLOOR ISOLADO');
  if (confidence >= 20 && discountPct >= 12 && netProfit > 0) anomalyTypes.push('DESCONTO REAL');

  return {
    key: a.key,
    name: a.name,
    kind: a.kind,
    currency: a.currency,
    floor,
    fairValue: Math.round(fairValue),
    discountPct,
    netProfit: Math.round(netProfit),
    netMarginPct,
    feePct: fee * 100,
    liquidity: Math.round(liquidity),
    confidence: Math.round(confidence),
    score,
    severity,
    sales24h: sold24h.length,
    sales7d: sold7d.length,
    activeListings: active.length,
    momentumPct,
    volumeSpike,
    robustZ,
    anomalyTypes,
    updatedAt: a.lastSeen,
    listingId: floorListing ? floorListing.id : null,
    marketUrl: floorListing ? floorListing.marketUrl : null,
    seller: floorListing ? floorListing.seller : null,
    timeline: a.timeline.slice(-80),
  };
}

function dashboard() {
  const now = Date.now();
  const items = [...state.assets.values()].map(a => analyzeAsset(a, now));
  items.sort((a, b) => b.score - a.score || b.discountPct - a.discountPct);
  const anomalous = items.filter(x => x.anomalyTypes.length && x.score >= 40);
  const top = items.filter(x => x.netProfit > 0 && x.confidence >= 25).slice(0, 40);
  const recentEvents = state.events.slice(-100).reverse();
  return {
    generatedAt: now,
    uptimeMs: now - state.startedAt,
    dataMode: state.events.length ? 'REAL_FEED' : 'WAITING_REAL_FEED',
    stats: {
      trackedAssets: items.length,
      events: state.events.length,
      anomalies: anomalous.length,
      strongOpportunities: items.filter(x => x.score >= 70).length,
    },
    opportunities: top,
    anomalies: anomalous.slice(0, 40),
    recentEvents,
  };
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,x-radar-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = rel.replace(/\.\./g, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'not found' });
    const ext = path.extname(file);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

function broadcast(payload) {
  const body = `event: radar\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of state.clients) {
    try { res.write(body); } catch { state.clients.delete(res); }
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  if (u.pathname === '/api/dashboard' && req.method === 'GET') return sendJson(res, 200, dashboard());
  if (u.pathname === '/api/health' && req.method === 'GET') return sendJson(res, 200, { ok:true, now:Date.now(), events:state.events.length, assets:state.assets.size, dataMode:state.events.length?'REAL_FEED':'WAITING_REAL_FEED', marketDeepLink:true });
  if (u.pathname === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive',
      'Access-Control-Allow-Origin':'*'
    });
    res.write(`event: radar\ndata: ${JSON.stringify({type:'hello', data:dashboard().stats})}\n\n`);
    state.clients.add(res);
    req.on('close', () => state.clients.delete(res));
    return;
  }
  if (u.pathname === '/api/market-event' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const list = Array.isArray(body) ? body : [body];
      const accepted = list.map(ingest).filter(Boolean).length;
      return sendJson(res, 200, { ok:true, accepted, stats:dashboard().stats });
    } catch (e) { return sendJson(res, 400, { ok:false, error:'invalid json' }); }
  }
  return serveStatic(req, res, u.pathname);
});

server.listen(PORT, '0.0.0.0', () => console.log(`PokeIdle Radar em http://localhost:${PORT} — aguardando feed real`));
