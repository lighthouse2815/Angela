import process from 'node:process'

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cliMessages } from '@proj-airi/i18n/cli'
import { afterEach, expect, it } from 'vitest'

import { Sessions } from './sessions'

const directories: string[] = []
const children: ReturnType<typeof spawn>[] = []
afterEach(async () => {
  await Promise.all(children.splice(0).map(async (child) => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await once(child, 'close')
    }
  }))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

it('recovers a killed session owner once, preserves its request, and refuses a live owner', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-session-recovery-'))
  directories.push(directory)
  const id = randomUUID()
  const fixture = join(directory, 'owner.mts')
  await writeFile(fixture, `
import process from 'node:process'
import { Sessions } from ${JSON.stringify(fileURLToPath(new URL('./sessions.ts', import.meta.url)))}
const session = await new Sessions(${JSON.stringify(directory)}, ${JSON.stringify(cliMessages.en)}).open('/workspace', ${JSON.stringify(id)})
const now = new Date().toISOString()
await session.save({ turns: [] }, true, { id: ${JSON.stringify(randomUUID())}, text: 'Do this once', status: 'running', startedAt: now, updatedAt: now, progress: 'Tool might have run' })
process.send('ready')
setInterval(() => {}, 1000)
`)
  const child = spawn(process.execPath, ['--import', fileURLToPath(import.meta.resolve('tsx')), fixture], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  children.push(child)
  expect((await once(child, 'message'))[0]).toBe('ready')
  const sessions = new Sessions(directory, cliMessages.en)
  await expect(sessions.open('/workspace', id, { recoverAbandoned: true })).rejects.toThrow(cliMessages.en.sessionLocked)
  child.kill('SIGKILL')
  await once(child, 'close')
  await expect(sessions.open('/workspace', id)).rejects.toThrow(cliMessages.en.sessionLocked)
  const results = await Promise.allSettled([
    sessions.open('/workspace', id, { recoverAbandoned: true }),
    new Sessions(directory, cliMessages.en).open('/workspace', id, { recoverAbandoned: true }),
  ])
  const owners = results.filter(result => result.status === 'fulfilled')
  expect(owners).toHaveLength(1)
  const session = owners[0].value
  expect(session.record.request?.text).toBe('Do this once')
  expect(session.record.request?.progress).toBe('Tool might have run')
  await expect(sessions.open('/workspace', id, { recoverAbandoned: true })).rejects.toThrow(cliMessages.en.sessionLocked)
  await session.close()
}, 15_000)

it.each(['', '{broken', JSON.stringify({ pid: process.pid, hostname: hostname() }), JSON.stringify({ pid: 2147483647, hostname: 'another-host' })])('preserves unknown or live lock ownership: %s', async (source) => {
  const directory = await mkdtemp(join(tmpdir(), 'angela-lock-preserve-'))
  directories.push(directory)
  const id = randomUUID()
  const path = join(directory, `${id}.lock`)
  await writeFile(path, source)
  await expect(new Sessions(directory, cliMessages.en).open('/workspace', id, { recoverAbandoned: true })).rejects.toThrow(cliMessages.en.sessionLocked)
  expect(await readFile(path, 'utf8')).toBe(source)
})
