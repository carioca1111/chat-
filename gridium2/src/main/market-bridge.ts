import { MARKET_BRIDGE_SOURCE as BASE_MARKET_BRIDGE_SOURCE } from './market-bridge-base'

const CATEGORY_HOTFIX_SOURCE = `(() => {
  try {
    if (window.__gridium2MacroCategoryHotfixInstalled === true) return true;
    const originalSend = window.__gridium2MarketSend;
    if (typeof originalSend !== 'function') return false;
    const MACRO_PREFIX = '__gridium_macro__|';

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
    const visible = (element) => {
      try {
        if (!(element instanceof Element)) return false;
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) === 0) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      } catch { return false; }
    };
    const rectArea = (element) => {
      try { const rect = element.getBoundingClientRect(); return Math.max(0, rect.width) * Math.max(0, rect.height); }
      catch { return Number.MAX_SAFE_INTEGER; }
    };
    const candidates = (root) => Array.from((root || document).querySelectorAll('button,[role="button"],a,[tabindex],div,span,p,h1,h2,h3,h4,label'));
    const exactLeaf = (root, label) => {
      const wanted = norm(label);
      return candidates(root)
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
      const leaf = exactLeaf(root, label);
      if (!leaf) return false;
      try { clickableAncestor(leaf, root instanceof Element ? root.parentElement : document.body).click(); return true; }
      catch { return false; }
    };
    const buttonStartingWith = (root, label) => {
      const wanted = norm(label);
      return candidates(root)
        .filter((element) => {
          if (!visible(element)) return false;
          const text = norm(element.textContent);
          return text === wanted || text.startsWith(wanted + ' ');
        })
        .map((element) => clickableAncestor(element, root instanceof Element ? root.parentElement : document.body))
        .filter((element, index, rows) => rows.indexOf(element) === index && visible(element))
        .sort((a, b) => rectArea(a) - rectArea(b))[0] || null;
    };
    const parseDigits = (value) => {
      const text = String(value || '').replace(/[^0-9]/g, '');
      return text ? Number(text) : 0;
    };
    const parsePrice = (value) => {
      const text = String(value || '').replace(/\\s+/g, ' ');
      const perUnit = text.match(/([0-9][0-9.,]*)\\s*\\/\\s*un\\.?/i);
      return perUnit ? parseDigits(perUnit[1]) : 0;
    };

    const marketRoot = () => {
      const title = exactLeaf(document, 'MARKET');
      if (!title) return null;
      let node = title;
      for (let i = 0; i < 10 && node; i += 1, node = node.parentElement) {
        const text = norm(node.textContent);
        if (text.includes('comprar') && text.includes('vender') && text.includes('pokebolas') && text.includes('pocoes') && text.includes('revives')) return node;
      }
      return null;
    };

    const openMarket = async () => {
      const existing = marketRoot();
      if (existing) return { root: existing, openedByMacro: false };
      if (!clickExact(document, 'Menu')) return { root: null, openedByMacro: false, reason: 'macro-menu-not-found' };
      const marketButton = await waitFor(() => exactLeaf(document, 'Market') || buttonStartingWith(document, 'Market'), 2500);
      if (!marketButton) return { root: null, openedByMacro: false, reason: 'macro-market-button-not-found' };
      try { clickableAncestor(marketButton, document.body).click(); }
      catch { return { root: null, openedByMacro: false, reason: 'macro-market-button-failed' }; }
      const root = await waitFor(() => marketRoot(), 5000);
      return root ? { root, openedByMacro: true } : { root: null, openedByMacro: false, reason: 'macro-market-open-failed' };
    };

    const closeMarket = (root) => {
      const liveRoot = marketRoot() || root;
      if (!liveRoot) return false;
      const rootRect = liveRoot.getBoundingClientRect();
      const rows = Array.from(liveRoot.querySelectorAll('button,[role="button"],a,[tabindex],div'))
        .filter((element) => visible(element))
        .filter((element) => {
          const text = norm(element.textContent);
          const aria = norm(element.getAttribute && (element.getAttribute('aria-label') || element.getAttribute('title')));
          return ['x','×','✕','✖'].includes(text) || aria.includes('fechar') || aria === 'close';
        })
        .sort((a, b) => {
          const ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
          return (Math.abs(ar.top - rootRect.top) + Math.abs(ar.right - rootRect.right)) - (Math.abs(br.top - rootRect.top) + Math.abs(br.right - rootRect.right));
        });
      if (!rows[0]) return false;
      try { clickableAncestor(rows[0], liveRoot.parentElement).click(); return true; } catch { return false; }
    };

    const findItemCard = (root, itemName) => {
      const liveRoot = marketRoot() || root;
      const leaf = exactLeaf(liveRoot, itemName);
      if (!leaf) return null;
      let node = leaf;
      for (let i = 0; i < 9 && node && node !== liveRoot; i += 1, node = node.parentElement) {
        const input = node.querySelector && node.querySelector('input:not([type="checkbox"]):not([type="radio"])');
        const buy = buttonStartingWith(node, 'Comprar');
        if (input && buy) return node;
      }
      return null;
    };

    const currentStockFromCard = (card) => {
      const text = String(card && (card.innerText || card.textContent) || '');
      const match = norm(text).match(/voce tem x\\s*([0-9.]+)/i);
      return match ? parseDigits(match[1]) : null;
    };
    const unitPriceFromCard = (card) => {
      const text = String(card && (card.innerText || card.textContent) || '');
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
        input.focus();
        const proto = Object.getPrototypeOf(input);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
        if (descriptor && descriptor.set) descriptor.set.call(input, String(quantity)); else input.value = String(quantity);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return Number(String(input.value).replace(/[^0-9]/g, '')) === quantity;
      } catch { return false; }
    };
    const purchaseToastVisible = (itemName) => {
      const wanted = norm(itemName);
      return Array.from(document.querySelectorAll('[role="alert"],[class*="toast" i],[class*="snack" i],[class*="alert" i],div,span,p')).some((element) => {
        if (!visible(element)) return false;
        const text = norm(element.textContent);
        return text.length <= 240 && text.includes('comprado:') && text.includes(wanted);
      });
    };

    const runMacro = async (config) => {
      if (!config || !config.itemName) return { ok: false, reason: 'macro-config-missing' };
      if (config.currency !== 'coins') return { ok: false, reason: 'macro-currency-unsupported' };
      const opened = await openMarket();
      if (!opened.root) return { ok: false, reason: opened.reason || 'macro-market-open-failed' };
      const root = opened.root;
      const finish = (result) => {
        if (opened.openedByMacro) setTimeout(() => { try { closeMarket(root); } catch {} }, 100);
        return result;
      };

      let card = findItemCard(root, config.itemName);
      if (!card) {
        const categoryLabel = config.category === 'balls' ? 'Pokébolas' : config.category === 'potions' ? 'Poções' : 'Revives';
        const categoryButton = await waitFor(() => buttonStartingWith(root, categoryLabel), 3000);
        if (!categoryButton) return finish({ ok: false, reason: 'macro-category-not-found:' + categoryLabel });
        try { categoryButton.click(); }
        catch { return finish({ ok: false, reason: 'macro-category-click-failed:' + categoryLabel }); }
        card = await waitFor(() => findItemCard(root, config.itemName), 4500);
      }
      if (!card) return finish({ ok: false, reason: 'macro-item-not-found:' + config.itemName });

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
      await sleep(120);
      const buy = buttonStartingWith(card, 'Comprar');
      if (!buy) return finish({ ok: false, reason: 'macro-buy-button-not-found' });
      try { buy.click(); } catch { return finish({ ok: false, reason: 'macro-buy-click-failed' }); }

      const confirmed = await waitFor(() => purchaseToastVisible(config.itemName), 5500, 90);
      if (!confirmed) return finish({ ok: false, reason: 'macro-confirmation-timeout' });
      return finish({ ok: true, reason: 'macro-bought:' + quantity + ':' + unitPrice + ':' + stock });
    };

    const parseMacroToken = (token) => {
      const parts = String(token || '').split('|');
      if (parts.length !== 7 || parts[0] !== '__gridium_macro__') return null;
      if (!['balls','potions','revives'].includes(parts[1])) return null;
      let itemName = '';
      try { itemName = decodeURIComponent(parts[2] || ''); } catch { return null; }
      const minStock = Number(parts[3]), targetStock = Number(parts[4]), maxUnitPrice = Number(parts[5]);
      if (!itemName || !Number.isFinite(minStock) || !Number.isFinite(targetStock) || !Number.isFinite(maxUnitPrice)) return null;
      return { category: parts[1], itemName, minStock, targetStock, maxUnitPrice, currency: parts[6] };
    };

    window.__gridium2MarketSend = async (payload) => {
      try {
        if (payload && typeof payload === 'object' && payload.t === 'market.itens' && String(payload.categoria || '').startsWith(MACRO_PREFIX)) {
          const config = parseMacroToken(payload.categoria);
          if (!config) return { ok: false, reason: 'macro-config-invalid' };
          window.__gridium2MacroConfigV2 = config;
          return { ok: true };
        }
        if (payload && typeof payload === 'object' && payload.t === 'market.comprar' && window.__gridium2MacroConfigV2) {
          const config = window.__gridium2MacroConfigV2;
          window.__gridium2MacroConfigV2 = null;
          return await runMacro(config);
        }
        return await originalSend(payload);
      } catch (error) {
        return { ok: false, reason: String(error && error.message || error) };
      }
    };

    window.__gridium2MacroCategoryHotfixInstalled = true;
    return true;
  } catch { return false; }
})()`

export const MARKET_BRIDGE_SOURCE = `${BASE_MARKET_BRIDGE_SOURCE};\n${CATEGORY_HOTFIX_SOURCE}`
