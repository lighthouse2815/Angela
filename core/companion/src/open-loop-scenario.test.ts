import type { GenerationProvider } from '@angela/provider-inference'

import type { OpenLoop } from './open-loops'
import type { AngelaEvent } from './runtime/events'

import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { RecallIndex } from './recall-index'
import { ReminderNotifications } from './reminder-notifications'
import { AngelaRuntime } from './runtime/runtime'

const resources: { directory: string, runtimes: AngelaRuntime[] }[] = []
afterEach(async () => {
  for (const { directory, runtimes } of resources.splice(0)) {
    await Promise.all(runtimes.map(runtime => runtime.close()))
    await rm(directory, { recursive: true, force: true })
  }
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-implicit-'))
  const runtimes: AngelaRuntime[] = []
  resources.push({ directory, runtimes })
  let now = Date.parse('2026-10-23T10:00:00Z')
  const clock = { now: () => now }
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Cùng xem lỗi nhé.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }))
  const generation = vi.fn<GenerationProvider['generation']>(model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }))
  const events: AngelaEvent[] = []
  const createRuntime = () => {
    const runtime = new AngelaRuntime('unused', { generation }, cliMessages.vi, { ANGELA_TIMEZONE: 'UTC' }, { apiKey: '' }, { clock })
    for (const type of ['open_loop.created', 'open_loop.resolved', 'open_loop.dismissed', 'proactive.prompted', 'proactive.candidate'] as const)
      runtime.events.on(type, event => events.push(event))
    runtimes.push(runtime)
    return runtime
  }
  const options = { dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'cli' as const }
  const presented: { text: string, loop?: OpenLoop }[] = []
  const notifications = (runtime: AngelaRuntime) => new ReminderNotifications(cliMessages.vi.tasks, 'vi', async (text, tasks, _signal, loop) => {
    presented.push({ text, loop })
    if (loop)
      await runtime.mentionOpenLoop(options, loop)
    else
      await runtime.mentionCommitments(options, tasks)
  })
  return { directory, options, generation, createRuntime, presented, events, notifications, advance: (hours: number) => {
    now += hours * 3_600_000
  } }
}
it.each(['Xong rồi.', 'Đừng hỏi vụ này nữa.'])('recovers a real implicit follow-up without a model, survives three restarts, and handles %s', async (outcome) => {
  const { directory, options, generation, createRuntime, notifications, presented, advance, events } = await setup()
  let runtime = createRuntime()
  let scope = runtime.open(options)
  await scope.send(await runtime.createChat(directory), 'Tao đang bí phần refresh token.', {})
  const loop = (await runtime.openLoops(directory).list())[0]!
  expect(loop).toMatchObject({ subject: 'refresh token', kind: 'problem', state: 'open' })
  expect(await (await scope.tasks()).list()).toHaveLength(0)
  let scheduler = await runtime.reminders(directory, notifications(runtime), (error) => {
    throw error
  })
  await scheduler.refresh()
  expect(presented).toHaveLength(0)
  advance(3.99)
  await scheduler.refresh()
  expect(presented).toHaveLength(0)
  await runtime.close()
  generation.mockImplementation(() => {
    throw new Error('Model offline')
  })
  advance(0.01)
  runtime = createRuntime()
  scope = runtime.open(options)
  scheduler = await runtime.reminders(directory, notifications(runtime), (error) => {
    throw error
  })
  await scheduler.refresh()
  expect(presented).toHaveLength(1)
  expect(presented[0]?.text).toBe('Vụ refresh token lúc trước xử lý tới đâu rồi?')
  expect(presented[0]?.loop?.id).toBe(loop.id)
  expect(events.find(event => event.type === 'proactive.candidate')).toMatchObject({ reason: 'implicit_open_loop', candidateId: `open_loop:${loop.id}` })
  expect(JSON.stringify(events)).not.toContain('refresh token')
  for (let restart = 0; restart < 3; restart++) {
    await runtime.close()
    runtime = createRuntime()
    scope = runtime.open(options)
    scheduler = await runtime.reminders(directory, notifications(runtime), (error) => {
      throw error
    })
    await scheduler.refresh()
    expect(presented).toHaveLength(1)
  }
  const unrelated = runtime.open({ ...options, sessionId: randomUUID() })
  await unrelated.send(await runtime.createChat(directory), 'Xong rồi.', {})
  expect((await runtime.openLoops(directory).list())[0]?.state).toBe('open')
  await scope.send(await runtime.createChat(directory), outcome, {})
  expect((await runtime.openLoops(directory).list())[0]?.state).toBe(outcome.startsWith('Xong') ? 'resolved' : 'dismissed')
  advance(24)
  await scheduler.refresh()
  expect(presented).toHaveLength(1)
  expect(generation).toHaveBeenCalledTimes(1)
}, 15_000)
it('lets an explicit task supersede the implicit path and deliver exactly once', async () => {
  const { directory, options, createRuntime, notifications, presented, advance } = await setup()
  const runtime = createRuntime()
  const scope = runtime.open(options)
  const chat = await runtime.createChat(directory)
  await scope.send(chat, 'Auth vẫn lỗi.', {})
  await scope.send(chat, 'Mai 9h nhắc tao fix auth.', {})
  const task = (await (await scope.tasks()).list())[0]!
  expect((await runtime.openLoops(directory).list())[0]).toMatchObject({ state: 'dismissed', supersededByTaskId: task.id })
  advance(4)
  const scheduler = await runtime.reminders(directory, notifications(runtime), (error) => {
    throw error
  })
  expect(presented).toHaveLength(0)
  advance(19)
  await scheduler.refresh()
  expect(presented).toHaveLength(1)
  expect(presented[0]?.loop).toBeUndefined()
  expect(presented[0]?.text).toContain(task.id)
})
it('keeps protected requests out of loops, commitment memory, and candidates', async () => {
  const { directory, options, createRuntime, notifications, presented, advance, events } = await setup()
  const runtime = createRuntime()
  const scope = runtime.open(options)
  await scope.send(await runtime.createChat(directory), 'Tao đang bí auth. Đừng lưu chuyện này.', {})
  expect(await runtime.openLoops(directory).list()).toEqual([])
  expect(await (await scope.tasks()).list()).toEqual([])
  const index = await RecallIndex.open(directory)
  try {
    expect(index.memory.stats()).toEqual({ pages: 0, observations: 0 })
  }
  finally { index.close() }
  advance(5)
  await runtime.reminders(directory, notifications(runtime), (error) => {
    throw error
  })
  expect(presented).toHaveLength(0)
  expect(events).toHaveLength(0)
})
it('fails closed when memory is disabled after extraction, while explicit reminders still deliver', async () => {
  const { directory, options, createRuntime, notifications, presented, advance } = await setup()
  const runtime = createRuntime()
  const scope = runtime.open(options)
  await scope.send(await runtime.createChat(directory), 'Auth vẫn lỗi.', {})
  await (await scope.memory()).setAutomatic(false)
  const task = await (await scope.tasks()).create({ title: 'LINQ', type: 'reminder', dueAt: '2026-10-23T14:00:00Z' })
  advance(4)
  await runtime.reminders(directory, notifications(runtime), (error) => {
    throw error
  })
  expect(presented).toHaveLength(1)
  expect(presented[0]?.text).toContain(task.id)
  expect((await runtime.openLoops(directory).list())[0]?.promptCount).toBe(0)
})
it('isolates corrupted loop storage from task writes and delivery', async () => {
  const { directory, options, createRuntime, notifications, presented, advance } = await setup()
  const runtime = createRuntime()
  const scope = runtime.open(options)
  await mkdir(join(directory, 'open-loops'), { recursive: true })
  await writeFile(join(directory, 'open-loops', 'state.json'), 'corrupted')
  await scope.send(await runtime.createChat(directory), 'Mai 9h nhắc tôi học LINQ.', {})
  const task = (await (await scope.tasks()).list())[0]!
  advance(23)
  const errors: unknown[] = []
  await runtime.reminders(directory, notifications(runtime), error => errors.push(error))
  expect(presented).toHaveLength(1)
  expect(presented[0]?.text).toContain(task.id)
  expect(errors.length).toBeGreaterThan(0)
})

it('expires implicit focus before the eighth subsequent request, using the same turn boundary as tasks', async () => {
  const { directory, options, createRuntime } = await setup()
  const runtime = createRuntime()
  const scope = runtime.open(options)
  const chat = await runtime.createChat(directory)
  await scope.send(chat, 'Auth vẫn lỗi.', {})
  for (let index = 0; index < 7; index++)
    await scope.send(chat, `Trao đổi Java phần ${index}.`, {})
  await scope.send(chat, 'Xong rồi.', {})
  expect((await runtime.openLoops(directory).list())[0]?.state).toBe('open')
})

it('resolves a notification focus across workspaces in the same user store without sharing another session focus', async () => {
  const { directory, options, createRuntime } = await setup()
  const runtime = createRuntime()
  const original = runtime.open(options)
  await original.send(await runtime.createChat(directory), 'Auth vẫn lỗi.', {})
  const loop = (await runtime.openLoops(directory).list())[0]!
  const destination = { ...options, workspace: 'other-workspace', sessionId: randomUUID(), channel: 'telegram' as const }
  await runtime.mentionOpenLoop(destination, loop)
  const receiving = runtime.open(destination)
  await receiving.send(await runtime.createChat(directory), 'Xong rồi.', {})
  expect((await runtime.openLoops(directory).list())[0]?.state).toBe('resolved')
})

it('clarifies inactive latest task focus instead of snoozing older pending work', async () => {
  const { directory, options, createRuntime, generation } = await setup()
  const runtime = createRuntime()
  const scope = runtime.open(options)
  const tasks = await scope.tasks()
  const older = await tasks.create({ title: 'Task B', type: 'todo' })
  const latest = await tasks.create({ title: 'Task A', type: 'todo' })
  await scope.mentionCommitments([older])
  await scope.mentionCommitments([latest])
  await tasks.complete(latest.id)
  generation.mockImplementation(() => {
    throw new Error('Clarification needs no model')
  })
  await scope.send(await runtime.createChat(directory), 'Nhắc lại 2 tiếng nữa.', {})
  expect(await tasks.find(older.id)).toMatchObject({ status: 'pending', snoozeCount: 0 })
  expect((await tasks.find(older.id)).snoozedUntil).toBeUndefined()
  expect(generation).not.toHaveBeenCalled()
})

it.each([
  ['cli', false],
  ['telegram', false],
  ['cli', true],
  ['telegram', true],
] as const)('uses workspace provenance for a %s task in shared user storage (same workspace: %s)', async (channel, sameWorkspace) => {
  const { directory, options, createRuntime } = await setup()
  const workspaceA = join(directory, 'workspace-a')
  const workspaceB = join(directory, 'workspace-b')
  await mkdir(workspaceA)
  await mkdir(workspaceB)
  const runtime = createRuntime()
  const first = runtime.open({ ...options, workspace: workspaceA })
  const second = runtime.open({ ...options, workspace: sameWorkspace ? workspaceA : workspaceB, sessionId: randomUUID(), channel })
  await first.send(await runtime.createChat(workspaceA), 'Auth vẫn lỗi.', {})
  await second.send(await runtime.createChat(sameWorkspace ? workspaceA : workspaceB), 'Mai 9h nhắc tao fix auth.', {})
  const loop = (await runtime.openLoops(directory).list())[0]!
  const task = (await (await second.tasks()).list())[0]!
  expect(task.memoryProjection?.scope).toBe(sameWorkspace ? workspaceA : workspaceB)
  expect(loop.state).toBe(sameWorkspace ? 'dismissed' : 'open')
  expect(loop.supersededByTaskId).toBe(sameWorkspace ? task.id : undefined)
})

it('does not let another workspace task prevent later loop extraction', async () => {
  const { directory, options, createRuntime } = await setup()
  const workspaceA = join(directory, 'workspace-a')
  const workspaceB = join(directory, 'workspace-b')
  await mkdir(workspaceA)
  await mkdir(workspaceB)
  const runtime = createRuntime()
  const second = runtime.open({ ...options, workspace: workspaceB })
  await second.send(await runtime.createChat(workspaceB), 'Mai 9h nhắc tao fix auth.', {})
  const first = runtime.open({ ...options, workspace: workspaceA })
  await first.send(await runtime.createChat(workspaceA), 'Auth vẫn lỗi.', {})
  expect(await runtime.openLoops(directory).list()).toMatchObject([{ workspace: workspaceA, key: 'auth', state: 'open' }])
})

it.each(['Quên vụ auth đi.', 'Đừng nhớ chuyện auth nữa.', 'Đừng hỏi tôi về auth nữa.'])('dismisses a named loop offline and prevents future delivery: %s', async (text) => {
  const { directory, options, generation, createRuntime, notifications, presented, advance } = await setup()
  const runtime = createRuntime()
  const scope = runtime.open(options)
  const chat = await runtime.createChat(directory)
  await scope.send(chat, 'Auth vẫn lỗi.', {})
  await (await scope.memory()).remember('Tôi đang học auth.')
  generation.mockImplementation(() => {
    throw new Error('Offline dismissal uses no model')
  })
  await scope.send(chat, text, {})
  expect((await runtime.openLoops(directory).list())[0]?.state).toBe('dismissed')
  expect((await (await scope.memory()).read()).entries).toHaveLength(text.startsWith('Đừng hỏi') ? 1 : 0)
  advance(5)
  await runtime.reminders(directory, notifications(runtime), (error) => {
    throw error
  })
  expect(presented).toHaveLength(0)
  expect(generation).toHaveBeenCalledTimes(1)
})

it('honors explicit opt-out while automatic memory is off and stays dismissed after it is re-enabled', async () => {
  const { directory, options, generation, createRuntime, notifications, presented, advance } = await setup()
  const runtime = createRuntime()
  const scope = runtime.open(options)
  const chat = await runtime.createChat(directory)
  await scope.send(chat, 'Auth vẫn lỗi.', {})
  const memory = await scope.memory()
  await memory.setAutomatic(false)
  generation.mockImplementation(() => {
    throw new Error('Opt-out uses no model')
  })
  await scope.send(chat, 'Quên vụ auth đi.', {})
  expect((await runtime.openLoops(directory).list())[0]?.state).toBe('dismissed')
  await memory.setAutomatic(true)
  advance(5)
  await runtime.reminders(directory, notifications(runtime), (error) => {
    throw error
  })
  expect(presented).toHaveLength(0)
})
