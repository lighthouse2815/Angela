import process from 'node:process'

import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'

import { cliMessages } from '@angela/i18n/cli'

const source = process.env.ANGELA_BENCH_SOURCE ?? join(import.meta.dirname, '../src')
const { Recall }: typeof import('../src/recall') = await import(pathToFileURL(join(source, 'recall.ts')).href)
const { RecallIndex }: typeof import('../src/recall-index') = await import(pathToFileURL(join(source, 'recall-index.ts')).href)
const { MemoryConsolidator }: typeof import('../src/memory-v2/consolidator') = await import(pathToFileURL(join(source, 'memory-v2/consolidator.ts')).href)
const { evaluateMemory }: typeof import('../src/memory-v2/evaluation') = await import(pathToFileURL(join(source, 'memory-v2/evaluation.ts')).href)
const { buildContext }: typeof import('../src/runtime/context-builder') = await import(pathToFileURL(join(source, 'runtime/context-builder.ts')).href)
const { Embeddings }: typeof import('../src/embeddings') = await import(pathToFileURL(join(source, 'embeddings.ts')).href)

/** Sequential local benchmarks use synthetic data and a local embedding fixture. No real user corpus or provider credentials enter the report. */
const directory = await mkdtemp(join(tmpdir(), 'angela-memory-v2-bench-'))
const mode = process.argv[2] === 'DELETE' ? 'DELETE' : 'WAL'
const metrics: Record<string, unknown> = { node: process.version, mode, rows: 2000, syntheticEmbeddingFixture: true }
const indexStarted = performance.now()
const index = await RecallIndex.open(directory)
metrics.openMs = performance.now() - indexStarted
const configuration = new DatabaseSync(join(directory, 'memory', 'recall.sqlite'))
configuration.exec('PRAGMA busy_timeout=3000')
if (String(configuration.prepare('PRAGMA journal_mode').get()?.journal_mode).toUpperCase() !== mode)
  throw new Error('Select the matching source revision with ANGELA_BENCH_SOURCE before benchmarking its journal mode')
metrics.sqliteMode = configuration.prepare('PRAGMA journal_mode').get()
const synchronous = configuration.prepare('PRAGMA synchronous').get()
metrics.synchronous = synchronous
async function samples(run: (n: number) => void | Promise<void>, count = 100) {
  const values: number[] = []
  for (let n = 0; n < count; n++) {
    const started = performance.now()
    await run(n)
    values.push(performance.now() - started)
  }
  values.sort((a, b) => a - b)
  return { p50: values[Math.floor(count * 0.5)], p95: values[Math.floor(count * 0.95)], total: values.reduce((a, b) => a + b, 0) }
}
let recall: import('../src/recall').Recall | undefined
try {
  metrics.sqliteWriteMs = await samples(n => index.replace(`history:${n}`, '1', [{ id: `history:${n}`, kind: 'history', scope: 'workspace', text: `User chose SQLite architecture number ${n}. Project uses incremental indexing.`, updatedAt: '2026-10-22T00:00:00.000Z' }]), 2000)
  let started = performance.now()
  index.search('SQLite architecture', 'workspace')
  metrics.coldRecallMs = performance.now() - started
  metrics.warmRecallMs = await samples(() => {
    index.search('SQLite architecture', 'workspace')
  })
  metrics.pageWriteMs = await samples((n) => {
    index.memory.write({ tier: 'semantic', kind: 'architecture', key: `db-${n}`, scope: directory, title: `Architecture ${n}`, body: `SQLite architecture uses local memory page ${n}`, authority: 'user' })
  }, 100)
  metrics.observationWriteMs = await samples(n => index.memory.observe({ id: `observation-${n}`, type: 'user.message', correlationId: `request-${n}`, sessionId: 'session', scope: directory, channel: 'cli', timestamp: '2026-10-22T00:00:00.000Z', text: `We decided on SQLite architecture number ${n}`, verified: false }), 128)
  const consolidator = new MemoryConsolidator(index.memory)
  started = performance.now()
  consolidator.consolidate(directory, 'session')
  metrics.coldConsolidationMs = performance.now() - started
  metrics.replayedConsolidationMs = await samples(() => {
    consolidator.consolidate(directory, 'session')
  }, 30)
  const vector = Float32Array.from({ length: 64 }, () => 0.125)
  metrics.vectorPersistMs = await samples(n => index.vectors('fixture:64', [{ id: `history:${n}`, version: '1', vector }]), 100)
  started = performance.now()
  index.search('SQLite architecture', 'workspace', 'fixture:64', vector)
  metrics.coldVectorRecallMs = performance.now() - started
  metrics.warmVectorRecallMs = await samples(() => {
    index.search('SQLite architecture', 'workspace', 'fixture:64', vector)
  })

  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads')
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(workerData, { readOnly: true })
    db.exec('PRAGMA busy_timeout=3000')
    const query = db.prepare('SELECT sum(length(text)) FROM excerpts')
    let reads = 0
    let errors = 0
    const timer = setInterval(() => { try { query.get(); reads++ } catch { errors++ } }, 1)
    parentPort.on('message', () => { clearInterval(timer); db.close(); parentPort.postMessage({reads,errors}); parentPort.close() })
    parentPort.postMessage('ready')
  `, { eval: true, workerData: join(directory, 'memory', 'recall.sqlite') })
  await once(worker, 'message')
  try {
    metrics.backgroundContentionWriteMs = await samples((n) => {
      index.memory.write({ tier: 'episodic', kind: 'session', key: `contended-${n}`, scope: directory, title: `Background ${n}`, body: `Concurrent SQLite write ${n}`, authority: 'episode' })
    }, 100)
  }
  finally {
    const stopped = once(worker, 'message')
    worker.postMessage('stop')
    metrics.backgroundReads = (await stopped)[0]
    await worker.terminate()
  }
  metrics.queryPlans = configuration.prepare('EXPLAIN QUERY PLAN SELECT id FROM memory_pages WHERE scope=\'workspace\' AND tier=\'semantic\' AND key=\'database\' AND status<>\'superseded\'').all()
  metrics.agingQueryPlan = configuration.prepare('EXPLAIN QUERY PLAN SELECT id FROM memory_pages WHERE scope=\'workspace\' AND tier=\'episodic\' AND status=\'active\' AND pinned=0 AND updatedAt<\'2020\' ORDER BY updatedAt LIMIT 32').all()
  // Context uses real source validation. File reconciliation prunes the intentionally synthetic history rows after the search measurements.
  recall = new Recall(directory, directory, 'session', cliMessages.en, {}, { apiKey: '' })
  await recall.start()
  const sources = { recall, channel: 'cli' as const, messages: cliMessages.en, warn: () => {} }
  started = performance.now()
  await buildContext(sources, 'SQLite architecture')
  metrics.coldContextBuildMs = performance.now() - started
  metrics.warmContextBuildMs = await samples(async () => {
    await buildContext(sources, 'SQLite architecture')
    recall!.finishRequest()
  }, 30)
  metrics.quality = evaluateMemory(index)

  const server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request)
      body += String(chunk)
    const input = JSON.parse(body) as { input: string[] }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ data: input.input.map((_, index) => ({ index, embedding: Array.from(vector) })) }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing embedding fixture address')
    const client = new Embeddings({ ANGELA_EMBEDDING_MODEL: 'fixture', ANGELA_EMBEDDING_BASE_URL: `http://127.0.0.1:${address.port}/` }, { apiKey: '' }, cliMessages.en)
    started = performance.now()
    for (let n = 0; n < 40; n++)
      await client.encode(Array.from({ length: 8 }, (_, i) => `Fixture document ${n}:${i}`))
    metrics.embeddingFixtureDocumentsPerSecond = 320 / ((performance.now() - started) / 1000)
  }
  finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
  metrics.resourcesBeforeClose = recall.resourceCounts
  await recall.close()
  metrics.resourcesAfterClose = recall.resourceCounts
  const output = `${JSON.stringify(metrics, null, 2)}\n`
  if (process.argv[3])
    await writeFile(process.argv[3], output)
  process.stdout.write(output)
}
finally {
  await recall?.close()
  configuration.close()
  index.close()
  await rm(directory, { recursive: true, force: true })
}
