import process from 'node:process'

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Tasks } from '@angela/companion/tasks'
import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

const children: ReturnType<typeof spawn>[] = []
const directories: string[] = []
afterEach(async () => {
  await Promise.all(children.splice(0).map(async (child) => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await once(child, 'close')
    }
  }))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it.each(['reminder', 'follow_up'] as const)('fences simultaneous %s claims from two OS processes and prevents replay after acknowledgment', async (type) => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-process-'))
  directories.push(directory)
  const now = Date.parse('2026-10-17T10:00:00Z')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now)
  const task = await tasks.create({ title: 'One delivery owner', type, dueAt: new Date(now).toISOString() })
  const fixture = join(directory, 'claim.mts')
  await writeFile(fixture, `
import process from 'node:process'
import { Tasks } from ${JSON.stringify(fileURLToPath(import.meta.resolve('@angela/companion/tasks')))}
const tasks = new Tasks(${JSON.stringify(directory)}, ${JSON.stringify(cliMessages.en.tasks)}, () => ${now})
process.on('message', async () => {
  try {
    const task = await tasks.claim(${JSON.stringify(task.id)}, ${JSON.stringify(task.dueAt)})
    process.send({ status: 'result', token: task?.delivery?.token })
  }
  catch (error) {
    process.send({ status: 'busy', message: error.message })
  }
})
process.send({ status: 'ready' })
`)
  await Promise.all(Array.from({ length: 2 }, async () => {
    const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx')), fixture], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    children.push(child)
    expect((await once(child, 'message'))[0]).toEqual({ status: 'ready' })
  }))
  const claim = async () => await Promise.all(children.map(async (child) => {
    const result = once(child, 'message')
    child.send('claim')
    return (await result)[0] as { status: string, token?: string, message?: string }
  }))
  const results = await claim()
  const owners = results.filter(result => result.token)
  expect(owners).toHaveLength(1)
  for (const result of results) {
    if (result.status === 'busy')
      expect(result.message).toBe(cliMessages.en.tasks.locked)
  }
  expect(await tasks.delivered(task.id, owners[0]!.token!)).toBe(true)
  expect((await claim()).filter(result => result.token)).toEqual([])
  expect((await tasks.find(task.id)).delivery?.status).toBe('delivered')
}, 20_000)

it('recovers an abandoned task writer after an OS-process crash and delivers the persisted occurrence once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-crashed-writer-'))
  directories.push(directory)
  const now = Date.parse('2026-10-23T09:00:00+07:00')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now)
  const task = await tasks.create({ title: 'Survive a crashed writer', type: 'reminder', dueAt: new Date(now).toISOString() })
  const fixture = join(directory, 'writer.mts')
  const source = (name: string) => JSON.stringify(fileURLToPath(import.meta.resolve(`@angela/companion/${name}`)))
  await writeFile(fixture, `
import process from 'node:process'
import { MemoryFile } from ${source('memory-file')}
import { taskState } from ${source('task-schema')}
const file = new MemoryFile(${JSON.stringify(join(directory, 'tasks'))}, 'tasks', taskState, () => ({ version: 1, tasks: [] }), { invalid: 'invalid', locked: 'locked' })
await file.edit(async () => {
  process.send({ state: 'locked' })
  await new Promise(() => {})
})
`)
  const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx')), fixture], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  children.push(child)
  expect((await once(child, 'message'))[0]).toEqual({ state: 'locked' })
  child.kill('SIGKILL')
  await once(child, 'close')
  const { ReminderScheduler } = await import('@angela/companion/reminder-scheduler')
  const failures: unknown[] = []
  let presentations = 0
  const scheduler = new ReminderScheduler(new Tasks(directory, cliMessages.en.tasks, () => now), { notify: async () => {
    presentations++
  } }, error => failures.push(error))
  try {
    await scheduler.start()
    await scheduler.refresh()
    expect(failures).toHaveLength(0)
    expect(presentations).toBe(1)
    expect((await tasks.find(task.id)).delivery?.status).toBe('delivered')
    expect((await tasks.find(task.id)).title).toBe(task.title)
  }
  finally {
    await scheduler.close()
  }
}, 20_000)
