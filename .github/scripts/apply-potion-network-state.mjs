import fs from 'node:fs'

function replaceOrThrow(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing anchor: ${label}`)
  return source.replace(from, to)
}

const huntPath = 'gridium2/src/main/hunt-session-runtime.ts'
let hunt = fs.readFileSync(huntPath, 'utf8')
hunt = replaceOrThrow(
  hunt,
  `const CURRENT_POTION_BY_HEAL = new Map<number, string>([\n  [60, 'Small Potion'],\n  [150, 'Great Potion'],\n  [400, 'Ultra Potion'],\n  [1000, 'Hyper Potion'],\n  [3000, 'Ultimate Potion']\n])`,
  `const CURRENT_POTION_BY_HEAL = new Map<number, string>([\n  [20, 'Small Potion'],\n  [40, 'Great Potion'],\n  [80, 'Ultra Potion'],\n  [100, 'Hyper Potion'],\n  [120, 'Ultimate Potion']\n])`,
  'current potion heal map'
)
hunt = replaceOrThrow(
  hunt,
  `    if (compact.includes('3000hp')) return 'Ultimate Potion'\n    if (compact.includes('1000hp')) return 'Hyper Potion'\n    if (compact.includes('400hp')) return 'Ultra Potion'\n    if (compact.includes('150hp')) return 'Great Potion'\n    if (compact.includes('60hp')) return 'Small Potion'\n    if ((compact.includes('50dohp') || compact.includes('50hpmax') || compact.includes('50porcent')) && !compact.includes('revive')) return 'Golden Potion'\n    if ((compact.includes('maxrevive') || compact.includes('revive')) && compact.includes('100')) return 'Max Revive'\n    if ((compact.includes('revive') || compact.includes('reviver')) && compact.includes('10')) return 'Revive'`,
  `    if ((compact.includes('maxrevive') || compact.includes('revive')) && compact.includes('100')) return 'Max Revive'\n    if ((compact.includes('revive') || compact.includes('reviver')) && compact.includes('50')) return 'Revive'\n    if (compact.includes('120hp')) return 'Ultimate Potion'\n    if (compact.includes('100hp')) return 'Hyper Potion'\n    if (compact.includes('80hp')) return 'Ultra Potion'\n    if (compact.includes('40hp')) return 'Great Potion'\n    if (compact.includes('20hp')) return 'Small Potion'`,
  'effect text inference'
)
hunt = replaceOrThrow(
  hunt,
  `    if (effectText.includes('hp') || effectText.includes('vida') || effectText.includes('cura') || effectText.includes('restaura')) {\n      if (exactPrice === 50) return 'Small Potion'\n      if (exactPrice === 150) return 'Great Potion'\n      if (exactPrice === 400) return 'Ultra Potion'\n      if (exactPrice === 800) return 'Hyper Potion'\n      if (exactPrice === 1500) return 'Ultimate Potion'\n      if (exactPrice === 2500) return 'Golden Potion'\n      if (exactPrice === 600) return 'Revive'\n      if (exactPrice === 5000) return 'Max Revive'\n    }`,
  `    const reviveContext = compact.includes('revive') || compact.includes('reviver') || compact.includes('reanima')\n    if (reviveContext) {\n      if (exactPrice === 350) return 'Max Revive'\n      if (exactPrice === 100) return 'Revive'\n    } else if (effectText.includes('hp') || effectText.includes('vida') || effectText.includes('cura') || effectText.includes('restaura')) {\n      if (exactPrice === 20) return 'Small Potion'\n      if (exactPrice === 50) return 'Great Potion'\n      if (exactPrice === 125) return 'Ultra Potion'\n      if (exactPrice === 175) return 'Hyper Potion'\n      if (exactPrice === 240) return 'Ultimate Potion'\n    }`,
  'price inference'
)
hunt = replaceOrThrow(
  hunt,
  `  const aliases: Array<[RegExp, string]> = [\n    [/(?:potion|pocao)(?:1|60)(?:$|[^0-9])/, 'Small Potion'],\n    [/(?:potion|pocao)(?:2|150)(?:$|[^0-9])/, 'Great Potion'],\n    [/(?:potion|pocao)(?:3|400)(?:$|[^0-9])/, 'Ultra Potion'],\n    [/(?:potion|pocao)(?:4|1000)(?:$|[^0-9])/, 'Hyper Potion'],\n    [/(?:potion|pocao)(?:5|3000)(?:$|[^0-9])/, 'Ultimate Potion'],\n    [/(?:potion|pocao)(?:6)(?:$|[^0-9])/, 'Golden Potion'],\n    [/(?:maxrevive|revive2|reviver2)/, 'Max Revive'],\n    [/(?:revive1|reviver1)/, 'Revive']\n  ]`,
  `  const aliases: Array<[RegExp, string]> = [\n    [/(?:smallpotion|potion1|pocao1)(?:$|[^0-9])/, 'Small Potion'],\n    [/(?:greatpotion|potion2|pocao2)(?:$|[^0-9])/, 'Great Potion'],\n    [/(?:ultrapotion|potion3|pocao3)(?:$|[^0-9])/, 'Ultra Potion'],\n    [/(?:hyperpotion|potion4|pocao4)(?:$|[^0-9])/, 'Hyper Potion'],\n    [/(?:ultimatepotion|potion5|pocao5)(?:$|[^0-9])/, 'Ultimate Potion'],\n    [/(?:maxrevive|revive2|reviver2)/, 'Max Revive'],\n    [/(?:revive1|reviver1)/, 'Revive']\n  ]`,
  'compact aliases'
)
hunt = replaceOrThrow(
  hunt,
  `    if (rounded === 10 && (reviveSemantic || price === 600)) return 'Revive'\n    if (rounded === 100 && (reviveSemantic || price === 5000)) return 'Max Revive'\n    if (rounded === 50 && (potionSemantic || itemContext || price === 2500)) return 'Golden Potion'`,
  `    if (rounded === 50 && (reviveSemantic || price === 100)) return 'Revive'\n    if (rounded === 100 && (reviveSemantic || price === 350)) return 'Max Revive'`,
  'percent inference'
)
fs.writeFileSync(huntPath, hunt)

const accountPath = 'gridium2/src/main/account-runtime.ts'
let account = fs.readFileSync(accountPath, 'utf8')
account = replaceOrThrow(
  account,
  `  debuggerDetachHandler: (() => void) | null\n}`,
  `  debuggerDetachHandler: (() => void) | null\n  jsonResponseRequests: Set<string>\n}`,
  'response request set field'
)
account = replaceOrThrow(
  account,
  `      socketUrls: new Map(), debuggerOwned: false, debuggerMessageHandler: null, debuggerDetachHandler: null\n`,
  `      socketUrls: new Map(), debuggerOwned: false, debuggerMessageHandler: null, debuggerDetachHandler: null, jsonResponseRequests: new Set()\n`,
  'response request set init'
)
account = replaceOrThrow(
  account,
  `        account.socketUrls.clear()\n        account.serverState.reset()`,
  `        account.socketUrls.clear()\n        account.jsonResponseRequests.clear()\n        account.serverState.reset()`,
  'detach clear response set'
)
account = replaceOrThrow(
  account,
  `    account.socketUrls.clear()\n    if (account.debuggerOwned && debuggerApi.isAttached()) {`,
  `    account.socketUrls.clear()\n    account.jsonResponseRequests.clear()\n    if (account.debuggerOwned && debuggerApi.isAttached()) {`,
  'monitor detach clear response set'
)
account = replaceOrThrow(
  account,
  `    const payload = params as { requestId?: string; url?: string; response?: { opcode?: number; payloadData?: string } }\n    const requestId = String(payload.requestId || '')\n\n    if (method === 'Network.webSocketCreated') {`,
  `    const payload = params as {\n      requestId?: string\n      url?: string\n      type?: string\n      request?: { url?: string; postData?: string }\n      response?: { opcode?: number; payloadData?: string; url?: string; mimeType?: string }\n    }\n    const requestId = String(payload.requestId || '')\n\n    if (method === 'Network.requestWillBeSent') {\n      const requestUrl = payload.request?.url || ''\n      const postData = payload.request?.postData\n      if (requestUrl && this.isPokeIdleHttpUrl(requestUrl) && typeof postData === 'string' && postData.trim()) {\n        this.ingestNetworkJson(account, postData, Date.now(), 'sent')\n      }\n      return\n    }\n    if (method === 'Network.responseReceived') {\n      const responseUrl = payload.response?.url || ''\n      const mimeType = String(payload.response?.mimeType || '').toLowerCase()\n      const resourceType = String(payload.type || '')\n      if (requestId && responseUrl && this.isPokeIdleHttpUrl(responseUrl) && (resourceType === 'XHR' || resourceType === 'Fetch' || mimeType.includes('json'))) {\n        account.jsonResponseRequests.add(requestId)\n      }\n      return\n    }\n    if (method === 'Network.loadingFinished') {\n      if (requestId && account.jsonResponseRequests.delete(requestId)) void this.readNetworkJsonResponse(account, requestId)\n      return\n    }\n    if (method === 'Network.loadingFailed') {\n      if (requestId) account.jsonResponseRequests.delete(requestId)\n      return\n    }\n\n    if (method === 'Network.webSocketCreated') {`,
  'http network event handling'
)
const helperMethods = `\n  private ingestNetworkJson(account: AccountSlot, raw: string, at: number, transport: 'sent' | 'received'): void {\n    const candidates = [raw.trim()]\n    try {\n      const params = new URLSearchParams(raw)\n      for (const value of params.values()) {\n        const trimmed = value.trim()\n        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) candidates.push(trimmed)\n      }\n    } catch { /* not form encoded */ }\n\n    for (const candidate of candidates) {\n      if (!candidate) continue\n      try {\n        const packet = JSON.parse(candidate) as unknown\n        if (!packet || typeof packet !== 'object') continue\n        account.lastServerAt = Math.max(account.lastServerAt, at)\n        const huntChanged = account.huntSession.ingest(packet, at, transport)\n        const auxiliaryChanged = transport === 'received' ? account.serverState.ingestAuxiliary(packet, at) : false\n        if ((huntChanged || auxiliaryChanged) && !this.disposed) this.onChanged()\n        return\n      } catch { /* try the next candidate */ }\n    }\n  }\n\n  private async readNetworkJsonResponse(account: AccountSlot, requestId: string): Promise<void> {\n    const wc = account.view.webContents\n    if (this.disposed || wc.isDestroyed() || !wc.debugger.isAttached()) return\n    try {\n      const result = await wc.debugger.sendCommand('Network.getResponseBody', { requestId }) as { body?: string; base64Encoded?: boolean }\n      if (typeof result.body !== 'string' || !result.body.trim()) return\n      const raw = result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body\n      this.ingestNetworkJson(account, raw, Date.now(), 'received')\n    } catch {\n      // Some cached/streamed responses no longer expose a body. WebSocket monitoring remains active.\n    }\n  }\n\n  private isPokeIdleHost(hostname: string): boolean {\n    const host = hostname.toLowerCase()\n    return host === 'pokeidle.io' || host.endsWith('.pokeidle.io')\n  }\n\n  private isPokeIdleHttpUrl(url: string): boolean {\n    try {\n      const parsed = new URL(url)\n      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && this.isPokeIdleHost(parsed.hostname)\n    } catch { return false }\n  }\n\n`
account = replaceOrThrow(
  account,
  `  private resetServerState(account: AccountSlot): void {\n`,
  helperMethods + `  private resetServerState(account: AccountSlot): void {\n`,
  'network helper methods'
)
account = replaceOrThrow(
  account,
  `    account.socketUrls.clear()\n    const changed = account.serverState.reset()`,
  `    account.socketUrls.clear()\n    account.jsonResponseRequests.clear()\n    const changed = account.serverState.reset()`,
  'reset response set'
)
account = replaceOrThrow(
  account,
  `      return parsed.protocol === 'wss:' && (parsed.hostname === 'pokeidle.io' || parsed.hostname === 'www.pokeidle.io')`,
  `      return (parsed.protocol === 'wss:' || parsed.protocol === 'ws:') && this.isPokeIdleHost(parsed.hostname)`,
  'socket subdomain support'
)
fs.writeFileSync(accountPath, account)
