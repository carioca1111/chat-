export const MARKET_BRIDGE_SOURCE = `(() => {
  try {
    if (window.__gridium2MarketBridgeInstalled === true) return true;
    const Native = window.WebSocket;
    const proto = Native && Native.prototype;
    if (!proto || typeof proto.send !== 'function') return false;
    const nativeSend = proto.send;
    const MACRO_PREFIX = '__gridium_macro__|';

    const isGameSocket = (ws) => {
      try {
        if (!ws || ws.readyState !== 1) return false;
        const url = new URL(String(ws.url || ''));
        return url.protocol === 'wss:' && (url.hostname === 'pokeidle.io' || url.hostname === 'www.pokeidle.io');
      } catch { return false; }
    };

    const norm = (value) => String(value || '')
      .trim().toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
      .replace(/[_-]+/g, ' ').replace(/\\s+/g, ' ');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (fn, timeout = 4500, step = 80) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        try { const value = fn(); if (value) return value; } catch {}
        await sleep(step);
      }
      return null;
    };
    const parseDigits = (value) => {
      const text = String(value || '').replace(/[^0-9]/g, '');
      return text ? Number(text) : 0;
    };
    const parsePrice = (value) => {
      const text = String(value || '').replace(/\\s+/g, ' ');
      const perUnit = text.match(/([0-9][0-9.,]*)\\s*\\/\\s*un\\.?/i);
      if (perUnit) return parseDigits(perUnit[1]);
      return 0;
    };
    const rectArea = (element) => {
      try { const rect = element.getBoundingClientRect(); return Math.max(0, rect.width) * Math.max(0, rect.height); } catch { return Number.MAX_SAFE_INTEGER; }
    };
    const visible = (element) => {
      try {
        if (!(element instanceof Element)) return false;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      } catch { return false; }
    };
    const textCandidates = (root) => Array.from((root || document).querySelectorAll('button,[role="button"],a,[tabindex],div,span,p,h1,h2,h3,h4,label'));
    const leafByExactText = (root, label) => {
      const wanted = norm(label);
      return textCandidates(root)
        .filter((element) => visible(element) && norm(element.textContent) === wanted)
        .sort((a, b) => rectArea(a) - rectArea(b))[0] || null;
    };
    const clickableAncestor = (element, boundary) => {
      let current = element;
      while (current && current !== boundary && current !== document.body) {
        try {
          const style = getComputedStyle(current);
          if (current.matches('button,a,input[type="button"],input[type="submit"],[role="button"]') || typeof current.onclick === 'function' || style.cursor === 'pointer') return current;
        } catch {}
        current = current.parentElement;
      }
      return element;
    };
    const clickExact = (root, label) => {
      const leaf = leafByExactText(root, label);
      if (!leaf) return false;
      const target = clickableAncestor(leaf, root instanceof Element ? root.parentElement : null);
      try { target.click(); return true; } catch { return false; }
    };
    const buttonStartingWith = (root, label) => {
      const wanted = norm(label);
      return textCandidates(root)
        .filter((element) => visible(element) && norm(element.textContent).startsWith(wanted))
        .map((element) => clickableAncestor(element, root instanceof Element ? root.parentElement : null))
        .filter((element, index, rows) => rows.indexOf(element) === index)
        .sort((a, b) => rectArea(a) - rectArea(b))[0] || null;
    };

    const marketRoot = () => {
      const title = leafByExactText(document, 'MARKET');
      if (!title) return null;
      let node = title;
      for (let i = 0; i < 9 && node; i += 1, node = node.parentElement) {
        const text = norm(node.textContent);
        if (text.includes('comprar') && text.includes('vender') && text.includes('pokebolas') && text.includes('pocoes')) return node;
      }
      return null;
    };

    const openMarket = async () => {
      const existing = marketRoot();
      if (existing) return { root: existing, openedByMacro: false };
      if (!clickExact(document, 'Menu')) return { root: null, openedByMacro: false, reason: 'macro-menu-not-found' };
      await sleep(120);
      const marketButton = await waitFor(() => leafByExactText(document, 'Market'), 2200);
      if (!marketButton) return { root: null, openedByMacro: false, reason: 'macro-market-button-not-found' };
      const clickable = clickableAncestor(marketButton, document.body);
      try { clickable.click(); } catch { return { root: null, openedByMacro: false, reason: 'macro-market-button-failed' }; }
      const root = await waitFor(() => marketRoot(), 4500);
      return root ? { root, openedByMacro: true } : { root: null, openedByMacro: false, reason: 'macro-market-open-failed' };
    };

    const closeMarket = (root) => {
      if (!root) return false;
      const buttons = Array.from(root.querySelectorAll('button,[role="button"],a,[tabindex],div'))
        .filter((element) => visible(element))
        .filter((element) => {
          const text = norm(element.textContent);
          const aria = norm(element.getAttribute && (element.getAttribute('aria-label') || element.getAttribute('title')));
          return ['x','×','✕','✖'].includes(text) || aria.includes('fechar') || aria === 'close';
        });
      const rootRect = root.getBoundingClientRect();
      const candidate = buttons.sort((a, b) => {
        const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
        const as = Math.abs(ar.top - rootRect.top) + Math.abs(ar.right - rootRect.right);
        const bs = Math.abs(br.top - rootRect.top) + Math.abs(br.right - rootRect.right);
        return as - bs;
      })[0];
      if (!candidate) return false;
      try { clickableAncestor(candidate, root.parentElement).click(); return true; } catch { return false; }
    };

    const findItemCard = (root, itemName) => {
      const leaf = leafByExactText(root, itemName);
      if (!leaf) return null;
      let node = leaf;
      for (let i = 0; i < 8 && node && node !== root; i += 1, node = node.parentElement) {
        const input = node.querySelector && node.querySelector('input:not([type="checkbox"]):not([type="radio"])');
        const buy = buttonStartingWith(node, 'Comprar');
        if (input && buy) return node;
      }
      return null;
    };

    const currentStockFromCard = (card) => {
      const text = String(card && card.innerText || card && card.textContent || '');
      const match = norm(text).match(/voce tem x\\s*([0-9.]+)/i);
      return match ? parseDigits(match[1]) : null;
    };

    const unitPriceFromCard = (card) => {
      const text = String(card && card.innerText || card && card.textContent || '');
      const direct = parsePrice(text);
      if (direct > 0) return direct;
      const buy = buttonStartingWith(card, 'Comprar');
      if (!buy) return 0;
      const match = String(buy.innerText || buy.textContent || '').match(/([0-9][0-9.,]*)/);
      return match ? parseDigits(match[1]) : 0;
    };

    const setQuantity = (card, quantity) => {
      const input = card.querySelector('input:not([type="checkbox"]):not([type="radio"])');
      if (!input) return false;
      try {
        const proto = Object.getPrototypeOf(input);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
        if (setter) setter.call(input, String(quantity)); else input.value = String(quantity);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return Number(String(input.value).replace(/[^0-9]/g, '')) === quantity;
      } catch { return false; }
    };

    const purchaseToastVisible = (itemName) => {
      const wanted = norm(itemName);
      const rows = Array.from(document.querySelectorAll('[role="alert"],[class*="toast" i],[class*="snack" i],[class*="alert" i],div,span,p'));
      return rows.some((element) => {
        if (!visible(element)) return false;
        const text = norm(element.textContent);
        return text.length <= 220 && text.includes('comprado:') && text.includes(wanted);
      });
    };

    const runMacro = async (config) => {
      if (!config || !config.itemName) return { ok: false, reason: 'macro-config-missing' };
      if (config.currency !== 'coins') return { ok: false, reason: 'macro-currency-unsupported' };
      const opened = await openMarket();
      if (!opened.root) return { ok: false, reason: opened.reason || 'macro-market-open-failed' };
      const root = opened.root;
      const finish = (result) => {
        if (opened.openedByMacro) setTimeout(() => { try { closeMarket(root); } catch {} }, 60);
        return result;
      };

      const categoryLabel = config.category === 'balls' ? 'Pokébolas' : config.category === 'potions' ? 'Poções' : 'Revives';
      if (!clickExact(root, categoryLabel)) return finish({ ok: false, reason: 'macro-category-not-found' });
      await sleep(120);
      const card = await waitFor(() => findItemCard(root, config.itemName), 3000);
      if (!card) return finish({ ok: false, reason: 'macro-item-not-found' });

      const stock = currentStockFromCard(card);
      if (stock === null) return finish({ ok: false, reason: 'macro-stock-not-found' });
      const unitPrice = unitPriceFromCard(card);
      if (!unitPrice) return finish({ ok: false, reason: 'macro-price-not-found' });
      if (stock > Number(config.minStock || 0)) return finish({ ok: false, reason: 'macro-stock-ok:' + stock + ':' + unitPrice });
      if (unitPrice > Number(config.maxUnitPrice || 0)) return finish({ ok: false, reason: 'macro-price-above:' + unitPrice });

      const target = Math.max(Number(config.targetStock || 0), stock);
      const quantity = Math.max(0, Math.min(9999, target - stock));
      if (!quantity) return finish({ ok: false, reason: 'macro-stock-ok:' + stock + ':' + unitPrice });
      if (!setQuantity(card, quantity)) return finish({ ok: false, reason: 'macro-quantity-input-failed' });
      await sleep(80);
      const buy = buttonStartingWith(card, 'Comprar');
      if (!buy) return finish({ ok: false, reason: 'macro-buy-button-not-found' });
      try { buy.click(); } catch { return finish({ ok: false, reason: 'macro-buy-click-failed' }); }

      const confirmed = await waitFor(() => purchaseToastVisible(config.itemName), 4500, 90);
      if (!confirmed) return finish({ ok: false, reason: 'macro-confirmation-timeout' });
      return finish({ ok: true, reason: 'macro-bought:' + quantity + ':' + unitPrice + ':' + stock });
    };

    const parseMacroToken = (token) => {
      const parts = String(token || '').split('|');
      if (parts.length !== 7 || parts[0] !== '__gridium_macro__') return null;
      const category = parts[1];
      if (!['balls','potions','revives'].includes(category)) return null;
      let itemName = '';
      try { itemName = decodeURIComponent(parts[2] || ''); } catch { return null; }
      const minStock = Number(parts[3]), targetStock = Number(parts[4]), maxUnitPrice = Number(parts[5]);
      const currency = parts[6];
      if (!itemName || !Number.isFinite(minStock) || !Number.isFinite(targetStock) || !Number.isFinite(maxUnitPrice)) return null;
      return { category, itemName, minStock, targetStock, maxUnitPrice, currency };
    };

    window.__gridium2FindGameSocket = () => {
      try {
        if (isGameSocket(window.__gridium2GameSocket)) return window.__gridium2GameSocket;
        for (const key of Object.keys(window).slice(0, 2500)) {
          let value;
          try { value = window[key]; } catch { continue; }
          try {
            if (value instanceof Native && isGameSocket(value)) {
              window.__gridium2GameSocket = value;
              return value;
            }
          } catch {}
        }
      } catch {}
      return null;
    };

    if (!nativeSend.__gridium2Wrapped) {
      const wrapped = function(data) {
        try { if (isGameSocket(this)) window.__gridium2GameSocket = this; } catch {}
        return nativeSend.call(this, data);
      };
      try { Object.defineProperty(wrapped, '__gridium2Wrapped', { value: true }); } catch {}
      proto.send = wrapped;
    }

    window.__gridium2MarketSend = async (payload) => {
      try {
        if (payload && typeof payload === 'object' && payload.t === 'market.itens' && String(payload.categoria || '').startsWith(MACRO_PREFIX)) {
          const config = parseMacroToken(payload.categoria);
          if (!config) return { ok: false, reason: 'macro-config-invalid' };
          window.__gridium2MacroConfig = config;
          return { ok: true };
        }

        if (payload && typeof payload === 'object' && payload.t === 'market.comprar' && window.__gridium2MacroConfig) {
          const config = window.__gridium2MacroConfig;
          window.__gridium2MacroConfig = null;
          return await runMacro(config);
        }

        const ws = isGameSocket(window.__gridium2GameSocket) ? window.__gridium2GameSocket : window.__gridium2FindGameSocket();
        if (!ws) return { ok: false, reason: 'socket-unavailable' };
        let outgoing = payload;
        if (payload && typeof payload === 'object' && payload.t === 'market.item') {
          outgoing = { t: 'market.itens', elemento: Number(payload.itemId), categoria: String(payload.categoria || '') };
        }
        const text = typeof outgoing === 'string' ? outgoing : JSON.stringify(outgoing);
        nativeSend.call(ws, text);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: String(error && error.message || error) };
      }
    };

    window.__gridium2MarketBridgeInstalled = true;
    window.__gridium2FindGameSocket();
    return true;
  } catch { return false; }
})()`
