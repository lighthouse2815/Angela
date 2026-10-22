import type { DatabaseSync, StatementSync } from 'node:sqlite'

import type { MemoryPage, MemoryRelation, Observation, PageInput } from './types'

import { createHash, randomUUID } from 'node:crypto'

import * as v from 'valibot'

import { compact, retention } from './policy'
import { sanitize } from './sanitize'
import { authority, pageSchema } from './types'

const inputSchema = v.object({
  tier: v.picklist(['episodic', 'semantic', 'procedural']),
  kind: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  scope: v.pipe(v.string(), v.maxLength(4000)),
  key: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32_000)),
  abstract: v.optional(v.pipe(v.string(), v.maxLength(1000)), ''),
  authority: v.keyof(v.object({ inference: v.unknown(), episode: v.unknown(), consolidated: v.unknown(), project: v.unknown(), verified: v.unknown(), personal: v.unknown(), user: v.unknown() })),
  salience: v.optional(v.pipe(v.number(), v.finite()), 1),
  pinned: v.optional(v.boolean()),
  sourceSessionId: v.optional(v.pipe(v.string(), v.maxLength(200))),
  expiresAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  expectedVersion: v.optional(v.nullable(v.string())),
})

/** Owns authoritative memory in RecallIndex's connection. Every mutation and its FTS projection commit together. */
export class MemoryStore {
  private readonly statements = new Map<string, StatementSync>()

  constructor(private readonly database: DatabaseSync) {
    if (database.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'memory_schema\'').get()) {
      const version = database.prepare('SELECT max(version) AS version FROM memory_schema').get()?.version
      if (version !== 1)
        throw new Error('Unsupported memory schema version')
    }
    database.exec(`
      PRAGMA foreign_keys=ON;
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS memory_schema(version INTEGER PRIMARY KEY CHECK(version=1));
      INSERT OR IGNORE INTO memory_schema VALUES(1);
      CREATE TABLE IF NOT EXISTS memory_pages(
        id TEXT PRIMARY KEY, tier TEXT NOT NULL CHECK(tier IN ('episodic','semantic','procedural')),
        kind TEXT NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, abstract TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('active','superseded','compacted')),
        authority TEXT NOT NULL, salience REAL NOT NULL CHECK(salience BETWEEN 0.25 AND 2), pinned INTEGER NOT NULL,
        accessCount INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        lastAccessedAt TEXT, supersededBy TEXT REFERENCES memory_pages(id) ON DELETE SET NULL,
        compactedAt TEXT, expiresAt TEXT, sourceSessionId TEXT, version TEXT NOT NULL, normalized TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS memory_current ON memory_pages(scope,tier,key) WHERE status<>'superseded';
      DROP INDEX IF EXISTS memory_dedup;
      DROP INDEX IF EXISTS memory_aging;
      DROP INDEX IF EXISTS memory_aging_scope;
      CREATE INDEX IF NOT EXISTS memory_aging_cursor ON memory_pages(scope,tier,status,updatedAt,id) WHERE pinned=0;
      CREATE TABLE IF NOT EXISTS memory_aging_cursors(scope TEXT PRIMARY KEY, updatedAt TEXT NOT NULL, id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS memory_session ON memory_pages(sourceSessionId,scope);
      CREATE TABLE IF NOT EXISTS memory_edges(
        fromId TEXT NOT NULL REFERENCES memory_pages(id) ON DELETE CASCADE,
        toId TEXT NOT NULL REFERENCES memory_pages(id) ON DELETE CASCADE,
        relation TEXT NOT NULL CHECK(relation IN ('related_to','supersedes','contradicts','derived_from')),
        createdAt TEXT NOT NULL, PRIMARY KEY(fromId,toId,relation), CHECK(fromId<>toId)
      );
      CREATE INDEX IF NOT EXISTS memory_edge_target ON memory_edges(toId,relation);
      CREATE TABLE IF NOT EXISTS memory_observations(
        sequence INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, type TEXT NOT NULL, correlationId TEXT NOT NULL,
        sessionId TEXT NOT NULL, scope TEXT NOT NULL, channel TEXT NOT NULL, timestamp TEXT NOT NULL,
        text TEXT NOT NULL, verified INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memory_observation_session ON memory_observations(scope,sessionId,sequence);
      CREATE TABLE IF NOT EXISTS memory_suppression(
        scope TEXT NOT NULL, sessionId TEXT NOT NULL, captureAfter TEXT, PRIMARY KEY(scope,sessionId)
      );
      CREATE TABLE IF NOT EXISTS memory_blocked_requests(
        scope TEXT NOT NULL, correlationId TEXT NOT NULL, PRIMARY KEY(scope,correlationId)
      );
      CREATE TRIGGER IF NOT EXISTS memory_projection_insert AFTER INSERT ON memory_pages WHEN new.status<>'superseded' BEGIN
        INSERT INTO excerpts(id,kind,scope,origin,version,text,updatedAt,tokens)
        VALUES('memory:'||new.id,new.tier,new.scope,'memory:'||new.id,new.version,
          new.title||char(10)||new.abstract||char(10)||new.body,new.updatedAt,
          search_text(new.title||char(10)||new.abstract||char(10)||new.body));
        INSERT INTO sources(origin,version) VALUES('memory:'||new.id,new.version);
      END;
      CREATE TRIGGER IF NOT EXISTS memory_projection_update AFTER UPDATE OF status,body,title,abstract,version ON memory_pages BEGIN
        DELETE FROM excerpts WHERE id='memory:'||old.id;
        DELETE FROM sources WHERE origin='memory:'||old.id;
        INSERT INTO excerpts(id,kind,scope,origin,version,text,updatedAt,tokens)
          SELECT 'memory:'||new.id,new.tier,new.scope,'memory:'||new.id,new.version,
            new.title||char(10)||new.abstract||char(10)||new.body,new.updatedAt,
            search_text(new.title||char(10)||new.abstract||char(10)||new.body) WHERE new.status<>'superseded';
        INSERT INTO sources(origin,version) SELECT 'memory:'||new.id,new.version WHERE new.status<>'superseded';
      END;
      CREATE TRIGGER IF NOT EXISTS memory_projection_delete AFTER DELETE ON memory_pages BEGIN
        DELETE FROM excerpts WHERE id='memory:'||old.id;
        DELETE FROM sources WHERE origin='memory:'||old.id;
      END;
      COMMIT;
    `)
    if (!database.prepare('PRAGMA table_info(memory_suppression)').all().some(column => column.name === 'captureAfter'))
      database.exec('ALTER TABLE memory_suppression ADD COLUMN captureAfter TEXT')
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

  private transaction<T>(run: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = run()
      this.database.exec('COMMIT')
      return result
    }
    catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  private page(row?: ReturnType<StatementSync['get']>) {
    return row ? v.parse(pageSchema, { ...row, pinned: Boolean(row.pinned) }) : undefined
  }

  /** Reads require an exact scope. Superseded pages remain available only through explicit history reads. */
  read(id: string, scope: string, history = false, now = new Date().toISOString()) {
    return this.page(this.sql('SELECT * FROM memory_pages WHERE id=? AND scope=? AND (? OR (status<>\'superseded\' AND (expiresAt IS NULL OR expiresAt>?)))').get(id, scope, Number(history), now))
  }

  current(scope: string, tier: MemoryPage['tier'], key: string) {
    return this.page(this.sql('SELECT * FROM memory_pages WHERE scope=? AND tier=? AND key=? AND status<>\'superseded\'').get(scope, tier, key))
  }

  /** Rejects weaker replacements and pinned automatic edits. Exact normalized duplicates share one active identity. */
  write(input: PageInput, now = new Date().toISOString()): MemoryPage {
    const value = v.parse(inputSchema, input)
    const title = sanitize(value.title, 200)
    const body = sanitize(value.body, 32_000)
    const abstract = sanitize(value.abstract, 1000)
    const normalized = createHash('sha256').update(body.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/gu, ' ').trim()).digest('hex')
    return this.transaction(() => {
      const previous = this.current(value.scope, value.tier, value.key)
      if (value.expectedVersion !== undefined && (previous?.version ?? null) !== value.expectedVersion)
        throw new Error('Memory version conflict')
      const pinned = value.pinned ?? previous?.pinned ?? false
      if (previous && (authority[value.authority] < authority[previous.authority] || (previous.pinned && value.authority !== 'user')))
        throw new Error('Memory authority rejects replacement')
      const duplicate = this.page(this.sql('SELECT * FROM memory_pages WHERE scope=? AND tier=? AND kind=? AND normalized=? AND status<>\'superseded\' AND key=?').get(value.scope, value.tier, value.kind, normalized, value.key))
      if (previous && duplicate?.id === previous.id && previous.title === title && previous.abstract === abstract && previous.authority === value.authority && previous.pinned === pinned && previous.salience === Math.max(0.25, Math.min(2, value.salience)) && previous.expiresAt === (value.expiresAt ?? null))
        return previous
      if (duplicate && !previous)
        return duplicate
      const id = randomUUID()
      if (previous)
        this.sql('UPDATE memory_pages SET status=\'superseded\' WHERE id=?').run(previous.id)
      const version = createHash('sha256').update(JSON.stringify([id, title, body, abstract, value.authority])).digest('hex')
      // Session checkpoints revise one episode. Its access history survives a checkpoint instead of resetting the SQL cooldown each turn.
      const checkpoint = value.tier === 'episodic' && value.kind === 'session' && previous?.kind === 'session' && previous.sourceSessionId === (value.sourceSessionId ?? null)
      this.sql(`INSERT INTO memory_pages(id,tier,kind,scope,key,title,body,abstract,status,authority,salience,pinned,createdAt,updatedAt,expiresAt,sourceSessionId,version,normalized,accessCount,lastAccessedAt)
        VALUES(?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?,?,?,?)`).run(id, value.tier, value.kind, value.scope, value.key, title, body, abstract, value.authority, Math.max(0.25, Math.min(2, value.salience)), Number(pinned), previous?.createdAt ?? now, now, value.expiresAt ?? null, value.sourceSessionId ?? null, version, normalized, checkpoint ? previous.accessCount : 0, checkpoint ? previous.lastAccessedAt : null)
      if (previous) {
        this.sql('UPDATE memory_pages SET supersededBy=? WHERE id=?').run(id, previous.id)
        this.link(id, previous.id, 'supersedes', value.scope, now)
      }
      return this.read(id, value.scope, true, now)!
    })
  }

  /** Edges never cross workspace scopes. A contradiction records disagreement without changing either claim. */
  link(fromId: string, toId: string, relation: MemoryRelation, scope: string, now = new Date().toISOString()) {
    if (fromId === toId || !this.read(fromId, scope, true, now) || !this.read(toId, scope, true, now))
      throw new Error('Memory edge scope mismatch')
    this.sql('INSERT OR IGNORE INTO memory_edges VALUES(?,?,?,?)').run(fromId, toId, relation, now)
  }

  edges(id: string, scope: string) {
    if (!this.read(id, scope, true))
      return []
    return this.sql('SELECT fromId,toId,relation FROM memory_edges WHERE fromId=? OR toId=?').all(id, id)
  }

  /** SQL throttling avoids per-page process caches and never changes content versions or FTS rows. */
  reinforce(ids: string[], scope: string, now = Date.now()) {
    const timestamp = new Date(now).toISOString()
    const cutoff = new Date(now - 60_000).toISOString()
    const due = this.sql('SELECT id FROM memory_pages WHERE id IN (SELECT value FROM json_each(?)) AND scope=? AND status<>\'superseded\' AND (expiresAt IS NULL OR expiresAt>?) AND (lastAccessedAt IS NULL OR lastAccessedAt<=?)').all(JSON.stringify(ids.slice(0, 80)), scope, timestamp, cutoff)
    if (!due.length)
      return
    this.transaction(() => {
      for (const row of due)
        this.sql('UPDATE memory_pages SET accessCount=accessCount+1,lastAccessedAt=? WHERE id=? AND scope=? AND status<>\'superseded\' AND (expiresAt IS NULL OR expiresAt>?) AND (lastAccessedAt IS NULL OR lastAccessedAt<=?)').run(timestamp, String(row.id), scope, timestamp, cutoff)
    })
  }

  /** Retains 256 sanitized observations per session. Replayed event IDs cannot create duplicate evidence. */
  observe(event: Observation) {
    this.transaction(() => {
      if (this.sql('SELECT 1 FROM memory_blocked_requests WHERE (scope=? OR scope=\'*\') AND correlationId=?').get(event.scope, event.correlationId)
        || this.sql('SELECT 1 FROM memory_suppression WHERE (scope=? OR scope=\'*\') AND sessionId=? AND (captureAfter IS NULL OR captureAfter>=?)').get(event.scope, event.sessionId, event.timestamp)) {
        return
      }
      this.sql('INSERT OR IGNORE INTO memory_observations(id,type,correlationId,sessionId,scope,channel,timestamp,text,verified) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(event.id, event.type, event.correlationId, event.sessionId, event.scope, event.channel, event.timestamp, sanitize(event.text), Number(event.verified))
      this.sql('DELETE FROM memory_observations WHERE scope=? AND sessionId=? AND sequence NOT IN (SELECT sequence FROM memory_observations WHERE scope=? AND sessionId=? ORDER BY sequence DESC LIMIT 256)').run(event.scope, event.sessionId, event.scope, event.sessionId)
    })
  }

  observations(scope: string, sessionId: string): Observation[] {
    return this.sql('SELECT * FROM memory_observations WHERE scope=? AND sessionId=? ORDER BY sequence LIMIT 256').all(scope, sessionId).map(row => ({
      id: String(row.id),
      type: String(row.type),
      correlationId: String(row.correlationId),
      sessionId: String(row.sessionId),
      scope: String(row.scope),
      channel: String(row.channel),
      timestamp: String(row.timestamp),
      text: String(row.text),
      verified: Boolean(row.verified),
    }))
  }

  /** Tombstones contain identities only, never forgotten personal text. Late capture and history rebuilds fail closed. */
  suppressed(scope: string, sessionId: string) {
    return Boolean(this.sql('SELECT 1 FROM memory_suppression WHERE (scope=? OR scope=\'*\') AND sessionId=?').get(scope, sessionId))
  }

  /** Batches only cold episodic candidates. Compacted pages remain searchable and cannot enter a compaction loop. */
  age(scope: string, now = Date.now(), limit = 32) {
    const cutoff = new Date(now - 90 * 86_400_000).toISOString()
    const batch = Math.max(1, Math.min(128, limit))
    const cursor = this.sql('SELECT updatedAt,id FROM memory_aging_cursors WHERE scope=?').get(scope)
    const pages = cursor
      ? this.sql('SELECT * FROM memory_pages WHERE scope=? AND tier=\'episodic\' AND status=\'active\' AND pinned=0 AND updatedAt<? AND (updatedAt,id)>(?,?) ORDER BY updatedAt,id LIMIT ?').all(scope, cutoff, String(cursor.updatedAt), String(cursor.id), batch)
      : this.sql('SELECT * FROM memory_pages WHERE scope=? AND tier=\'episodic\' AND status=\'active\' AND pinned=0 AND updatedAt<? ORDER BY updatedAt,id LIMIT ?').all(scope, cutoff, batch)
    if (!pages.length) {
      if (cursor)
        this.sql('DELETE FROM memory_aging_cursors WHERE scope=?').run(scope)
      return 0
    }
    let count = 0
    for (const row of pages) {
      const selected = this.page(row)!
      const changed = this.transaction(() => {
        // Another process can reinforce or supersede a selected candidate before the writer lock arrives.
        const page = this.read(selected.id, scope)
        if (!page || page.status !== 'active' || page.pinned || retention(page, now) >= 0.2)
          return false
        const body = compact(page)
        const version = createHash('sha256').update(body).digest('hex')
        const normalized = createHash('sha256').update(body.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim()).digest('hex')
        this.sql('UPDATE memory_pages SET body=?,normalized=?,status=\'compacted\',compactedAt=?,version=? WHERE id=? AND status=\'active\'').run(body, normalized, new Date(now).toISOString(), version, page.id)
        return true
      })
      if (changed)
        count++
    }
    // A durable cursor advances past reinforced pages. Repeated short-lived adapters cannot starve colder pages behind them.
    const last = pages.at(-1)!
    this.sql('INSERT INTO memory_aging_cursors VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET updatedAt=excluded.updatedAt,id=excluded.id').run(scope, String(last.updatedAt), String(last.id))
    return count
  }

  private suppress(scope: string, sessionId: string, terminal = false) {
    this.sql('INSERT OR IGNORE INTO memory_blocked_requests SELECT scope,correlationId FROM memory_observations WHERE sessionId=? AND (scope=? OR ?=\'*\')').run(sessionId, scope, scope)
    this.sql(`INSERT INTO memory_suppression(scope,sessionId,captureAfter) VALUES(?,?,?)
      ON CONFLICT(scope,sessionId) DO UPDATE SET captureAfter=CASE
        WHEN memory_suppression.captureAfter IS NULL OR excluded.captureAfter IS NULL THEN NULL
        ELSE max(memory_suppression.captureAfter,excluded.captureAfter) END`).run(scope, sessionId, terminal ? null : new Date().toISOString())
  }

  private erasePages(ids: string[], protectIndependent = false) {
    if (!ids.length)
      return
    // Follow both version directions, but only the downstream direction of derivation. A child never deletes its independent source.
    const rows = this.sql(`WITH RECURSIVE doomed(id,scope) AS (
      SELECT id,scope FROM memory_pages WHERE id IN (SELECT value FROM json_each(?))
      UNION SELECT p.id,p.scope FROM memory_edges e JOIN doomed d ON e.toId=d.id
        JOIN memory_pages p ON p.id=e.fromId AND p.scope=d.scope
        JOIN memory_pages source ON source.id=d.id
        WHERE e.relation IN ('derived_from','supersedes')
          AND (?=0 OR p.authority NOT IN ('user','personal','verified','project') OR p.sourceSessionId=source.sourceSessionId)
      UNION SELECT p.id,p.scope FROM memory_edges e JOIN doomed d ON e.fromId=d.id
        JOIN memory_pages p ON p.id=e.toId AND p.scope=d.scope
        JOIN memory_pages source ON source.id=d.id
        WHERE e.relation='supersedes'
          AND (?=0 OR p.authority NOT IN ('user','personal','verified','project') OR p.sourceSessionId=source.sourceSessionId)
    ) SELECT p.id,p.scope,p.sourceSessionId FROM memory_pages p JOIN doomed d ON p.id=d.id`).all(JSON.stringify(ids), Number(protectIndependent), Number(protectIndependent))
    for (const row of rows) {
      if (row.sourceSessionId !== null) {
        this.suppress(String(row.scope), String(row.sourceSessionId))
        this.sql('DELETE FROM memory_observations WHERE scope=? AND sessionId=?').run(String(row.scope), String(row.sourceSessionId))
      }
    }
    this.sql('DELETE FROM memory_pages WHERE id IN (SELECT value FROM json_each(?))').run(JSON.stringify(rows.map(row => row.id)))
  }

  /** Purges a claim, its version history and downstream derivations. Fresh requests can learn again without replaying forgotten captures. */
  purge(id: string, scope: string) {
    const page = this.read(id, scope, true)
    if (!page)
      return
    this.transaction(() => {
      const roots = this.sql('SELECT id FROM memory_pages WHERE scope=? AND tier=? AND key=?').all(scope, page.tier, page.key)
      this.erasePages(roots.map(row => String(row.id)))
    })
    this.reclaim()
  }

  /** Removes captured copies and blocks old request correlations. A later explicit conversation remains eligible for new memory. */
  forgetText(text: string, sessionId?: string) {
    if (!text.trim())
      return
    this.transaction(() => {
      const captures = this.sql('SELECT DISTINCT scope,sessionId FROM memory_observations WHERE instr(lower(text),lower(?))>0').all(text)
      const histories = this.sql('SELECT DISTINCT scope,substr(origin,9) AS sessionId FROM excerpts WHERE kind=\'history\' AND instr(lower(text),lower(?))>0').all(text)
      const sessions = new Set([...captures, ...histories].map(row => String(row.sessionId)))
      if (sessionId) {
        sessions.add(sessionId)
        this.suppress('*', sessionId)
      }
      const roots = this.sql('SELECT id FROM memory_pages WHERE sourceSessionId IN (SELECT value FROM json_each(?)) OR instr(lower(body),lower(?))>0 OR instr(lower(abstract),lower(?))>0').all(JSON.stringify([...sessions]), text, text)
      this.erasePages(roots.map(row => String(row.id)), true)
      for (const row of [...captures, ...histories])
        this.suppress(String(row.scope), String(row.sessionId))
      this.sql('DELETE FROM memory_observations WHERE sessionId IN (SELECT value FROM json_each(?))').run(JSON.stringify([...sessions]))
      this.sql('DELETE FROM excerpts WHERE kind=\'history\' AND EXISTS(SELECT 1 FROM memory_suppression s WHERE (s.scope=excerpts.scope OR s.scope=\'*\') AND s.sessionId=substr(excerpts.origin,9))').run()
      this.sql('DELETE FROM sources WHERE origin LIKE \'history:%\' AND NOT EXISTS(SELECT 1 FROM excerpts e WHERE e.origin=sources.origin)').run()
    })
    this.reclaim()
  }

  purgeSession(sessionId: string) {
    this.transaction(() => {
      this.suppress('*', sessionId, true)
      const roots = this.sql('SELECT id FROM memory_pages WHERE sourceSessionId=?').all(sessionId)
      this.erasePages(roots.map(row => String(row.id)), true)
      this.sql('DELETE FROM memory_observations WHERE sessionId=?').run(sessionId)
    })
    this.reclaim()
  }

  /** Destructive operations checkpoint obsolete WAL frames. A busy reader reports incomplete physical cleanup for a retry. */
  reclaim() {
    const result = this.sql('PRAGMA wal_checkpoint(TRUNCATE)').get()
    if (Number(result?.busy) > 0)
      throw new Error('Memory purge checkpoint is busy')
  }

  stats() {
    return { pages: Number(this.sql('SELECT count(*) AS n FROM memory_pages').get()!.n), observations: Number(this.sql('SELECT count(*) AS n FROM memory_observations').get()!.n) }
  }
}
