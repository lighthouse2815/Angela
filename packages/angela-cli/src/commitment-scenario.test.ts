import type { GenerationProvider } from '@angela/provider-inference'

import type { Clock } from './clock'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { chatMessagesToTurns } from '@angela/core-agent'
import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

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

it('runs conversation → disk → restart → reminder → snooze → reminder → complete → current memory without model calls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-scenario-'))
  const runtimes: AngelaRuntime[] = []
  resources.push({ directory, runtimes })
  const clock = new FakeClock(Date.parse('2026-10-22T08:00:00+07:00'))
  const provider: GenerationProvider = { generation: () => {
    throw new Error('This supported commitment flow requires no model request')
  } }
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
  const notifications = new ReminderNotifications(cliMessages.vi.tasks, 'vi', (text) => {
    presented.push(text)
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
  await scope.send(restoredChat, 'Xong rồi.', {})
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
