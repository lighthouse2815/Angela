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
