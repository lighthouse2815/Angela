import type { GenerationProvider } from '@angela/provider-inference'

import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Chat } from '../chat'
import { RecallIndex } from '../recall-index'
import { Sessions } from '../sessions'
import { AngelaRuntime } from './runtime'
import { buildTools } from './tool-registry'

const resources: { runtime: AngelaRuntime, directory: string }[] = []
afterEach(async () => {
  for (const { runtime, directory } of resources.splice(0)) {
    await runtime.close()
    await rm(directory, { recursive: true, force: true })
  }
})

async function setup(tool?: { name: string, arguments: object }, toolAtRequest = 1) {
  const directory = await mkdtemp(join(tmpdir(), 'angela-privacy-'))
  const requests: string[] = []
  const results: unknown[] = []
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: {
    model,
    baseURL: 'https://fixture.invalid/v1/',
    fetch: async (_url: URL, init?: RequestInit) => {
      requests.push(String(init?.body))
      const choice = tool && requests.length === toolAtRequest
        ? { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'privacy-call', type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } }] }, finish_reason: 'tool_calls' }
        : { delta: { role: 'assistant', content: String(init?.body).includes('Summarize historical conversation data') ? 'Historical user fact: tôi đang học tiếng Ý.' : 'I will help within this session.' }, finish_reason: 'stop' }
      return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, ...choice }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    },
  } }) }
  const runtime = new AngelaRuntime('fixture', provider, cliMessages.en)
  resources.push({ runtime, directory })
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'cli' })
  const chat = new Chat(runtime.model, provider, directory)
  const options = { onStreamEvent: (event: { type: string, result?: unknown }) => {
    if (event.type === 'tool-result')
      results.push(typeof event.result === 'string' ? JSON.parse(event.result) : event.result)
  } }
  return { runtime, directory, scope, chat, options, requests, results }
}

const personal = { name: 'personal_memory', arguments: { action: 'remember', id: null, text: 'fixture-only-password', source_quote: 'fixture-only-password', core: false } }
const page = { name: 'memory_page_save', arguments: { tier: 'semantic', kind: 'architecture', key: 'protected', title: 'Protected', body: 'fixture-only-password', source_quote: 'fixture-only-password', expected_version: null } }
const project = { name: 'project_memory', arguments: { expected_revision: 0, snapshot: { goal: 'User credential is fixture-only-password', status: 'active', decisions: [], completed: [], blockers: [], nextStep: '' }, source_quote: 'fixture-only-password' } }
const skill = { name: 'skill_save', arguments: { name: 'protected', description: 'Protected workflow', instructions: 'Use fixture-only-password', verification_quote: 'fixture-only-password', expected_version: null } }
const task = { name: 'task_create', arguments: { title: 'User credential is fixture-only-password', type: 'todo' } }

// Proven failures: evals/companion-generation/{baseline,after}.json, dont_store_001 and credential_no_store_001.
// ROOT CAUSE: Model-selected excerpts lost request privacy. Tools now reject using host-owned request provenance before storage.
it.each([personal, page, project, skill, task])('rejects credential provenance through $name even when arguments hide the declaration', async (tool) => {
  const { runtime, directory, scope, chat, options, results } = await setup(tool)
  const changed: string[] = []
  for (const type of ['memory.changed', 'project.changed', 'task.created'] as const)
    runtime.events.on(type, event => changed.push(event.type))
  const text = 'Mật khẩu test của tôi là fixture-only-password.'
  await scope.send(chat, text, options)
  expect(results).toContainEqual({ status: 'rejected', reason: 'sensitive-content' })
  expect(JSON.stringify(results)).not.toContain('fixture-only-password')
  expect((await (await scope.memory()).read()).entries).toEqual([])
  expect((await (await scope.project()).read()).snapshot).toBeNull()
  expect(await (await scope.tasks()).list()).toEqual([])
  expect(await (await scope.skills()).list()).toEqual([])
  const index = await RecallIndex.open(directory)
  try {
    expect(index.memory.observations(directory, scope.options.sessionId)).toEqual([])
    expect(index.origins().filter(id => id.startsWith('memory:'))).toEqual([])
    expect(index.search('fixture-only-password', directory)).toEqual([])
  }
  finally { index.close() }
  // Rejected tools cannot produce host-verified memory/project/task change evidence.
  expect(changed).toEqual([])
})

it.each([personal, page, project])('rejects explicit no-store provenance through $name without relying on credential matching', async (tool) => {
  const clean = { name: tool.name, arguments: JSON.parse(JSON.stringify(tool.arguments).replaceAll('fixture-only-password', 'tôi đang học tiếng Ý')) as object }
  const { scope, chat, options, results } = await setup(clean)
  await scope.send(chat, 'Đừng lưu: tôi đang học tiếng Ý.', options)
  expect(results).toContainEqual({ status: 'rejected', reason: 'user-request' })
  expect((await (await scope.memory()).read()).entries).toEqual([])
  expect((await (await scope.project()).read()).snapshot).toBeNull()
})

it('rejects a bare API key without durable capture', async () => {
  const text = 'My API key is sk-fixture-123...'
  const tool = { name: 'personal_memory', arguments: { ...personal.arguments, text: 'sk-fixture-123...', source_quote: 'sk-fixture-123...' } }
  const { scope, chat, options, results } = await setup(tool)
  await scope.send(chat, text, options)
  expect(results).toContainEqual({ status: 'rejected', reason: 'sensitive-content' })
  expect((await (await scope.memory()).read()).entries).toEqual([])
})

it('keeps no-store facts usable on the next turn while excluding archives, summaries, and new-session Recall', async () => {
  const { runtime, directory, scope, chat, options, requests } = await setup()
  const sessions = new Sessions(directory, cliMessages.en)
  const session = await sessions.open(directory, scope.options.sessionId)
  try {
    await (await scope.memory()).remember('My name is Lan')
    await scope.send(chat, 'We chose SQLite for the project.', options)
    await session.saveChat(chat, false)
    const safe = await sessions.read(session.record.id)
    await scope.send(chat, 'Đừng lưu: tôi đang học tiếng Ý.', options)
    await session.saveChat(chat, false)
    await scope.send(chat, 'What language am I studying?', options)
    expect(requests.at(-1)).toContain('tôi đang học tiếng Ý')
    await session.saveChat(chat, false)
    const persisted = await sessions.read(session.record.id)
    expect(persisted.messages).toEqual(safe.messages)
    expect(JSON.stringify(persisted)).not.toContain('tiếng Ý')
    expect(JSON.stringify(chat.conversation)).toContain('tiếng Ý')
    expect((await (await scope.memory()).read()).entries[0]?.text).toBe('My name is Lan')
    await scope.close()
    const next = runtime.open({ dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'cli' })
    const recall = await next.recall()
    expect(JSON.stringify(await recall?.search('tiếng Ý', false, undefined, false))).not.toContain('tiếng Ý')
    expect(JSON.stringify(await recall?.prepare('tiếng Ý'))).not.toContain('tôi đang học tiếng Ý')
    await next.close()
  }
  finally { await session.close() }
})

it('protects recovery metadata before RuntimeSession.send and raw conversation saves', async () => {
  const { directory, chat } = await setup()
  const sessions = new Sessions(directory, cliMessages.en)
  const session = await sessions.open(directory)
  const text = 'Đừng lưu: mật khẩu test là fixture-only-password'
  const now = new Date().toISOString()
  try {
    await session.saveChat(chat, true, { id: randomUUID(), text, progress: text, answer: text, startedAt: now, updatedAt: now, status: 'answered' })
    expect(await readFile(join(directory, `${session.record.id}.json`), 'utf8')).not.toContain('fixture-only-password')
    await session.save({ turns: [{ type: 'user', id: randomUUID(), content: [{ type: 'text', text }] }] }, false)
    expect(JSON.stringify(await sessions.read(session.record.id))).not.toContain('fixture-only-password')
  }
  finally { await session.close() }
})

// Proven failure: evals/companion-generation/baseline.json, memory_disabled_001.
// ROOT CAUSE: Guidance allowed substitute storage. Request provenance now rejects personal goals in independent stores.
it('rejects project fallback for a personal learning goal when memory is disabled', async () => {
  const goal = 'Tôi muốn học .NET'
  const { scope, chat, options, results } = await setup({ name: 'project_memory', arguments: { ...project.arguments, snapshot: { ...project.arguments.snapshot, goal }, source_quote: goal } })
  await (await scope.memory()).setEnabled(false)
  await scope.send(chat, `${goal}. Nhớ giúp tôi.`, options)
  expect(results).toContainEqual({ status: 'rejected', reason: 'memory-disabled' })
  expect((await (await scope.project()).read()).snapshot).toBeNull()
})

it('enforces memory disabled on previously offered personal tools and direct storage', async () => {
  const { scope } = await setup()
  const memory = await scope.memory()
  const text = 'Nhớ giúp tôi là tôi muốn học .NET.'
  const tools = await memory.tools(text)
  await memory.setEnabled(false)
  expect(await tools[0]!.execute?.({ ...personal.arguments, text, source_quote: text }, { messages: [], toolCallId: 'test' })).toEqual({ status: 'rejected', reason: 'memory-disabled' })
  await expect(memory.remember(text)).rejects.toThrow(cliMessages.en.memoryDisabled)
})

it('allows a genuine project checkpoint with personal memory disabled', async () => {
  const goal = 'Project backend dùng .NET.'
  const { scope, chat, options, results } = await setup({ name: 'project_memory', arguments: { ...project.arguments, snapshot: { ...project.arguments.snapshot, goal }, source_quote: goal } })
  await (await scope.memory()).setEnabled(false)
  await scope.send(chat, goal, options)
  expect(results).toContainEqual(expect.objectContaining({ status: 'saved' }))
  expect((await (await scope.project()).read()).snapshot?.goal).toBe(goal)
})

it('allows an explicitly requested task with personal memory disabled', async () => {
  const { scope, chat, options, results } = await setup({ name: 'task_create', arguments: { title: 'Study .NET', type: 'todo' } })
  await (await scope.memory()).setEnabled(false)
  await scope.send(chat, 'Create a task to study .NET.', options)
  expect(results).toContainEqual(expect.objectContaining({ status: 'saved' }))
  expect((await (await scope.tasks()).list())[0]?.title).toBe('Study .NET')
})

it('rejects later paraphrased writes from protected conversation history', async () => {
  const { scope, chat, options, results } = await setup(project, 2)
  await scope.send(chat, 'Đừng lưu: tôi đang học tiếng Ý.', options)
  await scope.send(chat, 'Please save the previous information as a project.', options)
  expect(results).toContainEqual({ status: 'rejected', reason: 'user-request' })
  expect((await (await scope.project()).read()).snapshot).toBeNull()
})

it('rechecks a memory disable between registry construction and project execution', async () => {
  const { scope } = await setup()
  const memory = await scope.memory()
  const projectStore = await scope.project()
  const text = 'Tôi muốn học .NET.'
  const registry = await buildTools({ memory, project: projectStore, channel: 'cli', messages: cliMessages.en, warn: () => {} }, text, scope.options.sessionId)
  try {
    await memory.setEnabled(false)
    const result = await registry.tools.find(tool => tool.function.name === 'project_memory')!.execute!({ ...project.arguments, source_quote: text, snapshot: { ...project.arguments.snapshot, goal: 'Study .NET' } }, { messages: [], toolCallId: 'test' })
    expect(result).toEqual({ status: 'rejected', reason: 'memory-disabled' })
    expect((await projectStore.read()).snapshot).toBeNull()
  }
  finally { registry.close() }
})

it('keeps derived compaction summaries out of durable session checkpoints', async () => {
  const { runtime, scope, directory } = await setup()
  const chat = new Chat(runtime.model, runtime.provider, directory, undefined, true, 16384)
  const sessions = new Sessions(directory, cliMessages.en)
  const session = await sessions.open(directory, scope.options.sessionId)
  try {
    await scope.send(chat, 'Đừng lưu: tôi đang học tiếng Ý.', {})
    for (let index = 0; index < 24; index++) {
      await scope.send(chat, `Continue ${index}: ${'Practice an example. '.repeat(100)}`, {})
      await session.saveChat(chat, false)
    }
    expect(chat.context.status.compactions).toBeGreaterThan(0)
    expect(chat.context.checkpoint(chat.conversation).summary).toContain('tiếng Ý')
    expect(JSON.stringify(await sessions.read(session.record.id))).not.toContain('tiếng Ý')
  }
  finally { await session.close() }
})
