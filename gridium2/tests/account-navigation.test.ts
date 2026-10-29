import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class Contents extends EventEmitter {
    debugger = Object.assign(new EventEmitter(), {
      isAttached: () => true, sendCommand: vi.fn(async () => ({}))
    })
    navigationHistory = { canGoBack: () => false, canGoForward: () => false }
    setZoomFactor = vi.fn()
    setWindowOpenHandler = vi.fn()
    isDestroyed = () => false
    getURL = () => 'https://pokeidle.io/app'
    close = vi.fn()
    reload = vi.fn()
  }
  return {
    app: { getPath: () => '/nonexistent-gridium-test-directory' },
    session: { fromPartition: (partition: string) => ({ partition }) },
    WebContentsView: class {
      webContents = new Contents()
      setBackgroundColor() {}
    },
    BrowserWindow: class {}
  }
})
import { AccountRuntime } from '../src/main/account-runtime'
const runtimes: AccountRuntime[] = []
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.destroy() })
function setup() {
  const runtime = new AccountRuntime({} as any, () => {})
  runtimes.push(runtime)
  const slots = [...(runtime as any).accounts.values()]
  function frame(slot: any, requestId: string) {
    slot.view.webContents.debugger.emit('message', {}, 'Network.webSocketFrameReceived', {
      requestId, response: { opcode: 1, payloadData: JSON.stringify({ t: 'estado', estado: { nivel: 42 } }) }
    })
  }
  for (const slot of slots) {
    slot.view.webContents.debugger.emit('message', {}, 'Network.webSocketCreated', {
      requestId: 'socket', url: 'wss://pokeidle.io/ws'
    })
    frame(slot, 'socket')
  }
  return { runtime, slots, frame }
}
describe('account monitoring during navigation', () => {
  it('continues consuming an existing socket after secondary loads in accounts 2–4', () => {
    const { runtime, slots, frame } = setup()
    for (const slot of slots.slice(1)) {
      slot.view.webContents.emit('did-start-navigation', {}, 'https://example.test/embed', false, false)
      slot.view.webContents.emit('did-start-loading')
      frame(slot, 'socket')
    }
    expect(runtime.snapshots().map(a => a.huntProtocolStatus)).toEqual(['live', 'live', 'live', 'live'])
    for (const slot of slots) expect(slot.view.webContents.reload).not.toHaveBeenCalled()
  })
  it('preserves same-document navigation but clears a replaced main document only for its account', () => {
    const { runtime, slots, frame } = setup()
    const wc = slots[1].view.webContents
    wc.emit('did-start-navigation', {}, 'https://pokeidle.io/app#community', true, true)
    wc.emit('did-start-loading')
    expect(runtime.snapshots()[1].huntProtocolStatus).toBe('live')
    wc.emit('did-start-navigation', {}, 'https://pokeidle.io/app', false, true)
    expect(runtime.snapshots().map(a => a.huntProtocolStatus)).toEqual(['live', 'waiting', 'live', 'live'])
    frame(slots[1], 'socket')
    expect(runtime.snapshots()[1].huntProtocolStatus).toBe('waiting')
    wc.debugger.emit('message', {}, 'Network.webSocketCreated', { requestId: 'new', url: 'wss://pokeidle.io/ws' })
    frame(slots[1], 'new')
    expect(runtime.snapshots()[1].huntProtocolStatus).toBe('live')
  })
})
