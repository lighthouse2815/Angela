import type { Clock } from './clock'

import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@angela/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { extractOpenLoop } from './open-loop-extraction'
import { OpenLoops } from './open-loops'
import { requestPrivacy } from './privacy-policy'
import { Tasks } from './tasks'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-loops-'))
  directories.push(directory)
  let now = Date.parse('2026-10-23T10:00:00Z')
  const clock: Clock = { now: () => now }
  const changes: string[] = []
  const loops = new OpenLoops(directory, cliMessages.en.tasks, clock, (change) => {
    changes.push(change.type)
    throw new Error('observer failure')
  })
  const notice = async (text: string, workspace = directory) => await loops.notice(extractOpenLoop(text, now, 'UTC')!, workspace, randomUUID(), requestPrivacy(text))
  return { directory, loops, notice, changes, clock, advance: (hours: number) => {
    now += hours * 3_600_000
  } }
}
it('deduplicates aliases, persists the cap across hosts, fences claims, and reopens with a new identity', async () => {
  const { directory, loops, notice, clock, advance, changes } = await setup()
  const first = (await notice('Tao chưa fix auth.'))!
  await notice('Auth vẫn lỗi.')
  await notice('Refresh token vẫn chưa chạy.')
  expect(await loops.list()).toHaveLength(1)
  expect((await loops.list())[0]?.subject).toBe('refresh token')
  expect(await loops.claim(first.id)).toBeUndefined()
  advance(4)
  const other = new OpenLoops(directory, cliMessages.en.tasks, clock)
  const claimed = await loops.claim(first.id)
  expect(claimed?.claim).toBeDefined()
  expect(await other.claim(first.id)).toBeUndefined()
  advance(1)
  expect(await loops.present(first.id, claimed!.claim!.token)).toBe(false)
  const recovered = await other.claim(first.id)
  expect(recovered?.claim?.token).not.toBe(claimed!.claim!.token)
  expect(await other.present(first.id, recovered!.claim!.token)).toBe(true)
  for (let index = 0; index < 3; index++)
    expect(await new OpenLoops(directory, cliMessages.en.tasks, clock).claim(first.id)).toBeUndefined()
  expect((await loops.list())[0]?.promptCount).toBe(1)
  await loops.finish(first.id, directory, 'dismissed', requestPrivacy(''))
  advance(8)
  const reopened = await notice('Tao lại đang bị lỗi refresh token.')
  expect(reopened?.id).not.toBe(first.id)
  expect(reopened?.promptCount).toBe(0)
  expect(changes).toContain('open_loop.created')
  expect(changes).toContain('open_loop.dismissed')
})
it('rejects privacy, low confidence, and low salience at the store boundary', async () => {
  const { loops, directory, clock } = await setup()
  const input = extractOpenLoop('Auth vẫn lỗi.', clock.now(), 'UTC')!
  for (const privacy of [requestPrivacy('Đừng lưu chuyện này.'), requestPrivacy('password=private'), requestPrivacy('', false)])
    expect(await loops.notice(input, directory, 'session', privacy)).toBeUndefined()
  expect(await loops.notice({ ...input, confidence: 0.5 }, directory, 'session', requestPrivacy(''))).toBeUndefined()
  expect(await loops.notice({ ...input, salience: 0.1 }, directory, 'session', requestPrivacy(''))).toBeUndefined()
  expect(await loops.list()).toEqual([])
})
it('suppresses an equivalent task before delivery and keeps workspace dedupe isolated', async () => {
  const { loops, notice, directory, clock, advance } = await setup()
  const first = await notice('Auth vẫn lỗi.')
  await notice('Auth vẫn lỗi.', 'other-workspace')
  expect(await loops.list()).toHaveLength(2)
  const tasks = new Tasks(directory, cliMessages.en.tasks, clock, 'UTC')
  const task = await tasks.create({ title: 'fix auth', type: 'reminder', dueAt: '2026-10-24T09:00:00Z' })
  await loops.reconcile([task])
  expect((await loops.list()).find(loop => loop.id === first?.id)).toMatchObject({ state: 'dismissed', supersededByTaskId: task.id })
  advance(5)
  expect(await loops.claim(first!.id)).toBeUndefined()
  expect((await tasks.find(task.id)).status).toBe('pending')
})
it('bounds active loops, rejects excess admission, expires and prunes inactive records', async () => {
  const { loops, notice, advance, directory } = await setup()
  for (let index = 0; index < 51; index++)
    await notice(`Tao chưa fix topic ${index}.`)
  expect((await loops.list()).filter(loop => loop.state === 'open')).toHaveLength(50)
  advance(49)
  await loops.noteActivity()
  expect((await loops.list()).filter(loop => loop.state === 'open')).toHaveLength(0)
  expect((await loops.list()).length).toBeLessThanOrEqual(30)
  advance(24 * 8)
  await loops.noteActivity()
  expect(await loops.list()).toHaveLength(0)
  expect((await readFile(join(directory, 'open-loops', 'state.json'))).length).toBeLessThan(128_000)
})
it('preserves corrupted storage and leaves tasks usable', async () => {
  const { loops, notice, directory, clock } = await setup()
  await notice('Auth vẫn lỗi.')
  const path = join(directory, 'open-loops', 'state.json')
  await writeFile(path, 'broken')
  await expect(loops.list()).rejects.toThrow()
  await expect(notice('Auth vẫn lỗi.')).rejects.toThrow()
  expect(await readFile(path, 'utf8')).toBe('broken')
  const task = await new Tasks(directory, cliMessages.en.tasks, clock).create({ title: 'Independent', type: 'todo' })
  expect(task.status).toBe('pending')
})
