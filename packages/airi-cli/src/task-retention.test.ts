import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Tasks } from './tasks'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-retention-'))
  directories.push(directory)
  let now = Date.parse('2026-10-17T10:00:00Z')
  const tasks = new Tasks(directory, cliMessages.en.tasks, () => now++, 'Asia/Ho_Chi_Minh')
  return { directory, tasks, path: join(directory, 'tasks', 'tasks.json') }
}

it('creates active work after more than 100 completed or cancelled tasks and prunes the oldest inactive first', async () => {
  const { tasks } = await setup()
  const inactive: string[] = []
  for (let index = 0; index < 125; index++) {
    const task = await tasks.create({ title: `History ${index}`, type: 'todo' })
    inactive.push(task.id)
    if (index % 2)
      await tasks.complete(task.id)
    else
      await tasks.cancel(task.id)
  }
  const active = await tasks.create({ title: 'New active', type: 'reminder' })
  const all = await tasks.list({ status: 'all' })
  expect(all.filter(task => task.status !== 'pending').map(task => task.id).sort()).toEqual(inactive.slice(-50).sort())
  expect(await tasks.find(active.id)).toMatchObject({ status: 'pending' })
}, 20_000)

it('preserves pending tasks even when they are older than every inactive record', async () => {
  const { tasks } = await setup()
  const pending = await Promise.all(Array.from({ length: 10 }, (_, index) => tasks.create({ title: `Pending ${index}`, type: 'todo' })))
  for (let index = 0; index < 70; index++) {
    const task = await tasks.create({ title: `Finished ${index}`, type: 'todo' })
    await tasks.complete(task.id)
  }
  expect((await tasks.list()).map(task => task.id).sort()).toEqual(pending.map(task => task.id).sort())
  expect(await tasks.list({ status: 'all' })).toHaveLength(60)
})

it('prunes an existing large history under the writer lock before creating new active work', async () => {
  const { tasks, path } = await setup()
  const template = await tasks.create({ title: 'Template', type: 'todo' })
  const history = Array.from({ length: 110 }, (_, index) => ({ ...template, id: randomUUID(), status: 'completed', updatedAt: new Date(Date.parse(template.updatedAt) + index).toISOString() }))
  await writeFile(path, JSON.stringify({ version: 1, tasks: history }))
  const active = await tasks.create({ title: 'After large history', type: 'todo' })
  expect(await tasks.list()).toMatchObject([{ id: active.id }])
  expect((await tasks.list({ status: 'all' })).filter(task => task.status !== 'pending').map(task => task.id).sort()).toEqual(history.slice(-50).map(task => task.id).sort())
})

it('never overwrites corrupted storage during retention cleanup', async () => {
  const { tasks, path } = await setup()
  await tasks.create({ title: 'Keep', type: 'todo' })
  await writeFile(path, '{broken history')
  await expect(tasks.create({ title: 'New', type: 'todo' })).rejects.toThrow(cliMessages.en.tasks.invalid)
  expect(await readFile(path, 'utf8')).toBe('{broken history')
})

it('uses stable IDs to break timestamp ties and preserves every pending task at the capacity boundary', async () => {
  const { tasks, path } = await setup()
  const active = await tasks.create({ title: 'Active', type: 'todo' })
  const history = Array.from({ length: 55 }, () => ({ ...active, id: randomUUID(), status: 'cancelled' }))
  await writeFile(path, JSON.stringify({ version: 1, tasks: [active, ...history] }))
  await tasks.create({ title: 'New work', type: 'todo' })
  const retained = (await tasks.list({ status: 'all' })).filter(task => task.status !== 'pending')
  expect(retained.map(task => task.id).sort()).toEqual(history.map(task => task.id).sort().slice(-50))
  expect(await tasks.find(active.id)).toMatchObject({ status: 'pending' })
})

it('keeps concurrent create and complete atomic, with explicit busy errors for competing writers', async () => {
  const { directory, tasks } = await setup()
  const pending = await Promise.all(Array.from({ length: 12 }, (_, index) => tasks.create({ title: `Pending ${index}`, type: 'todo' })))
  const other = new Tasks(directory, cliMessages.en.tasks)
  const results = await Promise.allSettled([
    ...pending.map(task => tasks.complete(task.id)),
    ...pending.map(task => other.create({ title: `New ${task.title}`, type: 'todo' })),
  ])
  for (const result of results) {
    if (result.status === 'rejected')
      expect(result.reason).toMatchObject({ message: cliMessages.en.tasks.locked })
  }
  const all = await tasks.list({ status: 'all' })
  expect(new Set(all.map(task => task.id)).size).toBe(all.length)
  expect(all.filter(task => task.status === 'completed')).toHaveLength(results.slice(0, pending.length).filter(result => result.status === 'fulfilled').length)
  expect(all.filter(task => task.title.startsWith('New '))).toHaveLength(results.slice(pending.length).filter(result => result.status === 'fulfilled').length)
  for (const task of pending)
    expect(await tasks.find(task.id)).toBeDefined()
})

it('prunes only history at the active capacity boundary and rejects extra active work without deleting pending tasks', async () => {
  const { tasks, path } = await setup()
  const template = await tasks.create({ title: 'Pending', type: 'todo' })
  const pending = Array.from({ length: 99 }, () => ({ ...template, id: randomUUID() }))
  const history = { ...template, id: randomUUID(), status: 'completed' }
  await writeFile(path, JSON.stringify({ version: 1, tasks: [...pending, history] }))
  const created = await tasks.create({ title: 'Hundredth pending', type: 'todo' })
  expect(await tasks.list()).toHaveLength(100)
  expect(await tasks.list({ status: 'completed' })).toEqual([])
  const original = await readFile(path, 'utf8')
  await expect(tasks.create({ title: 'Over capacity', type: 'todo' })).rejects.toThrow()
  expect(await readFile(path, 'utf8')).toBe(original)
  expect(await tasks.find(created.id)).toBeDefined()
})
