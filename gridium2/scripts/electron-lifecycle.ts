import { app, BrowserWindow, webContents } from 'electron'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AccountRuntime } from '../src/main/account-runtime'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { strict as assert } from 'node:assert'
app.setPath('userData',mkdtempSync(join(tmpdir(),'gridium-electron-')))
app.commandLine.appendSwitch('js-flags','--expose-gc')
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms))
async function run() {
  await app.whenReady()
  const window=new BrowserWindow({show:true,width:1100,height:800,webPreferences:{backgroundThrottling:false}})
  const runtime=new AccountRuntime(window,()=>{})
  const slots=[...(runtime as any).accounts.values()]
  const server=createServer((_q,r)=>r.end('<html><body>Gridium test fixture</body></html>'))
  server.on('upgrade',(req,socket)=>{
    const accept=createHash('sha1').update(String(req.headers['sec-websocket-key'])+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    socket.on('data',()=>socket.end(Buffer.from([0x88,0])))
    socket.on('error',()=>{})
  })
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
  const port=(server.address() as any).port
  for(const slot of slots) await slot.view.webContents.loadURL(`http://127.0.0.1:${port}`)
  await window.loadFile(resolve('out/renderer-smoke/index.html'))
  for(let i=0;i<200;i++){if(await window.webContents.executeJavaScript('Boolean(window.smokeReady)'))break;await pause(100)}
  const baseline={webContents:webContents.getAllWebContents().length,runtime:runtime.diagnostics(),memory:process.memoryUsage(),processes:app.getAppMetrics()}
  for(let i=0;i<500;i++) {
    const slot=slots[i%4]
    await slot.view.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const s=new WebSocket('ws://127.0.0.1:${port}');s.onopen=()=>s.close();s.onclose=()=>resolve(true);s.onerror=()=>reject(new Error('fixture socket failed'))})`)
  }
  await pause(200)
  const renderer=await window.webContents.executeJavaScript('window.runLifecycle()')
  const after={webContents:webContents.getAllWebContents().length,runtime:runtime.diagnostics(),memory:process.memoryUsage(),processes:app.getAppMetrics()}
  assert.equal(after.webContents,5)
  assert.equal(after.webContents,baseline.webContents)
  assert.deepEqual(after.runtime.accounts.map(a=>a.listeners),baseline.runtime.accounts.map(a=>a.listeners))
  assert.ok(after.runtime.accounts.every(a=>a.sockets===0))
  runtime.destroy();await pause(200)
  assert.equal(webContents.getAllWebContents().length,1)
  const report={baseline,after,renderer,reconnects:500,afterDestroyWebContents:webContents.getAllWebContents().length}
  writeFileSync('docs/performance/electron-lifecycle.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
  window.destroy();server.close();app.exit(0)
}
run().catch(error=>{console.error(error);app.exit(1)})
