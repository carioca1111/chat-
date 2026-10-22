import { app } from 'electron'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import { Transform, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateSnapshot } from '../shared/contracts'

const RELEASES_API = 'https://api.github.com/repos/carioca1111/chat-/releases?per_page=20'
const RELEASE_TAG_PREFIX = 'gridium2-v'
const MANIFEST_ASSET = 'gridium2-update.json'

interface GitHubAsset {
  name: string
  browser_download_url: string
  size?: number
}

interface GitHubRelease {
  draft: boolean
  tag_name: string
  html_url?: string
  assets: GitHubAsset[]
}

interface UpdateManifest {
  version: string
  installer: string
  sha256: string
}

interface ResolvedUpdate {
  version: string
  installer: GitHubAsset
  sha256: string
  releaseUrl?: string
}

export class GridiumAppUpdater {
  private snapshotState: UpdateSnapshot
  private resolved: ResolvedUpdate | null = null
  private downloadedPath: string | null = null

  constructor(private readonly publish: () => void) {
    this.snapshotState = {
      currentVersion: app.getVersion(),
      status: 'idle',
      progress: 0,
      message: 'Pronto para verificar atualizações.'
    }
  }

  snapshot(): UpdateSnapshot {
    return { ...this.snapshotState }
  }

  async check(silent = false): Promise<UpdateSnapshot> {
    if (this.snapshotState.status === 'downloading') return this.snapshot()
    this.setState({ status: 'checking', progress: 0, message: 'Verificando nova versão…' })
    try {
      const releases = await fetchJson<GitHubRelease[]>(RELEASES_API)
      const candidates = releases
        .filter((release) => !release.draft && release.tag_name.startsWith(RELEASE_TAG_PREFIX))
        .sort((a, b) => compareVersions(tagVersion(b.tag_name), tagVersion(a.tag_name)))

      for (const release of candidates) {
        const version = tagVersion(release.tag_name)
        if (compareVersions(version, app.getVersion()) <= 0) continue
        const manifestAsset = release.assets.find((asset) => asset.name === MANIFEST_ASSET)
        if (!manifestAsset) continue
        const manifest = await fetchJson<UpdateManifest>(manifestAsset.browser_download_url)
        if (manifest.version !== version || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) continue
        const installer = release.assets.find((asset) => asset.name === manifest.installer)
        if (!installer || !installer.name.toLowerCase().endsWith('.exe')) continue
        this.resolved = { version, installer, sha256: manifest.sha256.toLowerCase(), releaseUrl: release.html_url }
        this.downloadedPath = null
        this.setState({
          status: 'available',
          availableVersion: version,
          progress: 0,
          message: `Gridium ${version} disponível.`
        })
        return this.snapshot()
      }

      this.resolved = null
      this.downloadedPath = null
      this.setState({
        status: 'up-to-date',
        availableVersion: undefined,
        progress: 0,
        message: silent ? 'Atualizado.' : 'Você já está na versão mais recente.'
      })
    } catch (error) {
      this.setState({
        status: 'error',
        progress: 0,
        message: `Não foi possível verificar atualizações: ${errorMessage(error)}`
      })
    }
    return this.snapshot()
  }

  async download(): Promise<UpdateSnapshot> {
    if (!this.resolved) {
      await this.check()
      if (!this.resolved) return this.snapshot()
    }
    if (this.snapshotState.status === 'downloading') return this.snapshot()

    const update = this.resolved
    const dir = join(app.getPath('userData'), 'updates')
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, safeFileName(update.installer.name))
    await rm(filePath, { force: true }).catch(() => undefined)
    this.setState({ status: 'downloading', progress: 0, message: `Baixando Gridium ${update.version}…` })

    try {
      const response = await fetch(update.installer.browser_download_url, {
        headers: { 'User-Agent': `Gridium-2/${app.getVersion()}` },
        redirect: 'follow'
      })
      if (!response.ok || !response.body) throw new Error(`download HTTP ${response.status}`)
      const total = Number(response.headers.get('content-length') || update.installer.size || 0)
      let received = 0
      const meter = new Transform({
        transform: (chunk, _encoding, callback) => {
          received += chunk.length
          const progress = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0
          if (progress !== this.snapshotState.progress) this.setState({ progress, message: `Baixando… ${progress}%` })
          callback(null, chunk)
        }
      })
      await pipeline(Readable.fromWeb(response.body as never), meter, createWriteStream(filePath))
      const actual = await sha256File(filePath)
      if (actual !== update.sha256) {
        await rm(filePath, { force: true }).catch(() => undefined)
        throw new Error('SHA-256 do instalador não confere')
      }
      this.downloadedPath = filePath
      this.setState({ status: 'ready', progress: 100, message: `Gridium ${update.version} pronto para instalar.` })
    } catch (error) {
      this.downloadedPath = null
      this.setState({ status: 'error', progress: 0, message: `Falha no download: ${errorMessage(error)}` })
    }
    return this.snapshot()
  }

  async installAndRestart(): Promise<boolean> {
    if (!this.downloadedPath || this.snapshotState.status !== 'ready') return false
    if (process.platform !== 'win32') return false
    const installer = this.downloadedPath
    const executable = process.execPath
    const pid = process.pid
    const ps = [
      `$p=${pid}`,
      `while(Get-Process -Id $p -ErrorAction SilentlyContinue){Start-Sleep -Milliseconds 250}`,
      `Start-Process -FilePath '${psEscape(installer)}' -ArgumentList '/S' -Wait`,
      `Start-Process -FilePath '${psEscape(executable)}'`
    ].join(';')
    const child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', ps], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
    app.quit()
    return true
  }

  private setState(patch: Partial<UpdateSnapshot>): void {
    this.snapshotState = { ...this.snapshotState, ...patch, currentVersion: app.getVersion() }
    this.publish()
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `Gridium-2/${app.getVersion()}`
    },
    redirect: 'follow'
  })
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
  return await response.json() as T
}

function tagVersion(tag: string): string {
  return tag.startsWith(RELEASE_TAG_PREFIX) ? tag.slice(RELEASE_TAG_PREFIX.length) : tag
}

export function compareVersions(a: string, b: string): number {
  const left = (a.match(/\d+/g) ?? []).map(Number)
  const right = (b.match(/\d+/g) ?? []).map(Number)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function safeFileName(value: string): string {
  return basename(value).replace(/[^a-zA-Z0-9._-]/g, '_')
}

function psEscape(value: string): string {
  return value.replace(/'/g, "''")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
