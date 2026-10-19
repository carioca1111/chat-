export const MARKET_BRIDGE_SOURCE = `(() => {
  try {
    if (window.__gridium2MarketBridgeInstalled === true) return true;
    const Native = window.WebSocket;
    const proto = Native && Native.prototype;
    if (!proto || typeof proto.send !== 'function') return false;
    const nativeSend = proto.send;
    const isGameSocket = (ws) => {
      try {
        if (!ws || ws.readyState !== 1) return false;
        const url = new URL(String(ws.url || ''));
        return url.protocol === 'wss:' && (url.hostname === 'pokeidle.io' || url.hostname === 'www.pokeidle.io');
      } catch { return false; }
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
    window.__gridium2MarketSend = (payload) => {
      try {
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
