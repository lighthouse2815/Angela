import type { StatementSync } from 'node:sqlite'

import type { MemoryAuthority } from './memory-v2/types'

import { createHash } from 'node:crypto'
import { chmod, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import * as v from 'valibot'

import { MemoryStore } from './memory-v2/store'
import { authority } from './memory-v2/types'
import { searchTerms, supportsContext } from './recall-query'

const hitSchema = v.object({ id: v.string(), kind: v.picklist(['personal', 'skill', 'history', 'episodic', 'semantic', 'procedural']), scope: v.string(), origin: v.string(), version: v.string(), text: v.string(), updatedAt: v.string() })
/** Indexed excerpts always retain a source identity. They are untrusted historical data, not live tool evidence. */
export type RecallHit = v.InferOutput<typeof hitSchema>

/** Owns private durable pages and derived retrieval. Existing JSON stores and skills retain their authority. */
export class RecallIndex {
  readonly memory: MemoryStore
  private readonly statements = new Map<string, StatementSync>()

  private constructor(private readonly database: DatabaseSync) {
    this.memory = new MemoryStore(database)
  }

  static async open(dataDir: string) {
    const directory = join(dataDir, 'memory')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const path = join(directory, 'recall.sqlite')
    const database = new DatabaseSync(path)
    try {
      await chmod(path, 0o600)
      database.function('search_text', { deterministic: true }, text => String(text).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd'))
      database.exec(`
        PRAGMA busy_timeout=3000;
        PRAGMA secure_delete=ON;
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=FULL;
        PRAGMA wal_autocheckpoint=512;
        PRAGMA journal_size_limit=4194304;
        BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS sources(origin TEXT PRIMARY KEY, version TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS invalidated_sources(origin TEXT NOT NULL,version TEXT NOT NULL,PRIMARY KEY(origin,version));
        CREATE TABLE IF NOT EXISTS excerpts(
          rowid INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, scope TEXT NOT NULL,
          origin TEXT NOT NULL, version TEXT NOT NULL, text TEXT NOT NULL, updatedAt TEXT NOT NULL, tokens TEXT NOT NULL,
          vector BLOB, namespace TEXT
        );
        CREATE INDEX IF NOT EXISTS excerpts_scope ON excerpts(scope,kind);
        CREATE INDEX IF NOT EXISTS excerpts_origin ON excerpts(origin);
        CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(tokens, content='excerpts', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
        CREATE TRIGGER IF NOT EXISTS excerpts_insert AFTER INSERT ON excerpts BEGIN INSERT INTO search(rowid,tokens) VALUES(new.rowid,new.tokens); END;
        CREATE TRIGGER IF NOT EXISTS excerpts_delete AFTER DELETE ON excerpts BEGIN INSERT INTO search(search,rowid,tokens) VALUES('delete',old.rowid,old.tokens); END;
        CREATE TRIGGER IF NOT EXISTS excerpts_update AFTER UPDATE OF tokens ON excerpts BEGIN
          INSERT INTO search(search,rowid,tokens) VALUES('delete',old.rowid,old.tokens);
          INSERT INTO search(rowid,tokens) VALUES(new.rowid,new.tokens);
        END;
        COMMIT;
      `)
      database.prepare('INSERT INTO search(search,rank) VALUES(\'secure-delete\',1)').run()
      database.function('similarity', { deterministic: true }, (left, right) => {
        if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.byteLength !== right.byteLength || left.byteLength % 4)
          return -1
        const a = new Float32Array(left.slice().buffer)
        const b = new Float32Array(right.slice().buffer)
        let score = 0
        for (let i = 0; i < a.length; i++)
          score += a[i]! * b[i]!
        return score
      })
      return new RecallIndex(database)
    }
    catch (error) {
      database.close()
      throw error
    }
  }

  private sql(query: string) {
    let statement = this.statements.get(query)
    if (!statement) {
      statement = this.database.prepare(query)
      if (this.statements.size >= 48)
        this.statements.delete(this.statements.keys().next().value!)
      this.statements.set(query, statement)
    }
    return statement
  }

  close() {
    this.statements.clear()
    this.database.close()
  }

  version(origin: string) {
    return this.sql('SELECT version FROM sources WHERE origin=?').get(origin)?.version
  }

  origins(includePages = true) {
    return this.sql('SELECT origin FROM sources WHERE (? OR origin NOT LIKE \'memory:%\')').all(Number(includePages)).map(row => String(row.origin))
  }

  /** Retains unchanged vectors. Replacement and pruning commit together, so cancelled synchronization never leaves half a source. */
  replace(origin: string, version: string, hits: Omit<RecallHit, 'version' | 'origin'>[]) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      if (origin === 'personal' && this.sql('SELECT 1 FROM invalidated_sources WHERE origin=? AND version=?').get(origin, version)) {
        this.database.exec('COMMIT')
        return
      }
      const old = new Set(this.sql('SELECT id FROM excerpts WHERE origin=?').all(origin).map(row => String(row.id)))
      const upsert = this.sql(`INSERT INTO excerpts(id,kind,scope,origin,version,text,updatedAt,tokens) VALUES(?,?,?,?,?,?,?,search_text(?))
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,scope=excluded.scope,origin=excluded.origin,version=excluded.version,
        vector=CASE WHEN excerpts.text=excluded.text THEN excerpts.vector ELSE NULL END,
        namespace=CASE WHEN excerpts.text=excluded.text THEN excerpts.namespace ELSE NULL END,text=excluded.text,updatedAt=excluded.updatedAt,tokens=excluded.tokens`)
      for (const hit of hits) {
        upsert.run(hit.id, hit.kind, hit.scope, origin, version, hit.text, hit.updatedAt, hit.text)
        old.delete(hit.id)
      }
      for (const id of old)
        this.sql('DELETE FROM excerpts WHERE id=?').run(id)
      this.sql('INSERT INTO sources(origin,version) VALUES(?,?) ON CONFLICT(origin) DO UPDATE SET version=excluded.version').run(origin, version)
      this.database.exec('COMMIT')
    }
    catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  remove(origin: string, id?: string, previousVersion?: string) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      if (previousVersion)
        this.sql('INSERT OR IGNORE INTO invalidated_sources VALUES(?,?)').run(origin, previousVersion)
      this.sql('DELETE FROM excerpts WHERE origin=? AND (? IS NULL OR id=?)').run(origin, id ?? null, id ?? null)
      this.sql('DELETE FROM sources WHERE origin=?').run(origin)
      // FTS5 secure-delete also removes obsolete token entries from its segment index.
      this.sql('INSERT INTO search(search,rank) VALUES(\'secure-delete\',1)').run()
      this.database.exec('COMMIT')
    }
    catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  /** Reconciliation batches at most 32 origins per transaction. The caller yields between batches. */
  removeMany(origins: string[]) {
    if (origins.length > 32)
      throw new RangeError('Recall pruning batch is too large')
    if (!origins.length)
      return
    this.database.exec('BEGIN IMMEDIATE')
    try {
      for (const origin of origins) {
        this.sql('DELETE FROM excerpts WHERE origin=?').run(origin)
        this.sql('DELETE FROM sources WHERE origin=?').run(origin)
      }
      this.database.exec('COMMIT')
    }
    catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  rescan() {
    this.sql('UPDATE sources SET version=\'\'').run()
  }

  rebuild() {
    this.sql('INSERT INTO search(search) VALUES(\'rebuild\')').run()
  }

  read(id: string) {
    const row = this.sql('SELECT * FROM excerpts WHERE id=?').get(id)
    return row ? v.parse(hitSchema, row) : undefined
  }

  missingVectors(namespace: string, dimensions?: number) {
    return this.sql('SELECT id,text,version FROM excerpts WHERE vector IS NULL OR namespace IS NULL OR namespace<>? OR (? IS NOT NULL AND length(vector)<>?) LIMIT 8').all(namespace, dimensions ?? null, (dimensions ?? 0) * 4).map(row => ({ id: String(row.id), text: String(row.text), version: String(row.version) }))
  }

  vectors(namespace: string, items: { id: string, version: string, vector: Float32Array }[]) {
    for (const item of items)
      this.sql('UPDATE excerpts SET vector=?,namespace=? WHERE id=? AND version=?').run(new Uint8Array(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength), namespace, item.id, item.version)
  }

  /** Selects bounded evidence from one latest eligible session, inside the requested workspace and private store. */
  recentSession(scope: string, excludedSessionId: string) {
    const rows = this.sql(`WITH eligible AS (
      SELECT e.*,CASE WHEN e.kind='history' THEN substr(e.origin,9) ELSE p.sourceSessionId END AS sessionId
      FROM excerpts e LEFT JOIN memory_pages p ON e.id='memory:'||p.id
      WHERE (?='*' OR e.scope=?)
        AND (e.kind='history' OR (e.kind='episodic' AND p.kind='session' AND p.status<>'superseded'))
        AND (p.expiresAt IS NULL OR p.expiresAt>?)
    ), latest AS (
      SELECT sessionId FROM eligible e
      WHERE sessionId IS NOT NULL AND sessionId<>?
        AND NOT EXISTS(SELECT 1 FROM memory_suppression s WHERE s.sessionId=e.sessionId AND (s.scope=e.scope OR s.scope='*'))
      GROUP BY sessionId ORDER BY max(updatedAt) DESC,sessionId LIMIT 1
    )
    SELECT e.* FROM eligible e JOIN latest l ON l.sessionId=e.sessionId
    ORDER BY CASE WHEN e.kind='episodic' THEN 0 WHEN e.id LIKE '%:overview' THEN 1 ELSE 2 END,
      e.updatedAt DESC,e.id LIMIT 12`).all(scope, scope, new Date().toISOString(), excludedSessionId)
    return rows.map(row => v.parse(hitSchema, row))
  }

  search(query: string, scope: string, namespace?: string, vector?: Float32Array, excludedOrigin = '', automatic = false) {
    const terms = searchTerms(query)
    const lexical = terms.length
      ? this.sql(`SELECT excerpts.*,p.authority AS memoryAuthority,p.salience AS memorySalience FROM search JOIN excerpts ON excerpts.rowid=search.rowid
          LEFT JOIN memory_pages p ON p.id=substr(excerpts.id,8) AND excerpts.kind IN ('episodic','semantic','procedural')
          WHERE search MATCH ? AND (?='*' OR excerpts.scope='' OR excerpts.scope=?) AND excerpts.origin<>?
            AND (p.expiresAt IS NULL OR p.expiresAt>?) ORDER BY bm25(search) LIMIT 80`).all(terms.map(term => `"${term}"`).join(' OR '), scope, scope, excludedOrigin, new Date().toISOString())
      : []
    const semantic = namespace && vector
      ? this.sql(`SELECT excerpts.*,p.authority AS memoryAuthority,p.salience AS memorySalience,similarity(vector,?) AS score FROM excerpts
          LEFT JOIN memory_pages p ON p.id=substr(excerpts.id,8) AND excerpts.kind IN ('episodic','semantic','procedural')
          WHERE namespace=? AND length(vector)=? AND (?='*' OR excerpts.scope='' OR excerpts.scope=?) AND excerpts.origin<>?
            AND (p.expiresAt IS NULL OR p.expiresAt>?) ORDER BY score DESC LIMIT 80`).all(new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength), namespace, vector.byteLength, scope, scope, excludedOrigin, new Date().toISOString()).filter(row => Number(row.score) >= 0.35)
      : []
    const ranked = new Map<string, { hit: RecallHit, score: number }>()
    for (const results of [lexical, semantic]) {
      results.forEach((row, rank) => {
        const hit = v.parse(hitSchema, row)
        const previous = ranked.get(hit.id)
        // Relevance generates candidates first. Bounded authority resolves close contests without hiding targeted historical evidence.
        let weight = hit.kind === 'personal' ? 1.25 : hit.kind === 'skill' ? 1.1 : 1
        if (row.memoryAuthority) {
          weight += 0.03 * (authority[String(row.memoryAuthority) as MemoryAuthority] ?? 0)
          weight += 0.03 * Math.max(0.25, Math.min(2, Number(row.memorySalience)))
          if (hit.kind === 'semantic' || hit.kind === 'procedural')
            weight += 0.02
        }
        ranked.set(hit.id, { hit, score: (previous?.score ?? 0) + weight / (60 + rank + 1) })
      })
    }
    const semanticIds = new Set(semantic.map(row => String(row.id)))
    return [...ranked.values()]
      .sort((a, b) => b.score - a.score || b.hit.updatedAt.localeCompare(a.hit.updatedAt))
      .filter(({ hit }) => !automatic || semanticIds.has(hit.id) || supportsContext(query, hit.text))
      .map(item => item.hit)
  }

  stats(namespace?: string, dimensions?: number) {
    return { sources: Number(this.sql('SELECT count(*) AS n FROM sources').get()!.n), excerpts: Number(this.sql('SELECT count(*) AS n FROM excerpts').get()!.n), vectors: Number(this.sql('SELECT count(*) AS n FROM excerpts WHERE vector IS NOT NULL AND namespace=? AND (? IS NULL OR length(vector)=?)').get(namespace ?? '', dimensions ?? null, (dimensions ?? 0) * 4)!.n) }
  }

  /** Writers purge derived copies without creating an index for users who have not enabled retrieval. */
  static async invalidate(dataDir: string, origin: string, id?: string, forgotten?: { text?: string, sessionId?: string, activeSessionId?: string, previousVersion?: string }) {
    try {
      await stat(join(dataDir, 'memory', 'recall.sqlite'))
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return
      throw error
    }
    const index = await RecallIndex.open(dataDir)
    try {
      if (origin.startsWith('history:'))
        index.memory.purgeSession(origin.slice(8))
      if (forgotten?.text)
        index.memory.forgetText(forgotten.text, forgotten.sessionId, forgotten.activeSessionId)
      index.remove(origin, id, forgotten?.previousVersion)
      index.memory.reclaim()
    }
    finally {
      index.close()
    }
  }
}

/** Hashes source contents for cache invalidation. It never includes credentials or provider configuration. */
export function sourceVersion(text: string) {
  return createHash('sha256').update(text).digest('hex')
}
