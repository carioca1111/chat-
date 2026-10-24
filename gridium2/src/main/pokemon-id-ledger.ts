import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'

const DEFAULT_CACHE_ENTRIES = 4_096
const LEDGER_DIRECTORY = join(process.env.LOCALAPPDATA || process.env.APPDATA || tmpdir(), 'Gridium2')
const LEDGER_DATABASE_PATH = join(LEDGER_DIRECTORY, `pokemon-id-ledger-${process.pid}.sqlite`)

mkdirSync(LEDGER_DIRECTORY, { recursive: true })
try { rmSync(LEDGER_DATABASE_PATH, { force: true }) } catch { /* best-effort cleanup from a reused pid */ }

const openDatabases = new Set<DatabaseSync>()
let ledgerSequence = 0
let cleanupRegistered = false

function registerDatabase(database: DatabaseSync): void {
  openDatabases.add(database)
  if (cleanupRegistered) return
  cleanupRegistered = true
  process.once('exit', () => {
    for (const db of openDatabases) {
      try { db.close() } catch { /* process teardown */ }
    }
    openDatabases.clear()
    try { rmSync(LEDGER_DATABASE_PATH, { force: true }) } catch { /* process teardown */ }
  })
}

/**
 * Exact capture deduplication ledger backed by SQLite.
 *
 * The previous range compression was extremely compact for sequential IDs but
 * could still grow in JavaScript heap when server instance IDs were sparse.
 * This implementation keeps the complete identity set in a small file-backed
 * SQLite database and only the most recently touched IDs in a bounded JS cache.
 */
export class PokemonIdLedger {
  private readonly database = new DatabaseSync(LEDGER_DATABASE_PATH)
  private readonly namespace = `ledger-${++ledgerSequence}`
  private readonly hasStatement: StatementSync
  private readonly insertStatement: StatementSync
  private readonly clearStatement: StatementSync
  private readonly cache = new Map<string, true>()
  private readonly maxCacheEntries: number
  private count = 0

  constructor(maxCacheEntries = DEFAULT_CACHE_ENTRIES) {
    this.maxCacheEntries = Math.max(32, Math.floor(maxCacheEntries) || DEFAULT_CACHE_ENTRIES)
    this.database.exec(`
      PRAGMA journal_mode = MEMORY;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = FILE;
      PRAGMA cache_size = -2048;
      CREATE TABLE IF NOT EXISTS seen_pokemon_ids (
        ledger TEXT NOT NULL,
        id TEXT NOT NULL,
        PRIMARY KEY (ledger, id)
      ) WITHOUT ROWID;
    `)
    this.hasStatement = this.database.prepare('SELECT 1 AS seen FROM seen_pokemon_ids WHERE ledger = ? AND id = ? LIMIT 1')
    this.insertStatement = this.database.prepare('INSERT OR IGNORE INTO seen_pokemon_ids (ledger, id) VALUES (?, ?)')
    this.clearStatement = this.database.prepare('DELETE FROM seen_pokemon_ids WHERE ledger = ?')
    registerDatabase(this.database)
  }

  get size(): number { return this.count }
  get storageEntries(): number { return this.count }
  get cacheEntries(): number { return this.cache.size }
  get cacheLimit(): number { return this.maxCacheEntries }

  clear(): void {
    this.clearStatement.run(this.namespace)
    this.cache.clear()
    this.count = 0
  }

  has(id: string): boolean {
    if (this.cache.has(id)) {
      this.remember(id)
      return true
    }
    const seen = this.hasStatement.get(this.namespace, id) !== undefined
    if (seen) this.remember(id)
    return seen
  }

  add(id: string): void {
    const result = this.insertStatement.run(this.namespace, id)
    if (Number(result.changes) > 0) this.count++
    this.remember(id)
  }

  private remember(id: string): void {
    if (this.cache.has(id)) this.cache.delete(id)
    this.cache.set(id, true)
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.cache.delete(oldest)
    }
  }
}
