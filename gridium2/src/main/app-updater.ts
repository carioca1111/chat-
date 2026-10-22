import { app } from 'electron'
import { createHash } from 'node:crypto'
import { appendFileSync, createReadStream, createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { Transform, Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateSnapshot } from '../shared/contracts'
import { buildInstallerBatch, launchInstallerBatch } from './update-installer-helper'

const RELEASES_API = 'https://api.github.com/repos/carioca1111/chat-/releases?per_page=20'
const RELEASE_TAG_PREFIX = 'gridium2-v'
const MANIFEST_ASSET = 'gridium2-update.json'
const FETCH_TIMEOUT_MS = 20_000
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000

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

interface PendingUpdateAttempt {
  expectedVersion: string
  executable: string
  installDir: string
  startedAt: number
}

export class GridiumAppUpdater {
  private snapshotState: UpdateSnapshot
  private resolved: ResolvedUpdate | null = null
  private downloadedPath: string | null = null
  private readonly updatesDir = join(app.getPath('userData'), 'updates')
  private readonly pendingPath = join(this.updatesDir, 'pending-update.json')
  private readonly logPath = join(this.updatesDir, 'updater.log')

  constructor(private readonly publish: () => void) {
    this.snapshotState = {
      currentVersion: app.getVersion(),
      status: 'idle',
      progress: 0,
      message: 'Pronto para verificar atualizações.'
    }
    this.reconcilePreviousAttempt()
  }

  snapshot(): UpdateSnapshot {
    return { ...this.snapshotState }
  }

  async check(silent = false): Promise<UpdateSnapshot> {
    if (this.snapshotState.status === 'downloading') return this.snapshot()
    this.setState({ status: 'checking', progress: 0, message: 'Verificando nova versão no canal oficial…' })
    this.log(`check:start current=${app.getVersion()}`)
    try {
      const releases = await fetchJson<GitHubRelease[]>(RELEASES_API)
      const candidates = releases
        .filter((release) => !release.draft && release.tag_name.startsWith(RELEASE_TAG_PREFIX))
        .sort((a, b) => compareVersions(tagVersion(b.tag_name), tagVersion(a.tag_name)))

      for (const release of candidates) {
        const version = tagVersion(release.tag_name)
        if (compareVersions(version, app.getVersion()) <= 0) continue
        const manifestAsset = release.assets.find((asset) => asset.name === MANIFEST_ASSET)
        if (!manifestAsset) {
          this.log(`check:skip ${version} manifest-missing`)
          continue
        }
        const manifest = await fetchJson<UpdateManifest>(manifestAsset.browser_download_url)
        if (manifest.version !== version || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) {
          this.log(`check:skip ${version} manifest-invalid`)
          continue
        }
        const installer = release.assets.find((asset) => asset.name === manifest.installer)
        if (!installer || !installer.name.toLowerCase().endsWith('.exe')) {
          this.log(`check:skip ${version} installer-missing`)
          continue
        }
        this.resolved = { version, installer, sha256: manifest.sha256.toLowerCase(), releaseUrl: release.html_url }
        this.downloadedPath = null
        this.log(`check:available ${version} installer=${installer.name}`)
        this.setState({
          status: 'available',
          availableVersion: version,
          progress: 0,
          message: `Gridium ${version} disponível. Canal verificado.`
        })
        return this.snapshot()
      }

      this.resolved = null
      this.downloadedPath = null
      this.log('check:up-to-date')
      this.setState({
        status: 'up-to-date',
        availableVersion: undefined,
        progress: 0,
        message: silent ? 'Atualizado.' : `Você já está na versão mais recente (${app.getVersion()}).`
      })
    } catch (error) {
      const detail = errorMessage(error)
      this.log(`check:error ${detail}`)
      this.setState({
        status: 'error',
        progress: 0,
        message: `Falha ao verificar atualizações: ${detail}`
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
    await mkdir(this.updatesDir, { recursive: true })
    const filePath = join(this.updatesDir, safeFileName(update.installer.name))
    await rm(filePath, { force: true }).catch(() => undefined)
    this.setState({ status: 'downloading', progress: 0, message: `Baixando Gridium ${update.version}…` })
    this.log(`download:start ${update.version} -> ${filePath}`)

    try {
      const response = await fetch(update.installer.browser_download_url, {
        headers: {
          Accept: 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'User-Agent': `Gridium-2/${app.getVersion()}`
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
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
      this.log(`download:verified ${update.version} sha256=${actual}`)
      this.setState({ status: 'ready', progress: 100, message: `Gridium ${update.version} validado e pronto para instalar.` })
    } catch (error) {
      const detail = errorMessage(error)
      this.downloadedPath = null
      this.log(`download:error ${detail}`)
      this.setState({ status: 'error', progress: 0, message: `Falha no download/validação: ${detail}` })
    }
    return this.snapshot()
  }

  async installAndRestart(): Promise<boolean> {
    if (!this.downloadedPath || this.snapshotState.status !== 'ready' || !this.resolved) return false
    if (process.platform !== 'win32') return false

    await mkdir(this.updatesDir, { recursive: true })
    const installer = this.downloadedPath
    const executable = process.execPath
    const installDir = dirname(executable)
    const helperPath = join(this.updatesDir, 'apply-update.cmd')
    const expectedVersion = this.resolved.version
    const attempt: PendingUpdateAttempt = { expectedVersion, executable, installDir, startedAt: Date.now() }
    writeFileSync(this.pendingPath, JSON.stringify(attempt, null, 2), 'utf8')
    writeFileSync(helperPath, buildInstallerBatch({
      pid: process.pid,
      installer,
      executable,
      installDir,
      logPath: this.logPath
    }), 'utf8')

    this.log(`install:start expected=${expectedVersion} installDir=${installDir} helper=cmd`)
    this.setState({ status: 'ready', progress: 100, message: `Instalando ${expectedVersion} e reiniciando o Gridium…` })
    try {
      launchInstallerBatch(helperPath)
      this.log('install:bootstrap-launched')
      app.quit()
      return true
    } catch (error) {
      const detail = errorMessage(error)
      this.log(`install:spawn-error ${detail}`)
      this.setState({ status: 'error', progress: 100, message: `Não foi possível iniciar a instalação: ${detail}` })
      return false
    }
  }

  private reconcilePreviousAttempt(): void {
    if (!existsSync(this.pendingPath)) return
    try {
      const attempt = JSON.parse(readFileSync(this.pendingPath, 'utf8')) as Partial<PendingUpdateAttempt>
      const expected = String(attempt.expectedVersion || '')
      if (!expected) throw new Error('marcador sem versão esperada')
      if (compareVersions(app.getVersion(), expected) >= 0) {
        this.snapshotState = {
          currentVersion: app.getVersion(),
          status: 'up-to-date',
          progress: 100,
          message: `Atualização concluída com sucesso: ${app.getVersion()}.`
        }
        this.log(`install:confirmed expected=${expected} current=${app.getVersion()}`)
      } else {
        this.snapshotState = {
          currentVersion: app.getVersion(),
          status: 'error',
          progress: 0,
          message: `A atualização para ${expected} não foi aplicada. O Gridium continua em ${app.getVersion()}.`
        }
        this.log(`install:not-applied expected=${expected} current=${app.getVersion()}`)
      }
      void rm(this.pendingPath, { force: true }).catch(() => undefined)
    } catch (error) {
      this.log(`install:marker-error ${errorMessage(error)}`)
      void rm(this.pendingPath, { force: true }).catch(() => undefined)
    }
  }

  private setState(patch: Partial<UpdateSnapshot>): void {
    this.snapshotState = { ...this.snapshotState, ...patch, currentVersion: app.getVersion() }
    this.publish()
  }

  private log(message: string): void {
    try {
      if (!existsSync(this.updatesDir)) return
      appendFileSync(this.logPath, `${new Date().toISOString()} ${message}\n`, 'utf8')
    } catch { /* updater logging must never break the app */ }
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'Cache-Control': 'no-cache',
      'User-Agent': `Gridium-2/${app.getVersion()}`
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
