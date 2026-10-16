import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Memory } from './memory'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'angela-personal-memory-'))
  directories.push(directory)
  return { directory, memory: new Memory(directory, cliMessages.en), path: join(directory, 'memory', 'personal.json') }
}

it('loads empty memory without creating files and shares records across independent sessions', async () => {
  const { memory, directory, path } = await setup()
  expect(await memory.read()).toMatchObject({ enabled: true, entries: [] })
  expect(await readdir(directory)).toEqual([])
  const id = await memory.remember('Tôi thích trả lời bằng tiếng Việt')
  const other = new Memory(directory, cliMessages.en)
  expect((await other.read()).entries).toEqual([expect.objectContaining({ id, text: 'Tôi thích trả lời bằng tiếng Việt' })])
  expect((await stat(path)).mode & 0o777).toBe(0o600)
  expect((await stat(join(directory, 'memory'))).mode & 0o777).toBe(0o700)
  expect(await readdir(join(directory, 'memory'))).toEqual(['personal.json'])
})

it('deduplicates exact facts, updates by id, and preserves creation time', async () => {
  const { memory } = await setup()
  const id = await memory.remember('Tôi thích câu trả lời ngắn')
  const createdAt = (await memory.read()).entries[0]!.createdAt
  expect(await memory.remember('  Tôi thích câu trả lời ngắn  ')).toBe(id)
  await memory.remember('Tôi thích giải thích chi tiết', id)
  expect((await memory.read()).entries).toEqual([expect.objectContaining({ id, createdAt, text: 'Tôi thích giải thích chi tiết' })])
  await expect(memory.remember('Thay đổi', 'missing')).rejects.toThrow(cliMessages.en.memoryMissing)
})

it('enforces record and text limits without overwriting existing data', async () => {
  const { memory } = await setup()
  await expect(memory.remember(' ')).rejects.toThrow(cliMessages.en.memoryText)
  await expect(memory.remember('a'.repeat(501))).rejects.toThrow(cliMessages.en.memoryText)
  for (let i = 0; i < 50; i++)
    await memory.remember(`Sở thích ${i}`)
  await expect(memory.remember('Ghi nhớ thứ 51')).rejects.toThrow(cliMessages.en.memoryLimit)
  expect((await memory.read()).entries).toHaveLength(50)
})

it('persists disabled mode, omits context and tools, and still permits deletion', async () => {
  const { memory, directory } = await setup()
  const id = await memory.remember('Tôi thích tiếng Việt')
  await memory.setEnabled(false)
  const next = new Memory(directory, cliMessages.en)
  expect(await next.context()).toBe('')
  expect(await next.tools('Xin nhớ')).toEqual([])
  await expect(next.remember('Thông tin mới')).rejects.toThrow(cliMessages.en.memoryDisabled)
  expect((await next.read()).entries).toHaveLength(1)
  await next.forget(id)
  await next.setEnabled(true)
  expect((await next.read()).entries).toEqual([])
})

it('preserves corrupt storage and refuses writes until it is repaired', async () => {
  const { memory, path } = await setup()
  await memory.setEnabled(true)
  await writeFile(path, '{corrupt personal data')
  await expect(memory.read()).rejects.toThrow(cliMessages.en.memoryInvalid)
  await expect(memory.remember('New fact')).rejects.toThrow(cliMessages.en.memoryInvalid)
  expect(await readFile(path, 'utf8')).toBe('{corrupt personal data')
})

it('refuses a concurrent writer instead of replacing another process edits', async () => {
  const { memory, directory, path } = await setup()
  await memory.remember('Original')
  const original = await readFile(path, 'utf8')
  await writeFile(join(directory, 'memory', 'personal.lock'), 'another writer')
  await expect(new Memory(directory, cliMessages.en).remember('Concurrent')).rejects.toThrow(cliMessages.en.memoryLocked)
  expect(await readFile(path, 'utf8')).toBe(original)
})

it('handles explicit commands and keeps unrelated chat out of the command path', async () => {
  const { memory } = await setup()
  expect(await memory.command('Xin chào')).toBeUndefined()
  expect(await memory.command('/remember Tôi thích tiếng Việt')).toContain(cliMessages.en.memorySaved)
  const id = (await memory.read()).entries[0]!.id
  expect(await memory.command('/memory')).toContain(id)
  expect(await memory.command(`/memory edit ${id} Tôi thích trả lời ngắn`)).toContain(cliMessages.en.memorySaved)
  expect(await memory.command('/memory off')).toBe(cliMessages.en.memoryDisabled)
  expect(await memory.command(`/forget ${id}`)).toBe(cliMessages.en.memoryForgotten)
  expect(await memory.command('/memory on')).toBe(cliMessages.en.memoryEnabled)
  expect(await memory.command('/memory invalid')).toBe(cliMessages.en.memoryUsage)
})

it('requires a verbatim current-turn fact and rejects inferred or external content', async () => {
  const { memory } = await setup()
  const [tool] = await memory.tools('Nhớ tôi thích tiếng Việt')
  const execute = tool!.execute!
  const options = { messages: [], toolCallId: 'memory-test' }
  const call = { action: 'remember', id: null, text: 'tôi thích tiếng Việt', source_quote: 'not in this turn' }
  expect(await execute(call, options)).toMatchObject({ status: 'rejected' })
  expect(await execute({ ...call, source_quote: 'tôi thích tiếng Việt', text: 'Tôi sống ở Hà Nội' }, options)).toMatchObject({ status: 'rejected' })
  expect((await memory.read()).entries).toHaveLength(0)
  expect(await execute({ ...call, source_quote: 'tôi thích tiếng Việt' }, options)).toMatchObject({ status: 'saved' })
  expect((await memory.read()).entries[0]!.text).toBe('tôi thích tiếng Việt')
})

it('does not write on cancellation and rechecks disabled mode for stale tools', async () => {
  const { memory } = await setup()
  const controller = new AbortController()
  const [tool] = await memory.tools('Nhớ tôi thích tiếng Việt')
  const call = { action: 'remember', id: null, text: 'tôi thích tiếng Việt', source_quote: 'tôi thích tiếng Việt' }
  controller.abort()
  await expect(tool!.execute!(call, { messages: [], toolCallId: 'memory-test', abortSignal: controller.signal })).rejects.toThrow()
  expect((await memory.read()).entries).toHaveLength(0)
  await memory.setEnabled(false)
  expect(await tool!.execute!(call, { messages: [], toolCallId: 'memory-test' })).toMatchObject({ status: 'rejected' })
})

it('keeps model forget requests scoped to an existing id with current user evidence', async () => {
  const { memory } = await setup()
  const id = await memory.remember('Tôi thích câu ngắn')
  const other = await memory.remember('Tôi dùng Linux')
  const [tool] = await memory.tools('Quên câu ngắn')
  expect(await tool!.execute!({ action: 'forget', id, text: null, source_quote: 'Quên câu ngắn' }, { messages: [], toolCallId: 'memory-test' })).toMatchObject({ status: 'deleted', id })
  expect((await memory.read()).entries.map(entry => entry.id)).toEqual([other])
})

it('rejects a stale edit when another session changes the reviewed record', async () => {
  const { memory, directory } = await setup()
  const id = await memory.remember('Old preference')
  await new Memory(directory, cliMessages.en).remember('Changed in another session', id)
  await expect(memory.remember('Proposed preference', id, 'Old preference')).rejects.toThrow(cliMessages.en.memoryChanged)
  await expect(memory.forget(id, 'Old preference')).rejects.toThrow(cliMessages.en.memoryChanged)
  expect((await memory.read()).entries[0]!.text).toBe('Changed in another session')
})

it('defaults to automatic selection for existing records without rewriting the file', async () => {
  const { memory, path } = await setup()
  const id = await memory.remember('Tôi tên là Đăng')
  const state = await memory.read()
  const stored = JSON.stringify({ version: 1, enabled: true, entries: state.entries })
  await writeFile(path, stored)
  expect((await memory.read()).autoEnabled).toBe(true)
  expect(await readFile(path, 'utf8')).toBe(stored)
  const context = await memory.context()
  expect(context).toContain('Automatic personal memory is enabled')
  expect(context).toContain('Tôi tên là Đăng')
  expect(context).toContain(id)
  expect(context).not.toContain('createdAt')
  expect(context).not.toContain('updatedAt')
})

it('persists explicit-request mode while retaining saved facts and independent memory controls', async () => {
  const { memory, directory } = await setup()
  await memory.remember('Tôi tên là Đăng')
  expect(await memory.command('/memory auto off')).toBe(cliMessages.en.memoryRequested)
  const other = new Memory(directory, cliMessages.en)
  expect((await other.read()).autoEnabled).toBe(false)
  expect(await other.context()).toContain('Save or update facts only when the user explicitly asks')
  expect(await other.context()).toContain('Tôi tên là Đăng')
  const [tool] = await other.tools('Nhớ tôi thích tiếng Việt')
  expect(tool!.function.description).toContain('only when the user explicitly asks')
  await other.setEnabled(false)
  expect(await other.context()).toBe('')
  await other.setEnabled(true)
  expect((await other.read()).autoEnabled).toBe(false)
  expect(await other.command('/memory')).toContain(cliMessages.en.memoryRequested)
  expect(await other.command('/memory auto on')).toBe(cliMessages.en.memoryAutomatic)
})

it('rejects a stale automatic tool after another session disables automatic selection', async () => {
  const { memory, directory } = await setup()
  const [tool] = await memory.tools('Tôi tên là Đăng')
  await new Memory(directory, cliMessages.en).setAutomatic(false)
  expect(await tool!.execute!({ action: 'remember', id: null, text: 'Tôi tên là Đăng', source_quote: 'Tôi tên là Đăng' }, { messages: [], toolCallId: 'automatic-stale' })).toMatchObject({ status: 'rejected', reason: cliMessages.en.memoryChanged })
  expect((await memory.read()).entries).toHaveLength(0)
})

it('serializes parallel facts from one model turn and continues after a failed edit', async () => {
  const { memory } = await setup()
  const ids = await Promise.all(['Tôi tên là Đăng', 'Tôi dùng Linux', 'Tôi thích tiếng Việt'].map(text => memory.remember(text)))
  expect((await memory.read()).entries).toHaveLength(3)
  expect(new Set(ids).size).toBe(3)
  await expect(memory.forget('missing')).rejects.toThrow(cliMessages.en.memoryMissing)
  await memory.remember('Tôi thích câu ngắn')
  expect((await memory.read()).entries).toHaveLength(4)
})
