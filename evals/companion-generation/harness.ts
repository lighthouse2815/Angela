import type { Conversation } from '@angela/core-agent'
import type { GenerationProvider } from '@angela/provider-inference'

import type { Input } from './schema'

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Memory } from '@angela/companion/memory'
import { ProjectMemory } from '@angela/companion/project-memory'
import { RecallIndex } from '@angela/companion/recall-index'
import { AngelaRuntime } from '@angela/companion/runtime/runtime'
import { buildTools } from '@angela/companion/runtime/tool-registry'
import { Sessions } from '@angela/companion/sessions'
import { Skills } from '@angela/companion/skills'
import { Tasks } from '@angela/companion/tasks'
import { chatMessagesToTurns } from '@angela/core-agent'
import { cliMessages } from '@angela/i18n/cli'

import * as v from 'valibot'

/** A recorded request contains the actual protocol body, including injected context and tool definitions. Headers are excluded. */
export const observationSchema = v.object({
  rawAnswer: v.string(),
  requests: v.array(v.unknown()),
  httpStatuses: v.array(v.number()),
  streamEvents: v.array(v.unknown()),
  events: v.array(v.unknown()),
  warnings: v.array(v.string()),
  recalledRefs: v.array(v.string()),
  contextRefs: v.array(v.string()),
  usedRefs: v.array(v.string()),
  sources: v.array(v.object({ ref: v.string(), id: v.string(), text: v.string() })),
  fixtureTools: v.array(v.unknown()),
  durableText: v.string(),
  infrastructureError: v.optional(v.string()),
  prepared: v.boolean(),
})

export type Observation = v.InferOutput<typeof observationSchema>

/** External provider boundary for a single run. No configured credential enters the observation. */
export interface Target {
  model: string
  provider: GenerationProvider
}

function uuid(value: string) {
  const hex = createHash('sha256').update(value).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

class PreparationComplete extends Error {}

/**
 * Creates disposable production stores and generates with the supplied provider. Expected labels cannot enter this boundary.
 *
 * Call stack:
 * observe -> AngelaRuntime.open -> RuntimeSession.send -> buildContext / buildTools
 *   -> Chat.send -> Context.prepare -> core-agent -> provider.fetch
 */
export async function observe(input: Input, target?: Target, timeoutMs = 45_000): Promise<Observation> {
  const directory = await mkdtemp(join(tmpdir(), 'angela-generation-'))
  const workspace = join(directory, 'workspace')
  const dataDir = join(directory, 'user')
  const sessionId = uuid('current-session')
  const observation: Observation = { rawAnswer: '', requests: [], httpStatuses: [], streamEvents: [], events: [], warnings: [], recalledRefs: [], contextRefs: [], usedRefs: [], sources: [], fixtureTools: [], durableText: '', prepared: false }
  let preparationStopped = false
  const aliases = new Map<string, string>([[directory, '<case-dir>']])
  const stabilize = (text: string) => {
    for (const [id, alias] of aliases)
      text = text.replaceAll(id, alias)
    return text
  }
  const refsIn = (text: string) => observation.sources.filter(source => text.includes(source.id) || (source.id.startsWith('personal:') && text.includes(source.id.slice(9)))).map(source => source.ref)
  const boundary: GenerationProvider = {
    generation(model) {
      const request = target?.provider.generation(model) ?? { protocol: 'chat-completions' as const, config: { model, baseURL: 'https://prepare.invalid/v1/' } }
      return { ...request, config: { ...request.config, fetch: async (url: URL, init?: RequestInit) => {
        if (typeof init?.body !== 'string')
          throw new Error('Provider request body is not serializable')
        const body: unknown = JSON.parse(init.body)
        observation.requests.push(body)
        if (observation.requests.length === 1)
          observation.contextRefs = refsIn(JSON.stringify(body))
        if (!target) {
          preparationStopped = true
          throw new PreparationComplete()
        }
        if (observation.requests.length > 12)
          throw new Error('Generation request limit exceeded')
        const response = await (request.config.fetch ?? fetch)(url, init)
        observation.httpStatuses.push(response.status)
        return response
      } } }
    },
  }
  const runtime = new AngelaRuntime(target?.model ?? 'prepare-only', boundary, cliMessages.vi)
  try {
    await mkdir(workspace, { recursive: true })
    await mkdir(dataDir, { recursive: true })
    for (const source of input.sources) {
      const owner = source.owner === 'other' ? join(directory, 'other-user') : dataDir
      const scope = source.workspace === 'other' ? join(directory, 'other-workspace') : workspace
      await mkdir(scope, { recursive: true })
      let id: string
      if (source.storage === 'personal') {
        id = `personal:${await new Memory(owner, cliMessages.vi).remember(source.text, undefined, undefined, { core: source.core, source: { quote: source.text } })}`
        // Personal profile context renders the unprefixed entry identity.
        aliases.set(id.slice(9), `fixture:${source.ref}`)
      }
      else if (source.storage === 'page') {
        const index = await RecallIndex.open(owner)
        try {
          const page = index.memory.write({ tier: source.tier, kind: 'fixture', scope, key: source.key ?? source.ref, title: source.text.slice(0, 120), body: source.text, authority: source.authority, sourceSessionId: uuid(source.ref) }, source.at)
          id = `memory:${page.id}`
        }
        finally { index.close() }
      }
      else {
        const archive = uuid(source.ref)
        await mkdir(owner, { recursive: true })
        await writeFile(join(owner, `${archive}.json`), JSON.stringify({ version: 1, id: archive, workspace: scope, createdAt: source.at, updatedAt: source.at, interrupted: false, messages: [{ role: source.role, content: source.text }] }))
        id = `history:${archive}`
      }
      aliases.set(id, `source:${source.ref}`)
      observation.sources.push({ ref: source.ref, id, text: source.text })
    }
    const memory = new Memory(dataDir, cliMessages.vi)
    if (!input.memoryEnabled)
      await memory.setEnabled(false)
    if (input.invalidMemory) {
      await mkdir(join(dataDir, 'memory'), { recursive: true })
      await writeFile(join(dataDir, 'memory', 'personal.json'), '{invalid')
    }

    const conversation: Conversation = { turns: chatMessagesToTurns(input.history.map(message => ({ role: message.role, content: message.text }))) }
    if (input.taskEvidence) {
      const tasks = new Tasks(dataDir, cliMessages.vi.tasks)
      const registry = await buildTools({ tasks, channel: 'cli', messages: cliMessages.vi, warn: warning => observation.warnings.push(warning) }, input.query, sessionId)
      const toolName = input.taskEvidence === 'rejected' ? 'task_complete' : 'task_create'
      const args = input.taskEvidence === 'rejected'
        ? { id: uuid('missing-task') }
        : { title: 'Ôn từ vựng', type: 'reminder', ...(input.taskEvidence === 'date-only' ? { dueDate: '2099-10-23' } : { dueAt: input.taskEvidence === 'delivered' ? '2026-01-01T08:00:00.000Z' : '2099-10-23T08:00:00.000Z' }) }
      const callId = 'fixture-tool-call'
      const invocation = { id: callId, callId, name: toolName, arguments: JSON.stringify(args), execution: { status: 'pending' as const } }
      let execution: typeof invocation.execution | { status: 'succeeded', output: { type: 'text', text: string }[] } = invocation.execution
      if (input.taskEvidence !== 'pending') {
        let result: unknown = await registry.tools.find(tool => tool.function.name === toolName)!.execute!(args, { messages: [], toolCallId: callId })
        if (input.taskEvidence === 'delivered' || input.taskEvidence === 'completed' || input.taskEvidence === 'cancelled') {
          const task = (await tasks.list())[0]!
          if (input.taskEvidence === 'delivered') {
            const claim = await tasks.claim(task.id, task.dueAt!)
            if (claim?.delivery?.status !== 'claimed' || !await tasks.delivered(task.id, claim.delivery.token))
              throw new Error('Delivery fixture acknowledgment failed')
          }
          else if (input.taskEvidence === 'completed') {
            await tasks.complete(task.id)
          }
          else {
            await tasks.cancel(task.id)
          }
          result = await registry.tools.find(tool => tool.function.name === 'task_list')!.execute!({ status: 'all' }, { messages: [], toolCallId: callId })
          invocation.name = 'task_list'
          invocation.arguments = JSON.stringify({ status: 'all' })
        }
        registry.observe({ type: 'tool-call', toolCallId: callId, toolCallType: 'function', toolName: invocation.name, args: invocation.arguments })
        const event = { type: 'tool-result' as const, toolCallId: callId, result: JSON.stringify(result) }
        observation.fixtureTools.push({ name: invocation.name, arguments: invocation.arguments, result, observation: registry.observe(event) })
        execution = { status: 'succeeded', output: [{ type: 'text', text: JSON.stringify(result) }] }
      }
      conversation.turns.push({ type: 'user', id: randomUUID(), content: [{ type: 'text', text: 'Kiểm tra trạng thái việc Ôn từ vựng trong công cụ.' }] }, { type: 'assistant', id: randomUUID(), status: 'completed', rounds: [{ id: randomUUID(), content: [{ type: 'tool', invocationId: callId }], toolInvocations: [{ ...invocation, execution }], projectionIssues: [] }] })
      registry.close()
    }
    for (const type of ['tool.result', 'tool.error', 'task.created', 'task.completed', 'task.updated', 'memory.changed', 'request.failed', 'request.completed'] as const)
      runtime.events.on(type, event => observation.events.push(event))
    const session = runtime.open({ dataDir, workspace, sessionId, channel: input.channel, warn: warning => observation.warnings.push(warning) })
    if (input.channel !== 'discord') {
      const recall = await session.recall()
      const hits = await recall?.search(input.query, false, undefined, false)
      observation.recalledRefs = refsIn(JSON.stringify(hits))
    }
    const chat = await runtime.createChat(workspace, conversation)
    await session.send(chat, input.query, {
      abortSignal: AbortSignal.timeout(timeoutMs),
      temperature: 0,
      diagnostics: { error: () => {}, warn: () => {} },
      onStreamEvent(event) {
        if (event.type !== 'reasoning-delta')
          observation.streamEvents.push(event)
        if (event.type === 'text-delta')
          observation.rawAnswer += event.text
        if (observation.rawAnswer.length > 24_000)
          throw new Error('Generation output limit exceeded')
      },
    })
  }
  catch (error) {
    if (preparationStopped)
      observation.prepared = true
    else
      observation.infrastructureError = error instanceof Error ? error.name : 'UnknownError'
  }
  finally {
    await runtime.close()
    try {
      const index = await RecallIndex.open(dataDir)
      try {
        const pages = index.origins().filter(id => id.startsWith('memory:')).map(id => index.read(id)?.text)
        const archives = new Sessions(dataDir, cliMessages.vi)
        const sessions = await Promise.all((await archives.list()).map(record => archives.read(record.id)))
        observation.durableText = JSON.stringify({
          personal: input.invalidMemory ? 'invalid' : await memorySnapshot(dataDir),
          pages,
          observations: index.memory.observations(workspace, sessionId),
          project: await (await ProjectMemory.open(dataDir, workspace, cliMessages.vi)).read(),
          skills: await new Skills(dataDir, cliMessages.vi).list(),
          tasks: await new Tasks(dataDir, cliMessages.vi.tasks).list(),
          sessions,
        })
      }
      finally { index.close() }
    }
    finally { await rm(directory, { recursive: true, force: true }) }
  }
  observation.usedRefs = refsIn(JSON.stringify([observation.requests, observation.streamEvents]))
  // Source aliases retain exact text while removing temporary filesystem paths and random page identities.
  return v.parse(observationSchema, JSON.parse(stabilize(JSON.stringify(observation))))
}

async function memorySnapshot(directory: string) {
  return await new Memory(directory, cliMessages.vi).read()
}
