import { createHash } from 'node:crypto'
import { chmod, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import * as v from 'valibot'

const hitSchema = v.object({ id: v.string(), kind: v.picklist(['personal', 'skill', 'history']), scope: v.string(), origin: v.string(), version: v.string(), text: v.string(), updatedAt: v.string() })
/** Indexed excerpts always retain a source identity. They are untrusted historical data, not live tool evidence. */
export type RecallHit = v.InferOutput<typeof hitSchema>

/** Owns a disposable private FTS5 index. JSON sessions, personal records and SKILL.md remain authoritative. */
export class RecallIndex {
  private constructor(private readonly database: DatabaseSync) {}

  static async open(dataDir: string) {
    const directory = join(dataDir, 'memory')
    await mkdir(directory, { recursive: true, mode: 0o700 })
    const path = join(directory, 'recall.sqlite')
    const database = new DatabaseSync(path)
    await chmod(path, 0o600)
    database.function('search_text', { deterministic: true }, text => String(text).normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd'))
    database.exec(`
      PRAGMA busy_timeout=3000;
      PRAGMA secure_delete=ON;
      PRAGMA journal_mode=DELETE;
      CREATE TABLE IF NOT EXISTS sources(origin TEXT PRIMARY KEY, version TEXT NOT NULL);
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

  close() {
    this.database.close()
  }

  version(origin: string) {
    return this.database.prepare('SELECT version FROM sources WHERE origin=?').get(origin)?.version
  }

  origins() {
    return this.database.prepare('SELECT origin FROM sources').all().map(row => String(row.origin))
  }

  /** Retains unchanged vectors. Replacement and pruning commit together, so cancelled synchronization never leaves half a source. */
  replace(origin: string, version: string, hits: Omit<RecallHit, 'version' | 'origin'>[]) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const old = new Set(this.database.prepare('SELECT id FROM excerpts WHERE origin=?').all(origin).map(row => String(row.id)))
      const upsert = this.database.prepare(`INSERT INTO excerpts(id,kind,scope,origin,version,text,updatedAt,tokens) VALUES(?,?,?,?,?,?,?,search_text(?))
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,scope=excluded.scope,origin=excluded.origin,version=excluded.version,
        vector=CASE WHEN excerpts.text=excluded.text THEN excerpts.vector ELSE NULL END,
        namespace=CASE WHEN excerpts.text=excluded.text THEN excerpts.namespace ELSE NULL END,text=excluded.text,updatedAt=excluded.updatedAt,tokens=excluded.tokens`)
      for (const hit of hits) {
        upsert.run(hit.id, hit.kind, hit.scope, origin, version, hit.text, hit.updatedAt, hit.text)
        old.delete(hit.id)
      }
      for (const id of old)
        this.database.prepare('DELETE FROM excerpts WHERE id=?').run(id)
      this.database.prepare('INSERT INTO sources(origin,version) VALUES(?,?) ON CONFLICT(origin) DO UPDATE SET version=excluded.version').run(origin, version)
      this.database.exec('COMMIT')
    }
    catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  remove(origin: string) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      this.database.prepare('DELETE FROM excerpts WHERE origin=?').run(origin)
      this.database.prepare('DELETE FROM sources WHERE origin=?').run(origin)
      // FTS5 secure-delete also removes obsolete token entries from its segment index.
      this.database.prepare('INSERT INTO search(search,rank) VALUES(\'secure-delete\',1)').run()
      this.database.exec('COMMIT')
    }
    catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  rebuild() {
    this.database.prepare('INSERT INTO search(search) VALUES(\'rebuild\')').run()
  }

  read(id: string) {
    const row = this.database.prepare('SELECT * FROM excerpts WHERE id=?').get(id)
    return row ? v.parse(hitSchema, row) : undefined
  }

  missingVectors(namespace: string) {
    return this.database.prepare('SELECT id,text,version FROM excerpts WHERE vector IS NULL OR namespace IS NULL OR namespace<>? LIMIT 8').all(namespace).map(row => ({ id: String(row.id), text: String(row.text), version: String(row.version) }))
  }

  vectors(namespace: string, items: { id: string, version: string, vector: Float32Array }[]) {
    for (const item of items)
      this.database.prepare('UPDATE excerpts SET vector=?,namespace=? WHERE id=? AND version=?').run(new Uint8Array(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength), namespace, item.id, item.version)
  }

  search(query: string, scope: string, namespace?: string, vector?: Float32Array) {
    const ignored = new Set('a an the is are was were i you me my we to of in on and or for this that what how please toi ban minh la thi ma va co cho cua cac cai voi duoc lam gi nhu hay khong mot nhung'.split(' '))
    const terms = [...new Set(query.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])].filter(term => term.length > 1 && !ignored.has(term)).slice(0, 32)
    const lexical = terms.length
      ? this.database.prepare(`SELECT excerpts.* FROM search JOIN excerpts ON excerpts.rowid=search.rowid
          WHERE search MATCH ? AND (?='*' OR excerpts.scope='' OR excerpts.scope=?) ORDER BY bm25(search) LIMIT 80`).all(terms.map(term => `"${term}"`).join(' OR '), scope, scope)
      : []
    const semantic = namespace && vector
      ? this.database.prepare(`SELECT *,similarity(vector,?) AS score FROM excerpts WHERE namespace=? AND length(vector)=? AND (?='*' OR scope='' OR scope=?) ORDER BY score DESC LIMIT 80`).all(new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength), namespace, vector.byteLength, scope, scope).filter(row => Number(row.score) >= 0.35)
      : []
    const ranked = new Map<string, { hit: RecallHit, score: number }>()
    for (const results of [lexical, semantic]) {
      results.forEach((row, rank) => {
        const hit = v.parse(hitSchema, row)
        const previous = ranked.get(hit.id)
        ranked.set(hit.id, { hit, score: (previous?.score ?? 0) + 1 / (60 + rank + 1) })
      })
    }
    return [...ranked.values()].sort((a, b) => b.score - a.score || b.hit.updatedAt.localeCompare(a.hit.updatedAt)).map(item => item.hit)
  }

  stats() {
    return { sources: Number(this.database.prepare('SELECT count(*) AS n FROM sources').get()!.n), excerpts: Number(this.database.prepare('SELECT count(*) AS n FROM excerpts').get()!.n), vectors: Number(this.database.prepare('SELECT count(*) AS n FROM excerpts WHERE vector IS NOT NULL').get()!.n) }
  }

  /** Writers purge derived copies without creating an index for users who have not enabled retrieval. */
  static async invalidate(dataDir: string, origin: string) {
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
      index.remove(origin)
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
