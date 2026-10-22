import type { GenerationProvider } from '@angela/provider-inference'

import type { Clock } from './clock'
import type { AngelaEvent } from './runtime/events'

import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chatMessagesToTurns } from '@angela/core-agent'
import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it, vi } from 'vitest'

import { proactiveCandidate } from './proactive-candidate'
import { RecallIndex } from './recall-index'
import { ReminderNotifications } from './reminder-notifications'
import { AngelaRuntime } from './runtime/runtime'
import { Sessions } from './sessions'

class FakeClock implements Clock {
  constructor(private instant: number) {}
  now() { return this.instant }
  set(value: string) { this.instant = Date.parse(value) }
}

const resources: { directory: string, runtimes: AngelaRuntime[] }[] = []
afterEach(async () => {
  for (const { directory, runtimes } of resources.splice(0)) {
    await Promise.all(runtimes.map(runtime => runtime.close()))
    await rm(directory, { recursive: true, force: true })
  }
})

it('keeps an explicit commitment durable when recall is unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-recall-failure-'))
  const clock = new FakeClock(Date.parse('2026-10-22T08:00:00+07:00'))
  const provider: GenerationProvider = { generation: () => {
    throw new Error('Local task creation requires no provider')
  } }
  const runtime = new AngelaRuntime('unused', provider, cliMessages.vi, { ANGELA_TIMEZONE: 'Asia/Ho_Chi_Minh' }, { apiKey: '' }, { clock })
  resources.push({ directory, runtimes: [runtime] })
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'cli' })
  vi.spyOn(scope, 'recall').mockResolvedValue(undefined)
  await scope.send(await runtime.createChat(directory), 'Mai 9h nhắc tao học LINQ.', {})
  expect(await (await scope.tasks()).list()).toMatchObject([{ title: 'học LINQ', status: 'pending', dueAt: '2026-10-23T02:00:00.000Z' }])
})

it('runs reminder recovery, unrelated conversation, contextual snooze and completion, and current memory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-scenario-'))
  const runtimes: AngelaRuntime[] = []
  resources.push({ directory, runtimes })
  const clock = new FakeClock(Date.parse('2026-10-22T08:00:00+07:00'))
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: 'Java dùng JVM. C# dùng .NET.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }))
  const provider: GenerationProvider = { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://provider.example/v1/', fetch } }) }
  const createRuntime = () => {
    const runtime = new AngelaRuntime('unused', provider, cliMessages.vi, { ANGELA_TIMEZONE: 'Asia/Ho_Chi_Minh' }, { apiKey: '' }, { clock })
    runtimes.push(runtime)
    return runtime
  }
  const sessions = new Sessions(directory, cliMessages.vi)
  const firstSession = await sessions.open(directory)
  const first = createRuntime()
  const chat = await first.createChat(directory)
  const firstScope = first.open({ dataDir: directory, workspace: directory, sessionId: firstSession.record.id, channel: 'cli' })
  await firstScope.send(chat, 'Mai 9h nhắc tao học LINQ.', {})
  const created = (await (await firstScope.tasks()).list())[0]!
  expect(created.title).toBe('học LINQ')
  expect(created.dueAt).toBe('2026-10-23T02:00:00.000Z')
  expect(fetch).not.toHaveBeenCalled()
  await firstSession.saveChat(chat, false)
  await firstSession.close()
  await first.close()

  const resumed = await sessions.open(directory, firstSession.record.id)
  const runtime = createRuntime()
  const restoredChat = await runtime.createChat(directory, resumed.restore())
  const scope = runtime.open({ dataDir: directory, workspace: directory, sessionId: resumed.record.id, channel: 'cli' })
  const tasks = await scope.tasks()
  expect((await tasks.find(created.id)).dueAt).toBe(created.dueAt)
  const presented: string[] = []
  const notifications = new ReminderNotifications(cliMessages.vi.tasks, 'vi', async (text, announced) => {
    presented.push(text)
    await scope.mentionCommitments(announced)
    restoredChat.conversation.turns.push(...chatMessagesToTurns([{ role: 'assistant', content: text }]))
  })
  clock.set('2026-10-23T08:59:00+07:00')
  const scheduler = await runtime.reminders(directory, notifications, (error) => {
    throw error
  })
  await scheduler.refresh()
  expect(presented).toHaveLength(0)
  clock.set('2026-10-23T09:00:00+07:00')
  await scheduler.refresh()
  await scheduler.refresh()
  expect(presented).toHaveLength(1)
  expect(presented[0]).toContain(created.id)

  await scope.send(restoredChat, 'Java khác C# gì?', {})
  expect(fetch).toHaveBeenCalledTimes(1)
  await scope.send(restoredChat, '2 tiếng nữa nhắc lại.', {})
  await scheduler.refresh()
  expect((await tasks.find(created.id)).snoozedUntil).toBe('2026-10-23T04:00:00.000Z')
  expect((await tasks.find(created.id)).snoozeCount).toBe(1)
  clock.set('2026-10-23T10:59:00+07:00')
  await scheduler.refresh()
  expect(presented).toHaveLength(1)
  clock.set('2026-10-23T11:00:00+07:00')
  await scheduler.refresh()
  expect(presented).toHaveLength(2)
  await scope.send(restoredChat, 'Cho tao hỏi về C# trước.', {})
  await scope.send(restoredChat, 'Xong rồi.', {})
  expect(fetch).toHaveBeenCalledTimes(2)
  await scheduler.refresh()
  expect((await tasks.find(created.id)).status).toBe('completed')
  const index = await RecallIndex.open(directory)
  try {
    const page = index.memory.current(directory, 'episodic', `commitment:${created.id}`)
    expect(JSON.parse(page!.body)).toMatchObject({ id: created.id, title: 'học LINQ', status: 'completed' })
    expect(index.memory.observations(directory, resumed.record.id).some(event => event.type === 'task.completed' && event.verified)).toBe(true)
  }
  finally {
    index.close()
  }
  clock.set('2026-10-23T12:00:00+07:00')
  await scheduler.refresh()
  expect(presented).toHaveLength(2)
  await resumed.saveChat(restoredChat, false)
  await resumed.close()
  await runtime.close()
  const third = createRuntime()
  const recovered = await third.reminders(directory, notifications, (error) => {
    throw error
  })
  await recovered.refresh()
  expect(presented).toHaveLength(2)
}, 15_000)

it.each(['09:00', '10:30'])('recovers an explicit proactive follow-up at %s once, survives three restarts, and resolves from its own session', async (recoveryTime) => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-follow-up-scenario-'))
  const runtimes: AngelaRuntime[] = []
  resources.push({ directory, runtimes })
  const clock = new FakeClock(Date.parse('2026-10-22T08:00:00+07:00'))
  const provider: GenerationProvider = { generation: () => {
    throw new Error('Follow-up delivery requires no provider')
  } }
  const events: AngelaEvent[] = []
  const createRuntime = () => {
    const runtime = new AngelaRuntime('unused', provider, cliMessages.vi, { ANGELA_TIMEZONE: 'Asia/Ho_Chi_Minh' }, { apiKey: '' }, { clock })
    runtime.events.on('proactive.prompted', event => events.push(event))
    runtime.events.on('reminder.delivered', event => events.push(event))
    runtimes.push(runtime)
    return runtime
  }
  const options = { dataDir: directory, workspace: directory, sessionId: randomUUID(), channel: 'cli' as const }
  let runtime = createRuntime()
  let scope = runtime.open(options)
  await scope.send(await runtime.createChat(directory), 'Mai hỏi tao xem phần refresh token làm xong chưa.', {})
  const task = (await (await scope.tasks()).list())[0]!
  expect(task).toMatchObject({ type: 'follow_up', title: 'phần refresh token', dueAt: '2026-10-23T02:00:00.000Z', followUp: { promptCount: 0 } })
  const candidate = proactiveCandidate(task, clock.now())!
  expect(candidate).toMatchObject({ sourceId: task.id, reason: 'explicit_follow_up', confidence: 1 })
  await runtime.close()

  runtime = createRuntime()
  scope = runtime.open(options)
  const presented: string[] = []
  const notifier = () => new ReminderNotifications(cliMessages.vi.tasks, 'vi', async (text, tasks) => {
    presented.push(text)
    await runtime.mentionCommitments(options, tasks)
  })
  clock.set(recoveryTime === '09:00' ? '2026-10-23T08:59:00+07:00' : '2026-10-23T10:30:00+07:00')
  let scheduler = await runtime.reminders(directory, notifier(), (error) => {
    throw error
  })
  expect(presented).toHaveLength(recoveryTime === '09:00' ? 0 : 1)
  clock.set(`2026-10-23T${recoveryTime}:00+07:00`)
  await scheduler.refresh()
  await scheduler.refresh()
  expect(presented).toHaveLength(1)
  expect(presented[0]).toContain('phần refresh token tới đâu rồi?')
  expect((await (await scope.tasks()).find(task.id)).followUp).toMatchObject({ promptCount: 1, lastPromptedAt: new Date(clock.now()).toISOString() })
  expect(events).toHaveLength(2)
  expect(events.every(event => event.timestamp === new Date(clock.now()).toISOString())).toBe(true)
  expect(events.find(event => event.type === 'proactive.prompted')).toMatchObject({ candidateId: candidate.id })
  await runtime.close()

  for (let restart = 0; restart < 3; restart++) {
    runtime = createRuntime()
    scope = runtime.open(options)
    scheduler = await runtime.reminders(directory, notifier(), (error) => {
      throw error
    })
    await scheduler.refresh()
    expect(presented).toHaveLength(1)
    if (restart < 2)
      await runtime.close()
  }
  const unrelated = runtime.open({ ...options, sessionId: randomUUID() })
  await unrelated.send(await runtime.createChat(directory), 'Xong rồi.', {})
  expect((await (await scope.tasks()).find(task.id)).status).toBe('pending')
  await scope.send(await runtime.createChat(directory), 'Xong rồi.', {})
  expect((await (await scope.tasks()).find(task.id))).toMatchObject({ status: 'completed', followUp: { promptCount: 1, resolvedAt: new Date(clock.now()).toISOString() } })
  const index = await RecallIndex.open(directory)
  try {
    expect(JSON.parse(index.memory.current(directory, 'episodic', `commitment:${task.id}`)!.body).status).toBe('completed')
  }
  finally { index.close() }
  clock.set('2026-10-24T12:00:00+07:00')
  await scheduler.refresh()
  expect(presented).toHaveLength(1)
}, 15_000)
