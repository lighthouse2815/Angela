import type { RecallHit } from '../../packages/angela-cli/src/recall-index'
import type { CompanionCase } from './schema'

import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'

import { MemoryCapture } from '../../packages/angela-cli/src/memory-v2/consolidator'
import { Recall } from '../../packages/angela-cli/src/recall'
import { RecallIndex } from '../../packages/angela-cli/src/recall-index'
import { buildContext } from '../../packages/angela-cli/src/runtime/context-builder'

interface Source {
  ids: string[]
  user: string
  scope: string
  superseded: boolean
}

/** Observations retain stable fixture references instead of temporary paths or generated UUIDs. */
export interface Observation {
  recall: { refs: string[], kind: RecallHit['kind'], text: string }[]
  context: string
  contextRefs: string[]
  contextKinds: { refs: string[], kind: RecallHit['kind'] }[]
  supersededRefs: string[]
  warnings: string[]
}

/** Evidence checks are separate from execution so scorer failures cannot silently change fixture setup. */
export interface Result {
  id: string
  category: CompanionCase['category']
  recallHit: boolean | null
  contextHit: boolean | null
  wrongMemory: boolean | null
  supersededError: boolean | null
  falseSharedMemory: boolean | null
  irrelevantInjection: boolean | null
  forbiddenContent: boolean | null
  passed: boolean
  failures: string[]
  observation: Observation
}

/**
 * Matches accents and case without replacing words or inferring semantic equivalence.
 * @example
 * normalize('Đậu Đỏ')
 * // => 'dau do'
 */
function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase()
}

function identity(text: string) {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

function sessionId(text: string) {
  const hex = createHash('sha256').update(text).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/**
 * Owns one disposable case. Users get separate stores, workspaces get exact scopes, and sessions keep stable archive identities.
 * Fixture writes never read expected labels. Every case closes and reopens SQLite before recall.
 */
async function observe(item: CompanionCase): Promise<Observation> {
  const directory = await mkdtemp(join(tmpdir(), 'angela-companion-eval-'))
  const indexes = new Map<string, RecallIndex>()
  const sources = new Map<string, Source>()
  const archives = new Map<string, { path: string, workspace: string, id: string, at: string, messages: { role: 'user' | 'assistant', content: string }[] }>()
  const captureSessions = new Map<string, { index: RecallIndex, scope: string, session: string, refs: string[] }>()
  let recall: Recall | undefined
  const dataDir = (user: string) => join(directory, 'users', identity(user))
  const scope = (workspace: string) => join(directory, 'workspaces', identity(workspace))
  try {
    for (const message of item.history) {
      let index = indexes.get(message.user_id)
      if (!index) {
        index = await RecallIndex.open(dataDir(message.user_id))
        indexes.set(message.user_id, index)
      }
      const workspace = scope(message.workspace)
      await mkdir(workspace, { recursive: true })
      const session = sessionId(message.session_id)
      const source: Source = { ids: [], scope: workspace, user: message.user_id, superseded: false }
      sources.set(message.id, source)
      if (message.storage === 'page') {
        const memory = message.memory!
        const page = index.memory.write({ ...memory, scope: workspace, title: memory.key, body: message.content, authority: 'user', sourceSessionId: session }, message.at)
        source.ids.push(`memory:${page.id}`)
      }
      else if (message.storage === 'history') {
        const key = JSON.stringify([message.user_id, workspace, session])
        let archive = archives.get(key)
        if (!archive) {
          archive = { path: join(dataDir(message.user_id), `${session}.json`), workspace, id: session, at: message.at, messages: [] }
          archives.set(key, archive)
        }
        const position = archive.messages.length
        archive.messages.push({ role: message.role, content: message.content })
        archive.at = message.at
        // Overviews contain several messages. A reference still needs its own indexed message for recall scoring.
        source.ids.push(`history:${session}:${position}:0`)
      }
      else {
        const capture = new MemoryCapture(index.memory, workspace, session)
        capture.record({ id: message.id, type: message.role === 'user' ? 'user.message' : 'assistant.message', sessionId: session, workspace, correlationId: message.id, timestamp: message.at, channel: 'cli' }, message.content)
        capture.finish(message.role === 'user' ? message.content : '')
        const key = JSON.stringify([message.user_id, workspace, session])
        let group = captureSessions.get(key)
        if (!group) {
          group = { index, scope: workspace, session, refs: [] }
          captureSessions.set(key, group)
        }
        group.refs.push(message.id)
      }
    }
    for (const group of captureSessions.values()) {
      const pages = group.index.origins().filter(id => id.startsWith('memory:')).filter((id) => {
        const hit = group.index.read(id)!
        return group.index.memory.read(id.slice(7), group.scope)?.sourceSessionId === group.session && hit.scope === group.scope
      })
      for (const ref of group.refs)
        sources.get(ref)!.ids.push(...pages)
    }
    for (const archive of archives.values()) {
      await writeFile(archive.path, JSON.stringify({ version: 1, id: archive.id, workspace: archive.workspace, createdAt: archive.at, updatedAt: archive.at, interrupted: false, messages: archive.messages }))
    }
    for (const source of sources.values()) {
      const index = indexes.get(source.user)!
      source.superseded = source.ids.some(id => id.startsWith('memory:') && index.memory.read(id.slice(7), source.scope, true)?.status === 'superseded')
    }
    if (item.age_at) {
      for (const index of indexes.values()) {
        for (const workspace of new Set([...sources.values()].map(source => source.scope)))
          index.memory.age(workspace, Date.parse(item.age_at), 128)
      }
    }
    for (const index of indexes.values())
      index.close()
    indexes.clear()

    const workspace = scope(item.target.workspace)
    await mkdir(workspace, { recursive: true })
    recall = new Recall(dataDir(item.target.user_id), workspace, sessionId(item.target.session_id), cliMessages.en, {}, { apiKey: '' })
    await recall.start()
    await recall.changed()
    const hits = await recall.search(item.query)
    const warnings: string[] = []
    const context = await buildContext({ recall, channel: 'cli', messages: cliMessages.en, warn: warning => warnings.push(warning) }, item.query)
    const refsFor = (id: string) => [...sources].filter(([, source]) => source.ids.includes(id)).map(([ref]) => ref)
    const contextRefs = [...sources].filter(([, source]) => source.ids.some(id => context.includes(JSON.stringify(id)))).map(([ref]) => ref)
    const aliases = new Map<string, string>()
    for (const [ref, source] of sources) {
      for (const id of source.ids) {
        if (!aliases.has(id))
          aliases.set(id, `source:${ref}`)
      }
    }
    let stableContext = context.replaceAll(directory, '<case-dir>')
    for (const [id, alias] of aliases)
      stableContext = stableContext.replaceAll(id, alias)
    // Versions hash random page IDs. They carry no scoring evidence and do not belong in a reproducible report.
    stableContext = stableContext.replace(/"version":"[^"]*"/gu, '"version":"<source-version>"').replace(/"updatedAt":"[^"]*"/gu, '"updatedAt":"<source-updated-at>"')
    recall.finishRequest()
    return {
      recall: hits.map(hit => ({ refs: refsFor(hit.id), kind: hit.kind, text: hit.text })),
      context: stableContext,
      contextRefs,
      contextKinds: hits.filter(hit => context.includes(JSON.stringify(hit.id))).map(hit => ({ refs: refsFor(hit.id), kind: hit.kind })),
      supersededRefs: [...sources].filter(([, source]) => source.superseded).map(([ref]) => ref),
      warnings,
    }
  }
  finally {
    await recall?.close()
    for (const index of indexes.values())
      index.close()
    await rm(directory, { recursive: true, force: true })
  }
}

/** Scores source identity and evidence independently. Null means the case does not exercise that metric. */
export function score(item: CompanionCase, observation: Observation): Result {
  const expected = item.expected
  const recalled = observation.recall.flatMap(hit => hit.refs)
  const used = new Set([...recalled, ...observation.contextRefs])
  const context = normalize(observation.context)
  const missing = expected.must_include.filter(text => !context.includes(normalize(text)))
  const forbidden = expected.must_not_include.filter(text => context.includes(normalize(text)))
  const failures: string[] = []
  const recallHit = expected.recall_refs.length ? expected.recall_refs.every(ref => observation.recall.slice(0, 5).some(hit => hit.refs.includes(ref) && hit.kind === expected.memory_type)) : null
  const contextHit = expected.context_refs.length ? expected.context_refs.every(ref => observation.contextKinds.some(hit => hit.refs.includes(ref) && hit.kind === expected.memory_type)) && missing.length === 0 : null
  const wrongMemory = expected.forbidden_refs.length ? expected.forbidden_refs.some(ref => used.has(ref)) : null
  const supersededError = expected.superseded_refs.length ? expected.superseded_refs.some(ref => used.has(ref) || !observation.supersededRefs.includes(ref)) : null
  const falseSharedMemory = item.category === 'no_shared_memory' ? forbidden.length > 0 : null
  const irrelevantInjection = expected.irrelevant_refs.length ? expected.irrelevant_refs.some(ref => observation.contextRefs.includes(ref)) : null
  const forbiddenContent = expected.must_not_include.length ? forbidden.length > 0 : null
  if (recallHit === false)
    failures.push('recall-miss-or-wrong-tier')
  if (contextHit === false)
    failures.push('context-miss')
  if (missing.length)
    failures.push(`missing-content: ${missing.join(' | ')}`)
  if (wrongMemory)
    failures.push('wrong-memory')
  if (supersededError)
    failures.push('superseded-memory')
  if (irrelevantInjection)
    failures.push('irrelevant-injection')
  if (forbidden.length)
    failures.push(`forbidden-content: ${forbidden.join(' | ')}`)
  if (observation.warnings.length)
    failures.push('context-warning')
  return { id: item.id, category: item.category, recallHit, contextHit, wrongMemory, supersededError, falseSharedMemory, irrelevantInjection, forbiddenContent, passed: failures.length === 0, failures, observation }
}

/** Runs one isolated cold-store case through production capture, recall and context APIs without a provider. */
export async function evaluateCase(item: CompanionCase) {
  return score(item, await observe(item))
}

/** Reports explicit denominators. Unevaluated metrics remain null, including a fully empty run. */
export function summarize(results: Result[]) {
  const rate = (values: (boolean | null)[]) => {
    const evaluated = values.filter(value => value !== null)
    const count = evaluated.filter(Boolean).length
    return { count, total: evaluated.length, rate: evaluated.length ? count / evaluated.length : null }
  }
  return {
    cases: results.length,
    categories: new Set(results.map(result => result.category)).size,
    metrics: {
      'Recall hit rate': rate(results.map(result => result.recallHit)),
      'Wrong-memory rate': rate(results.map(result => result.wrongMemory)),
      'Superseded-memory error rate': rate(results.map(result => result.supersededError)),
      'False shared-memory rate': rate(results.map(result => result.falseSharedMemory)),
      'Irrelevant-memory injection rate': rate(results.map(result => result.irrelevantInjection)),
      'Context hit rate': rate(results.map(result => result.contextHit)),
      'Forbidden-content rate': rate(results.map(result => result.forbiddenContent)),
      'Case pass rate': rate(results.map(result => result.passed)),
    },
    byCategory: Object.fromEntries([...new Set(results.map(result => result.category))].map(category => [category, rate(results.filter(result => result.category === category).map(result => result.passed))])),
  }
}
