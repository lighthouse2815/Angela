import type { CompanionBegin } from '../../../../shared/eventa/companion-runtime'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CompanionRecords } from '@angela/companion/companion'
import { AngelaRuntime } from '@angela/companion/runtime'
import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { DesktopCompanionRuntime } from './runtime'

const directories: string[] = []
const hosts: DesktopCompanionRuntime[] = []
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-desktop-runtime-'))
  directories.push(directory)
  const host = new DesktopCompanionRuntime({ ANGELA_DATA_DIR: directory, ANGELA_WORKSPACE: directory })
  hosts.push(host)
  const input: CompanionBegin = { requestId: 'request', sessionId: 'session', characterId: 'default', text: 'Explain loops', history: [] }
  return { host, input, directory }
}
afterEach(async () => {
  for (const host of hosts.splice(0))
    await host.close()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('uses the linked Telegram record source and main-owned runtime tools', async () => {
  const { host, input, directory } = await setup()
  const telegram = await CompanionRecords.open(directory, directory)
  try {
    await telegram.execute({ type: 'learning.save', text: 'Explain through examples', category: 'preference' })
  }
  finally { telegram.close() }
  const ready = await host.begin(7, input)
  expect(ready.kind).toBe('generate')
  if (ready.kind !== 'generate')
    throw new Error('Generation expected')
  expect(ready.context).toContain('Explain through examples')
  expect(ready.tools.map(tool => tool.function.name)).toContain('companion_memory')
  await host.observe(7, input.requestId, { type: 'text-delta', text: 'Here is an example.' })
  await host.finish(7, input.requestId, false, false)
})

it('binds tool calls to the requesting window and rejects tools outside that request', async () => {
  const { host, input } = await setup()
  await host.begin(7, input)
  await expect(host.executeTool(8, input.requestId, 'personal_memory', {})).rejects.toThrow('another window')
  await expect(host.executeTool(7, input.requestId, 'not_a_tool', {})).rejects.toThrow('not available')
  await host.finish(7, input.requestId, true, false)
})

it('returns direct task replies, cancels active requests, and permits a fresh retry', async () => {
  const { host, input } = await setup()
  const ready = await host.begin(7, { ...input, text: 'Mai 9h nhắc tôi học LINQ.' })
  expect(ready.kind).toBe('reply')
  await host.finish(7, input.requestId, false, false)
  expect((await host.begin(7, input)).kind).toBe('generate')
  await host.disconnect(7)
  expect((await host.begin(7, input)).kind).toBe('generate')
  await host.finish(7, input.requestId, true, false)
})

it('lists and updates shared tasks for the desktop settings page', async () => {
  const { host } = await setup()
  const created = await host.tasks('default', { type: 'create', input: { title: 'Review desktop tasks', type: 'todo' } })
  expect(created.task?.title).toBe('Review desktop tasks')
  expect(created.tasks).toHaveLength(1)
  const id = created.task!.id
  const completed = await host.tasks('default', { type: 'complete', id })
  expect(completed.task?.status).toBe('completed')
  expect(completed.tasks[0].status).toBe('completed')
  const all = await host.tasks('default', { type: 'list' })
  expect(all.tasks).toHaveLength(1)
})

it('edits schedules, snoozes and cancels tasks without changing another character', async () => {
  const { host, directory } = await setup()
  const created = await host.tasks('default', { type: 'create', input: { title: 'Review', type: 'reminder', dueDate: '2030-10-27' } })
  const id = created.task!.id
  const updated = await host.tasks('default', { type: 'update', id, changes: { title: 'Review chapter two', dueDate: null, dueAt: '2030-10-28T09:00:00+07:00' } })
  expect(updated.task?.dueDate).toBeUndefined()
  expect(updated.task?.dueAt).toBe('2030-10-28T02:00:00.000Z')
  const until = new Date(Date.now() + 60_000).toISOString()
  expect((await host.tasks('default', { type: 'snooze', id, until })).task?.snoozedUntil).toBe(until)
  expect((await host.tasks('other', { type: 'list' })).tasks).toEqual([])
  await expect(host.tasks('other', { type: 'cancel', id })).rejects.toThrow()
  expect((await host.tasks('default', { type: 'cancel', id })).task?.status).toBe('cancelled')
  const restarted = new DesktopCompanionRuntime({ ANGELA_DATA_DIR: directory, ANGELA_WORKSPACE: directory })
  hosts.push(restarted)
  expect((await restarted.tasks('default', { type: 'list' })).tasks[0]).toMatchObject({ id, title: 'Review chapter two', status: 'cancelled' })
})

it('keeps a recurring task pending after a check-in and validates its schedule', async () => {
  const { host } = await setup()
  await expect(host.tasks('default', { type: 'create', input: { title: 'Invalid routine', type: 'routine' } })).rejects.toThrow()
  const result = await host.tasks('default', { type: 'create', input: { title: 'Weekly review', type: 'routine', timezone: 'Asia/Ho_Chi_Minh', dueAt: '2030-10-28T09:00:00+07:00', recurrence: { type: 'weekly', interval: 1, daysOfWeek: [1, 3] } } })
  const checked = await host.tasks('default', { type: 'complete', id: result.task!.id })
  expect(checked.task?.status).toBe('pending')
  expect(checked.task?.completedAt).toBeDefined()
  expect(checked.task!.dueAt! > result.task!.dueAt!).toBe(true)
  await expect(host.tasks('default', { type: 'snooze', id: result.task!.id, until: '2020-01-01T00:00:00Z' })).rejects.toThrow()
  await expect(host.tasks('default', { type: 'complete', id: '../../tasks' })).rejects.toThrow()
})

it('delivers explicit reminders with proactive companion disabled', async () => {
  const { host } = await setup()
  const snapshot = await host.records('default', { type: 'read' })
  expect(snapshot.snapshot.companion.enabled).toBe(false)
  const created = await host.tasks('default', { type: 'create', input: { title: 'Explicit UI reminder', type: 'reminder', dueAt: new Date(Date.now() - 1000).toISOString() } })
  let token: string | undefined
  await expect.poll(async () => {
    const notice = await host.reminders(7, { characterId: 'default', sessionId: 'ui-session', available: true })
    token = notice?.token ?? token
    return notice?.text
  }).toContain('Explicit UI reminder')
  await host.reminders(7, { characterId: 'default', sessionId: 'ui-session', available: false, receipt: { token: token!, shown: true } })
  await expect.poll(async () => (await host.tasks('default', { type: 'list' })).tasks.find(task => task.id === created.task?.id)?.delivery?.status).toBe('delivered')
})

it('keeps characters isolated and carries protected-history privacy across requests', async () => {
  const { host, input } = await setup()
  await host.records('other', { type: 'learning.save', category: 'preference', text: 'Private character fact' })
  const ready = await host.begin(7, { ...input, history: [], protectedHistory: true })
  if (ready.kind !== 'generate')
    throw new Error('Generation expected')
  expect(ready.context).not.toContain('Private character fact')
  expect(ready.context).toContain('Request privacy: user-request')
  expect(ready.tools.map(tool => tool.function.name)).not.toContain('companion_memory')
  await host.finish(7, input.requestId, true, false)
})

it('acknowledges a task reminder only after a desktop presentation receipt', async () => {
  const { host, input } = await setup()
  await host.records('default', { type: 'companion.enabled', value: true })
  const ready = await host.begin(7, { ...input, text: 'Mai 9h nhắc tôi học LINQ.' })
  expect(ready.kind).toBe('reply')
  await host.finish(7, input.requestId, false, false)
  // A separate runtime models a Telegram/CLI process scheduling an explicit reminder in the shared owner root.
  const runtime = new AngelaRuntime('unused', { generation: () => {
    throw new Error('No generation expected')
  } }, cliMessages.en)
  try {
    const tasks = await runtime.tasks(host.dataDir)
    const task = await tasks.create({ title: 'Shared reminder', type: 'reminder', dueAt: new Date(Date.now() - 1000).toISOString() })
    let notice: { token: string, text: string } | null = null
    await expect.poll(async () => {
      notice = await host.reminders(7, { characterId: 'default', sessionId: input.sessionId, available: true })
      return notice?.text
    }).toContain('Shared reminder')
    expect((await tasks.find(task.id)).delivery?.status).toBe('claimed')
    const token = (notice as { token: string, text: string } | null)?.token
    if (!token)
      throw new Error('Missing delivery token')
    await host.reminders(7, { characterId: 'default', sessionId: input.sessionId, available: false, receipt: { token, shown: true } })
    await expect.poll(async () => (await tasks.find(task.id)).delivery?.status).toBe('delivered')
    await host.disconnect(7)
    expect(await host.reminders(7, { characterId: 'default', sessionId: input.sessionId, available: false })).toBeNull()
  }
  finally { await runtime.close() }
})
